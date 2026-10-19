import { count, list, SessionError, startSession } from "./core/api.js";
import { brainProblem, ctx, loadApplications, loadFits, mine, storedProfile, useProfile } from "./core/context.js";
import { $, h, isTyping } from "./core/dom.js";
import { ago, parseDate } from "./core/format.js";
import { clickSpark } from "./core/fx.js";
import { createPalette } from "./core/palette.js";
import { busy as collecting, mascot, mountBrand } from "./core/mascot.js";
import { listen } from "./core/realtime.js";
import { createRouter } from "./core/router.js";
import { createSidebar } from "./core/sidebar.js";
import areas from "./views/areas.js";
import companies from "./views/companies.js";
import guide from "./views/guide.js";
import history from "./views/history.js";
import job from "./views/job.js";
import jobs from "./views/jobs.js";
import leads from "./views/leads.js";
import live from "./views/live.js";
import marathon from "./views/marathon.js";
import mind from "./views/mind.js";
import outbox from "./views/outbox.js";
import settings from "./views/settings.js";
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

const ROUTES = [
  ["inicio", overview],
  ["buscar", search],
  ["buscar/:id", searchRun],
  ["vagas", jobs],
  ["vaga/:id", job],
  ["maratona", marathon],
  ["curriculo", resume],
  ["mente", mind],
  ["envios", outbox],
  ["config", settings],
  ["leads", leads],
  ["guia", guide],
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

// sessão local venceu (8h): pega outra e recarrega, sem pedir nada
addEventListener("unhandledrejection", (event) => {
  if (event.reason instanceof SessionError) startSession().then(() => location.reload());
});

async function refreshClaude() {
  const problem = await brainProblem(true).catch(() => "Não deu pra falar com o brain");
  const node = $("[data-claude]");
  node.classList.toggle("is-stale", Boolean(problem));
  node.title = problem ?? "As funções de IA usam o Claude Code logado neste PC";
  node.lastElementChild.textContent = problem ? "Claude indisponível" : "Claude pronto";
}

async function refreshCounts() {
  const since = `'${new Date(Date.now() - 864e5).toISOString().replace("T", " ")}'`;
  const [fresh, active, alerts, review, ready] = await Promise.all([
    count("jobs", `status = 'open' && firstSeenAt >= ${since}`),
    count("applications", mine("stage != 'contratado' && stage != 'encerrada' && stage != 'recusada'")),
    count("searches", mine("saved = true && found > 0 && (seenAt = '' || finishedAt > seenAt)")),
    count("mind_facts", mine("status = 'pendente'")),
    count("messages", mine("status = 'pronta'")),
  ]);
  setCount("envios", ready);
  setCount("mente", review);
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

function mountProfiles() {
  const slot = $("[data-profiles]");
  slot.hidden = ctx.profiles.length < 2;
  const select = h(
    "select",
    { className: "side__profile", "aria-label": "Perfil ativo" },
    ctx.profiles.map((item) => h("option", { value: item.id, selected: item.id === ctx.profile?.id }, item.name || "Sem nome")),
  );
  // ponytail: trocar de perfil recarrega a página, mais simples que invalidar cada tela
  select.addEventListener("change", () => (useProfile(select.value), location.reload()));
  slot.replaceChildren(select);
}

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
      ["Novo perfil", () => welcome({ force: true, fresh: true }), "user"],
      ["Alternar claro / escuro", () => window.radarTheme.set({ mode: document.documentElement.dataset.mode === "dark" ? "light" : "dark" }), "sparkle"],
      ["Configurações e temas", () => (location.hash = "#config"), "gear"],
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
  $("[data-shell]").hidden = false;
  ctx.profiles = (await list("profile", { perPage: 50 })).items;
  const profile = ctx.profiles.find((item) => item.id === storedProfile()) ?? ctx.profiles[0] ?? null;
  ctx.profile = profile;
  mountProfiles();
  const name = profile?.name || "Seu perfil";
  $("[data-user]").textContent = name;
  document.querySelectorAll("[data-user-initial]").forEach((node) => (node.textContent = name.charAt(0).toUpperCase()));
  await Promise.all([loadApplications(), loadFits().catch(() => {})]);
  ctx.refreshCounts = () => refreshCounts().catch(() => {});

  initChrome();
  createRouter(ROUTES, $("[data-outlet]"), { fallback: lost, onChange: highlight }).start();
  await Promise.all([refreshCounts(), refreshPulse(), refreshClaude()]);
  watchLive();
  if (!profile) welcome();

  setInterval(() => {
    if (!document.hidden) Promise.all([refreshCounts(), refreshPulse(), refreshClaude()]).catch(() => {});
  }, POLL_MS);
}

mountBrand();
clickSpark();
startSession()
  .then(open)
  .catch(() => document.body.append(h("p", { className: "boot-error" }, "O painel do Radar não respondeu. Feche e abra o app de novo.")));
