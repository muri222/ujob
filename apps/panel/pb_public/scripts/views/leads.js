import { api, list, quote, update } from "../core/api.js";
import { STATES } from "../core/catalog.js";
import { brainProblem, ctx, mine } from "../core/context.js";
import { h, header, icon, toast } from "../core/dom.js";
import { ago, number } from "../core/format.js";
import { loadCities } from "../core/places.js";
import { listen } from "../core/realtime.js";

// estimativas pra pessoa decidir antes de gastar: Apify cobra por lugar; Claude navegando gasta tokens da assinatura
const APIFY_USD_PER_PLACE = 0.004;
const CLAUDE_TOKENS_PER_COMPANY = 3000; // medido: ~2,5 mil por empresa com WebSearch no Sonnet
const JOB_FIT_TOKENS = 6000;

const CAMPAIGN = { buscando: ["Buscando…", "tag tag--brand"], enriquecendo: ["Lendo os sites…", "tag tag--brand"], pronta: ["Pronta", "tag tag--ok"], erro: ["Falhou", "tag tag--down"] };
const SOURCE = { osm: "OpenStreetMap", apify: "Google Maps (Apify)", claude: "Claude na web" };

export default async function leads(root, { signal }) {
  if (!ctx.profile) {
    root.append(header("Leads", null), h("div", { className: "empty card" }, h("strong", {}, "Crie seu perfil primeiro"), "Cada perfil tem as próprias campanhas."));
    return;
  }
  const [{ items: packs }, integrations] = await Promise.all([list("segment_packs", { sort: "name", perPage: 50 }), api("radar/integrations").catch(() => ({ apify: {} }))]);

  const pack = h("select", { "aria-label": "Segmento" }, packs.map((item) => h("option", { value: item.id }, item.name)));
  const state = h("select", { "aria-label": "Estado" }, h("option", { value: "" }, "Todo o Brasil"), Object.entries(STATES).map(([code, label]) => h("option", { value: code, selected: code === ctx.profile.state }, label)));
  const city = h("input", { placeholder: "Cidade (opcional)", list: "leads-cities", maxLength: 80 });
  const cities = h("datalist", { id: "leads-cities" });
  const fillCities = async () => cities.replaceChildren(...(await loadCities()).filter((item) => !state.value || item.state === state.value).slice(0, 900).map((item) => h("option", { value: item.name })));
  state.addEventListener("change", () => ((city.value = ""), fillCities()));
  fillCities();
  const limit = h("input", { type: "number", min: 1, max: 200, value: 30 });

  let source = "osm";
  const estimate = h("p", { className: "leads__estimate" });
  const options = h("div", { className: "leads__sources" });
  function paintSources() {
    const n = Math.max(1, Number(limit.value) || 30);
    const choices = [
      ["osm", "OpenStreetMap", "Grátis, roda no seu PC. Bom pra indústria e comércio que aparecem no mapa. Pode achar menos empresas.", true],
      ["apify", "Google Maps via Apify", integrations.apify?.connected ? `Usa seus créditos da Apify (o plano grátis dá US$ 5 por mês). Estimativa: ≈ US$ ${(n * APIFY_USD_PER_PLACE).toFixed(2)}.` : "Conecte sua conta da Apify em Configurações pra usar.", integrations.apify?.connected],
      ["claude", "Claude pesquisando na web", `Gasta bastante da sua assinatura: ≈ ${number(Math.min(n, 30) * CLAUDE_TOKENS_PER_COMPANY)} tokens (umas ${Math.round((Math.min(n, 30) * CLAUDE_TOKENS_PER_COMPANY) / JOB_FIT_TOKENS)} notas de vaga). Use quando o mapa não achar. Máximo 30.`, true],
    ];
    options.replaceChildren(
      ...choices.map(([key, title, text, enabled]) =>
        h(
          "button",
          { type: "button", className: `leads__source${key === "claude" ? " is-costly" : ""}`, "aria-pressed": String(source === key), disabled: !enabled, onclick: () => ((source = key), paintSources()) },
          h("strong", {}, key === "claude" ? [icon("sparkle"), " ", title] : title),
          h("span", {}, text),
        ),
      ),
    );
    estimate.textContent = source === "osm" && !state.value ? "No OpenStreetMap escolha pelo menos o estado." : "";
  }
  limit.addEventListener("input", paintSources);
  state.addEventListener("change", paintSources);
  paintSources();

  const go = h("button", { className: "btn btn--primary" }, icon("radar"), "Buscar empresas");
  go.addEventListener("click", async () => {
    if (source === "claude") {
      const problem = await brainProblem(true);
      if (problem) return toast(problem);
    }
    go.disabled = true;
    try {
      const { campaign } = await api("radar/campaigns", { method: "POST", body: { profile: ctx.profile.id, pack: pack.value, state: state.value, city: city.value.trim(), source, limit: limit.value } });
      selected = campaign;
      await loadCampaigns();
    } catch (error) {
      toast(error.message);
    } finally {
      go.disabled = false;
    }
  });

  const campaignsBox = h("div", { className: "leads__campaigns" });
  const leadsBox = h("div", { className: "leads__list" });
  let selected = null;

  function leadRow(lead) {
    const s = lead.signals ?? {};
    const contacts = [
      lead.email && h("a", { className: "tag", href: `mailto:${lead.email}` }, icon("mail"), lead.email),
      lead.phone && h("span", { className: "tag" }, icon("phone"), lead.phone),
      lead.instagram && h("a", { className: "tag", href: `https://instagram.com/${lead.instagram}`, target: "_blank", rel: "noopener noreferrer" }, "@", lead.instagram),
      s.socials?.linkedin && h("a", { className: "tag", href: `https://linkedin.com/${s.socials.linkedin}`, target: "_blank", rel: "noopener noreferrer" }, "LinkedIn"),
      s.careers && h("a", { className: "tag tag--brand", href: s.careers, target: "_blank", rel: "noopener noreferrer" }, "Carreiras"),
    ].filter(Boolean);
    return h(
      "li",
      { className: `lead${lead.status === "descartado" ? " is-closed" : ""}` },
      h(
        "div",
        { className: "lead__body" },
        h("p", { className: "lead__name" }, lead.website ? h("a", { href: lead.website, target: "_blank", rel: "noopener noreferrer" }, lead.name, " ", icon("external")) : lead.name),
        h("small", {}, [lead.city && `${lead.city}${lead.state ? `/${lead.state}` : ""}`, lead.origin, s.description || s.title].filter(Boolean).join(" · ")),
        contacts.length ? h("p", { className: "lead__contacts" }, contacts) : lead.status === "enriquecendo" ? h("small", { className: "fit__ai" }, h("span", { className: "spinner" }), "lendo o site…") : h("small", {}, s.error || s.blocked || "Sem contato público achado"),
      ),
      lead.status !== "descartado" ? h("button", { className: "icon-btn", title: "Descartar", "aria-label": "Descartar", onclick: () => update("leads", lead.id, { status: "descartado" }).then(loadLeads) }, icon("trash")) : null,
    );
  }

  async function loadLeads() {
    if (!selected) return leadsBox.replaceChildren();
    const { items } = await list("leads", { filter: mine(`campaign = ${quote(selected)}`), sort: "status,name", perPage: 300 }).catch(() => ({ items: [] }));
    leadsBox.replaceChildren(
      items.length
        ? h("ul", { className: "rows rows--plain" }, items.map(leadRow))
        : h("div", { className: "empty card" }, h("strong", {}, "Nenhum lead nessa campanha ainda"), "Assim que a busca terminar, eles aparecem aqui."),
    );
  }

  async function loadCampaigns() {
    const { items } = await list("campaigns", { filter: mine(), sort: "-createdAt", perPage: 30, expand: "pack" }).catch(() => ({ items: [] }));
    selected ??= items[0]?.id ?? null;
    campaignsBox.replaceChildren(
      ...(items.length
        ? items.map((item) => {
            const [label, tone] = CAMPAIGN[item.status] ?? CAMPAIGN.pronta;
            return h(
              "button",
              { type: "button", className: "leads__campaign", "aria-pressed": String(item.id === selected), onclick: () => ((selected = item.id), loadCampaigns()) },
              h("strong", {}, item.name),
              h("small", {}, `${SOURCE[item.source]} · ${number(item.found || 0)} empresas · ${ago(item.createdAt)}`),
              h("span", { className: tone }, label),
              item.error ? h("small", { className: "fit__err" }, item.error) : null,
            );
          })
        : [h("p", { className: "leads__estimate" }, "Nenhuma campanha ainda. Comece pelo OpenStreetMap: é grátis.")]),
    );
    await loadLeads();
  }

  root.append(
    header("Leads", "Ache empresas pra prospectar. Mapa grátis primeiro; o Claude entra só quando valer a pena."),
    h(
      "section",
      { className: "panel" },
      h("header", { className: "section__head" }, h("h2", {}, "Nova campanha"), h("small", {}, "Contatos saem do site de cada empresa, lidos no seu PC sem gastar token")),
      h("div", { className: "leads__form" }, pack, state, city, cities, h("label", { className: "leads__limit" }, "até", limit, "empresas")),
      options,
      h("div", { className: "import__row" }, go, estimate),
    ),
    h("div", { className: "leads__grid" }, h("section", { className: "panel" }, h("header", { className: "section__head" }, h("h2", {}, "Campanhas")), campaignsBox), h("section", { className: "panel" }, h("header", { className: "section__head" }, h("h2", {}, "Empresas")), leadsBox)),
  );

  let timer;
  const soon = () => (clearTimeout(timer), (timer = setTimeout(loadCampaigns, 800)));
  listen("campaigns", ({ record }) => record.profile === ctx.profile.id && soon(), signal);
  listen("leads", ({ record }) => record.campaign === selected && soon(), signal);
  await loadCampaigns();
}
