#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::hash_map::RandomState;
use std::fs::{self, File};
use std::hash::{BuildHasher, Hasher};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const PANEL: &str = "127.0.0.1:8096";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

// ponytail: app pessoal, a raiz do Radar fica fixa na compilação; RADAR_HOME troca se mudar de pasta
fn home() -> PathBuf {
    std::env::var("RADAR_HOME")
        .map(PathBuf::from)
        // sem canonicalize: o caminho \\?\ dele quebra o SQLite do PocketBase
        .unwrap_or_else(|_| Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().parent().unwrap().to_path_buf())
}

// 32 hex com semente aleatória do sistema (RandomState); serve pras contas locais do scout e do brain
fn secret() -> String {
    (0..2).map(|i| { let mut h = RandomState::new().build_hasher(); h.write_u8(i); format!("{:016x}", h.finish()) }).collect()
}

const SECRETS: [&str; 3] = ["SCOUT_PASSWORD", "BRAIN_PASSWORD", "RADAR_SECRET"];

// cria o .env a partir do exemplo na primeira vez e completa segredo vazio ou faltando (versões novas trazem chaves novas)
fn ensure_env(root: &Path) {
    let path = root.join(".env");
    let base = fs::read_to_string(&path).or_else(|_| fs::read_to_string(root.join(".env.example"))).unwrap_or_default();
    let mut lines: Vec<String> = base
        .lines()
        .map(|line| match line.strip_suffix('=') {
            Some(key) if SECRETS.contains(&key) => format!("{line}{}", secret()),
            _ => line.to_string(),
        })
        .collect();
    for key in SECRETS {
        if !lines.iter().any(|line| line.starts_with(&format!("{key}="))) {
            lines.push(format!("{key}={}", secret()));
        }
    }
    let filled = lines.join("\n") + "\n";
    if filled != base {
        let _ = fs::write(path, filled);
    }
}

fn env_file(root: &Path) -> Vec<(String, String)> {
    fs::read_to_string(root.join(".env"))
        .unwrap_or_default()
        .lines()
        .filter(|line| !line.trim_start().starts_with('#'))
        .filter_map(|line| line.split_once('='))
        .map(|(key, value)| (key.trim().to_string(), value.trim().trim_matches('"').to_string()))
        .collect()
}

fn panel_up() -> bool {
    let Ok(mut stream) = TcpStream::connect_timeout(&PANEL.parse().unwrap(), Duration::from_millis(500)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let request = format!("GET /api/health HTTP/1.0\r\nHost: {PANEL}\r\n\r\n");
    let mut reply = String::new();
    stream.write_all(request.as_bytes()).is_ok() && stream.read_to_string(&mut reply).is_ok() && reply.lines().next().is_some_and(|status| status.contains(" 200 "))
}

fn spawn(root: &Path, env: &[(String, String)], dir: &str, program: &str, args: &[&str], log: &str) -> Option<Child> {
    let out = File::create(root.join(log)).ok()?;
    Command::new(program)
        .args(args)
        .current_dir(root.join(dir))
        .envs(env.iter().cloned())
        .env("PYTHONUTF8", "1")
        .stdout(out.try_clone().ok()?)
        .stderr(out)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .ok()
}

// sobe painel, scout e brain; se o painel já está no ar (INICIAR.bat), não sobe nada e não derruba nada
fn start_services() -> Vec<Child> {
    if panel_up() {
        return vec![];
    }
    let root = home();
    ensure_env(&root);
    let env = env_file(&root);
    let panel_exe = root.join("apps/panel/pocketbase.exe");
    let panel_exe = panel_exe.to_string_lossy();
    [
        spawn(&root, &env, "apps/panel", &panel_exe, &["serve", &format!("--http={PANEL}")], ".panel.log"),
        spawn(&root, &env, "services/scout", "uv", &["run", "python", "-m", "ujob_scout.scheduler"], ".scout.log"),
        spawn(&root, &env, "services/brain", "uv", &["run", "python", "-m", "brain.worker"], ".brain.log"),
    ]
    .into_iter()
    .flatten()
    .collect()
}

// uv abre o python como filho: mata a árvore inteira
fn stop_services(children: &mut Vec<Child>) {
    for child in children.drain(..) {
        let _ = Command::new("taskkill")
            .args(["/T", "/F", "/PID", &child.id().to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
}

// só http(s), mailto e tel: nada de file:// ou esquema estranho vindo de página de vaga
fn open_outside(url: &str) {
    let ok = ["http://", "https://", "mailto:", "tel:"].iter().any(|scheme| url.starts_with(scheme));
    if ok {
        let _ = Command::new("rundll32").args(["url.dll,FileProtocolHandler", url]).creation_flags(CREATE_NO_WINDOW).spawn();
    }
}

fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let url = format!("http://{PANEL}/").parse().unwrap();
    let _ = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
        // link de vaga, site, mailto, WhatsApp: abre no navegador/app padrão do Windows, não dentro do Radar
        .on_new_window(|url, _| {
            open_outside(url.as_str());
            NewWindowResponse::Deny
        })
        .on_navigation(|url| {
            let inside = url.scheme() == "http" && url.host_str() == Some("127.0.0.1");
            if !inside && url.scheme() != "about" && url.scheme() != "data" && url.scheme() != "blob" {
                open_outside(url.as_str());
                return false;
            }
            true
        })
        .title("Radar")
        .inner_size(1360.0, 860.0)
        .min_inner_size(720.0, 520.0)
        .build();
}

fn main() {
    let app = tauri::Builder::default()
        .manage(Mutex::new(Vec::<Child>::new()))
        // a bandeja seguraria o app vivo: fechar a janela encerra tudo, como pede o F0.6
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                window.app_handle().exit(0);
            }
        })
        .setup(|app| {
            *app.state::<Mutex<Vec<Child>>>().lock().unwrap() = start_services();

            let open = MenuItem::with_id(app, "open", "Abrir o Radar", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Radar")
                .menu(&Menu::with_items(app, &[&open, &quit])?)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } = event {
                        show(tray.app_handle());
                    }
                })
                .build(app)?;

            let handle = app.handle().clone();
            thread::spawn(move || {
                let started = Instant::now();
                while !panel_up() && started.elapsed() < Duration::from_secs(30) {
                    thread::sleep(Duration::from_millis(300));
                }
                let app = handle.clone();
                let _ = handle.run_on_main_thread(move || show(&app));
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("não deu pra abrir o Radar");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            stop_services(&mut app.state::<Mutex<Vec<Child>>>().lock().unwrap());
        }
    });
}
