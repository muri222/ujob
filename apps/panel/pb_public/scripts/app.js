import { count, list, login, refresh, SessionError } from "./core/api.js";
import { ctx, loadApplications } from "./core/context.js";
import { $, h, isTyping } from "./core/dom.js";
import { ago, parseDate } from "./core/format.js";
import { clickSpark, dotGrid } from "./core/fx.js";
import { createPalette } from "./core/palette.js";
import { busy as collecting, lookAt, mascot, mountBrand, shy } from "./core/mascot.js";
import { listen } from "./core/realtime.js";
import { createRouter } from "./core/router.js";
import { session } from "./core/session.js";
import { createSidebar } from "./core/sidebar.js";
import areas from "./views/areas.js";
import companies from "./views/companies.js";
import history from "./views/history.js";
import job from "./views/job.js";
import jobs from "./views/jobs.js";
import live from "./views/live.js";
import marathon from "./views/marathon.js";
import overview from "./views/overview.js";
import pipeline from "./views/pipeline.js";
import resume from "./views/resume.js";
import saved from "./views/saved.js";
import search from "./views/search.js";
import searchRun from "./views/search-run.js";
import sources from "./views/sources.js";
import { welcome } from "./views/welcome.js";

const POLL_MS = 60_000;
const STALE_MINUTES = 45;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 60_000;

const ROUTES = [
  ["inicio", overview],
  ["buscar", search],
  ["buscar/:id", searchRun],
  ["vagas", jobs],
  ["vaga/:id", job],
  ["maratona", marathon],
  ["curriculo", resume],
  ["ao-vivo", live],
  ["empresas", companies],
  ["areas", areas],
  ["funil", pipeline],
  ["alertas", saved],
  ["fontes", sources],
  ["historico", history],
];
const NAV_KEY = { "buscar/:id": "buscar", "vaga/:id": "vagas" };

const lost = (root) =>
  root.append(h("div", { className: "lost" }, mascot("mark"), h("strong", {}, "404"), h("p", {}, "Essa página foi preenchida por outro candidato."), h("a", { className: "btn btn--primary", href: "#inicio" }, "Voltar pro início")));

const setCount = (key, value) => document.querySelectorAll(`[data-count="${key}"]`).forEach((node) => (node.textContent = value ? (value > 999 ? "999+" : value) : ""));

function showLogin(message) {
  session.clear();
  $("[data-shell]").hidden = true;
  $("[data-gate]").hidden = false;
  $("[data-gate-message]").textContent = message ?? "";
}

addEventListener("unhandledrejection", (event) => {
  if (event.reason instanceof SessionError) showLogin("Sua sessão expirou. Entra de novo.");
});

async function refreshCounts() {
  const since = `'${new Date(Date.now() - 864e5).toISOString().replace("T", " ")}'`;
  const [fresh, active, alerts] = await Promise.all([
    count("jobs", `status = 'open' && firstSeenAt >= ${since}`),
    count("applications", "stage != 'contratado' && stage != 'encerrada'"),
    count("searches", "saved = true && found > 0 && (seenAt = '' || finishedAt > seenAt)"),
  ]);
  setCount("vagas", fresh);
  setCount("funil", active);
  setCount("alertas", alerts);
}

async function refreshPulse() {
  const { items } = await list("runs", { sort: "-finishedAt", perPage: 1, fields: "finishedAt" });
  const last = items[0]?.finishedAt;
  const minutes = last ? (Date.now() - parseDate(last)) / 60000 : Infinity;
  const pulse = $("[data-pulse]");
  pulse.classList.toggle("is-stale", minutes > STALE_MINUTES);
  pulse.lastElementChild.textContent = last ? `Última coleta ${ago(last)}` : "Aguardando a primeira coleta";
}

function watchLive() {
  const dot = $("[data-live-dot]");
  const pulse = $("[data-pulse]");
  let timer;
  const busy = (text) => {
    collecting(true);
    dot.classList.add("is-on");
    pulse.classList.add("is-busy");
    pulse.classList.remove("is-stale");
    pulse.lastElementChild.textContent = text;
    clearTimeout(timer);
    timer = setTimeout(() => {
      collecting(false);
      dot.classList.remove("is-on");
      pulse.classList.remove("is-busy");
      refreshPulse().catch(() => {});
    }, 20_000);
  };
  listen("runs", ({ record }) => busy(record.created ? `+${record.created} vagas agora` : "Coletando agora"));
  listen("searches", ({ record }) => record.status === "running" && busy(`Buscando ${record.found ? `· ${record.found} achadas` : "agora"}`));
}

let sidebar;

function highlight(pattern) {
  const key = NAV_KEY[pattern] ?? pattern.split("/")[0];
  for (const link of document.querySelectorAll("[data-link]")) link.toggleAttribute("aria-current", link.dataset.link === key);
  sidebar.sync();
  sidebar.close();
}

function initChrome() {
  const palette = createPalette({
    actions: [
      ["Ajustar meu perfil", () => welcome({ force: true }), "user"],
      ["Sair", () => showLogin("Até a próxima vaga."), "logout"],
    ],
  });
  sidebar = createSidebar();
  document.querySelectorAll("[data-palette-open]").forEach((button) =>
    button.addEventListener("click", () => {
      sidebar.close();
      palette.open();
    }),
  );

  addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      palette.open();
    } else if (event.key.toLowerCase() === "b" && !isTyping(event)) {
      location.hash = "#buscar";
    }
  });
}

async function open() {
  $("[data-gate]").hidden = true;
  $("[data-shell]").hidden = false;
  const email = session.user()?.email ?? "";
  $("[data-user]").textContent = email;
  $("[data-user-initial]").textContent = email.charAt(0).toUpperCase();

  const [profile] = await Promise.all([list("profile", { perPage: 1 }).then(({ items }) => items[0] ?? null), loadApplications()]);
  ctx.profile = profile;
  ctx.refreshCounts = () => refreshCounts().catch(() => {});

  initChrome();
  createRouter(ROUTES, $("[data-outlet]"), { fallback: lost, onChange: highlight }).start();
  await Promise.all([refreshCounts(), refreshPulse()]);
  watchLive();
  if (!profile) welcome();

  setInterval(() => {
    if (!document.hidden) Promise.all([refreshCounts(), refreshPulse()]).catch(() => {});
  }, POLL_MS);
  session.watchIdle(() => showLogin("Ficou 30 minutos parado. Por segurança, entra de novo."));
}

function watchEyes(form) {
  const face = form.querySelector(".mascot");
  if (!face) return;
  const follow = () => {
    const box = form.email.getBoundingClientRect();
    lookAt(face, { x: box.left + Math.min(form.email.value.length * 8 + 12, box.width - 10), y: box.top + box.height / 2 });
  };
  form.email.addEventListener("focus", follow);
  form.email.addEventListener("input", follow);
  form.email.addEventListener("blur", () => lookAt(face, null));
  form.password.addEventListener("focus", () => shy(face, true));
  form.password.addEventListener("input", () => shy(face, true));
  form.password.addEventListener("blur", () => shy(face, false));
}

function initLogin() {
  const form = $("[data-login]");
  const message = $("[data-gate-message]");
  watchEyes(form);
  const attempts = () => Number(sessionStorage.getItem("login:attempts") ?? 0);
  const lockedUntil = () => Number(sessionStorage.getItem("login:locked") ?? 0);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");

    if (lockedUntil() > Date.now()) {
      message.textContent = `Calma. Respira. Tenta de novo em ${Math.ceil((lockedUntil() - Date.now()) / 1000)}s.`;
      return;
    }

    button.disabled = true;
    try {
      if (form.company.value) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        throw new Error();
      }
      await login(form.email.value.trim(), form.password.value);
      sessionStorage.removeItem("login:attempts");
      location.reload();
    } catch {
      const tries = attempts() + 1;
      sessionStorage.setItem("login:attempts", tries);
      if (tries >= MAX_ATTEMPTS) {
        sessionStorage.setItem("login:locked", Date.now() + LOCK_MS);
        sessionStorage.removeItem("login:attempts");
        message.textContent = "Errou demais. Um minuto de castigo.";
      } else {
        message.textContent = "E-mail ou senha não batem.";
      }
    } finally {
      button.disabled = false;
    }
  });

  document.querySelectorAll("[data-logout]").forEach((button) => button.addEventListener("click", () => showLogin("Até a próxima vaga.")));
}

mountBrand();
clickSpark();
dotGrid($("[data-gate]"));
initLogin();
if (session.valid()) {
  refresh()
    .then(open)
    .catch(() => showLogin());
} else {
  showLogin();
}
