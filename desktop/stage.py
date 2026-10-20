"""Monta desktop/src-tauri/payload/app com o que o instalador leva: painel, serviços Python e o uv.

Uso: python desktop/stage.py  (o build do Tauri roda isto sozinho, ver tauri.conf.json > beforeBuildCommand)"""

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "desktop" / "src-tauri" / "payload" / "app"
SKIP = shutil.ignore_patterns(".venv", "__pycache__", ".pytest_cache", ".scrapy", "tests", "*.log", "*.pyc", ".ruff_cache")


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    panel = OUT / "apps" / "panel"
    panel.mkdir(parents=True)
    shutil.copy2(ROOT / "apps" / "panel" / "pocketbase.exe", panel)
    for folder in ("pb_hooks", "pb_migrations", "pb_public"):
        shutil.copytree(ROOT / "apps" / "panel" / folder, panel / folder, ignore=SKIP)
    for service in ("scout", "brain"):
        shutil.copytree(ROOT / "services" / service, OUT / "services" / service, ignore=SKIP)
    shutil.copy2(ROOT / ".env.example", OUT)
    uv = shutil.which("uv")
    if not uv:
        raise SystemExit("uv não encontrado no PATH (precisa pra empacotar)")
    (OUT / "bin").mkdir()
    shutil.copy2(uv, OUT / "bin" / "uv.exe")
    size = sum(path.stat().st_size for path in OUT.rglob("*") if path.is_file())
    print(f"payload pronto: {size / 1e6:.0f} MB em {OUT}")


if __name__ == "__main__":
    main()
