import { count, create, list, SessionError, startSession } from "./core/api.js";
import { askClaude, brainProblem, ctx, loadApplications, loadFits, mine, storedProfile, useProfile } from "./core/context.js";
import { $, h, icon, isTyping, modal, toast } from "./core/dom.js";
import { ago, parseDate } from "./core/format.js";
import { clickSpark } from "./core/fx.js";
import { createPalette } from "./core/palette.js";
import { busy as collecting, mascot, mountBrand } from "./core/mascot.js";
import { listen } from "./core/realtime.js";
import { createRouter } from "./core/router.js";
import { createSidebar } from "./core/sidebar.js";
import areas from "./views/areas.js";
import chat from "./views/chat.js";
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
import preferences from "./views/preferences.js";
import autoapply from "./views/autoapply.js";
import kits from "./views/kits.js";
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
  ["preferencias", preferences],
  ["auto", autoapply],
  ["kits", kits],
  ["leads", leads],
  ["guia", guide],
  ["claude", chat],
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

// "Suas funções" (igual AiApply): cada função tem CV, preferências, buscas, funil e painel próprios
const CV_FIELDS = ["name", "headline", "email", "phone", "about", "skills", "experiences", "education", "languages", "links", "city", "state", "letter", "template"];
const PREF_FIELDS = ["prefs", "answers", "countries", "workplace", "salary", "seniority", "sendMode", "threshold", "dailyCap", "kind"];

async function newFunction() {
  const current = ctx.profile;
  const name = h("input", { required: true, maxLength: 60, placeholder: "Ex.: Editor de Vídeo, Designer Gráfico" });
  const check = (label, on) => h("label", { className: "check" }, h("input", { type: "checkbox", checked: on }), h("span", {}, label));
  const prefs = check("Preferências (modo, locais, salário, respostas)", true);
  const cv = check("Currículo", true);
  const dialog = h(
    "dialog",
    { className: "confirm" },
    h(
      "form",
      { method: "dialog" },
      h("p", {}, h("strong", {}, "Nova função"), h("br"), h("small", {}, "Se candidata a mais de um tipo de vaga? Crie uma função pra cada uma e tenha resultados mais certeiros.")),
      h("label", { className: "field" }, h("span", {}, "Nome da função"), name),
      current ? h("div", { className: "field" }, h("span", {}, `O que copiar de ${current.label || "Principal"}?`), prefs, cv) : null,
      h("div", { className: "confirm__actions" }, h("button", { className: "btn btn--ghost", value: "no", formNoValidate: true }, "Cancelar"), h("button", { className: "btn btn--primary", value: "yes" }, "Criar")),
    ),
  );
  if (!(await modal(dialog, (value) => value === "yes"))) return;
  const body = { label: name.value.trim(), kind: "pessoa", sendMode: "revisao", threshold: 70, dailyCap: 10 };
  if (current) {
    for (const key of prefs.querySelector("input").checked ? PREF_FIELDS : []) body[key] = current[key];
    // cargos e rejeições são da função; o resto (locais, salário, respostas) vem junto
    if (body.prefs) body.prefs = { ...body.prefs, roles: [], rejects: { roles: [], skills: [] } };
    for (const key of cv.querySelector("input").checked ? CV_FIELDS : ["name", "email", "phone"]) body[key] = current[key];
  }
  // cargos da função nova saem do nome dela (Haiku, ~10 s); sem Claude, a pessoa preenche nas Preferências
  if (!(await brainProblem())) {
    toast("Montando os cargos da função com o Claude…");
    const found = await askClaude("job_query", { text: `Vagas de ${body.label}`, perfil: { headline: current?.headline, skills: current?.skills } }, { timeout: 60_000 }).catch(() => null);
    if (found) body.prefs = { ...(body.prefs ?? {}), roles: found.terms };
  }
  try {
    const record = await create("profile", body);
    useProfile(record.id);
    location.hash = "#preferencias?aba=vaga";
    location.reload();
  } catch {
    toast("Não deu pra criar a função.");
  }
}

function mountProfiles() {
  const slot = $("[data-profiles]");
  slot.hidden = false;
  const label = (item) => item.label || "Principal";
  const menu = h(
    "div",
    { className: "side__fn-menu" },
    h("p", { className: "side__group" }, "Suas funções"),
    ctx.profiles.map((item) =>
      h(
        "button",
        // ponytail: trocar de função recarrega a página, mais simples que invalidar cada tela
        { type: "button", className: "side__fn-item", "aria-current": String(item.id === ctx.profile?.id), onclick: () => (useProfile(item.id), location.reload()) },
        h("span", {}, label(item)),
        item.id === ctx.profile?.id ? icon("check") : null,
      ),
    ),
    h("button", { type: "button", className: "side__fn-item side__fn-add", onclick: () => ((details.open = false), newFunction()) }, icon("plus"), h("span", {}, "Adicionar outra função")),
  );
  const details = h("details", { className: "side__fn" }, h("summary", {}, h("small", {}, "Sua função"), h("span", { className: "side__fn-name" }, ctx.profile ? label(ctx.profile) : "Criar função"), icon("down")), menu);
  addEventListener("click", (event) => details.open && !details.contains(event.target) && (details.open = false));
  slot.replaceChildren(details);
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
      ["Nova função", () => newFunction(), "user"],
      ["Preferências da função", () => (location.hash = "#preferencias"), "gear"],
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
