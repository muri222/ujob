import { api, create, list, quote, update } from "../core/api.js";
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

  // dossiê + abordagem: nada é enviado sozinho nas redes; o app copia o texto e abre o link (regra 5)
  const copy = (text, done = "Copiado.") => navigator.clipboard.writeText(text).then(() => toast(done), () => toast("Não deu pra copiar."));
  const contacted = (lead, channel) =>
    Promise.all([update("leads", lead.id, { status: "contatado" }), create("audit", { profile: ctx.profile.id, action: `abordagem_${channel}`, target: lead.name, detail: { lead: lead.id } })]).then(loadLeads);
  const dossier = (lead) => api(`radar/leads/${lead.id}/dossier`, { method: "POST" }).then(loadLeads, (error) => toast(error.message));

  function leadDetail(lead) {
    const d = lead.dossier ?? {};
    const o = lead.outreach ?? {};
    if (lead.aiStatus === "gerando") return h("p", { className: "fit__ai" }, h("span", { className: "spinner" }), "Claude montando o dossiê e a abordagem…");
    if (!lead.dossier || d.error)
      return h("div", { className: "lead__detail" }, d.error ? h("p", { className: "fit__err" }, d.error) : null, h("button", { className: "btn btn--soft", onclick: () => dossier(lead) }, icon("sparkle"), d.error ? "Tentar de novo" : "Gerar dossiê e abordagem"));
    const phone = (lead.signals?.socials?.whatsapp || (lead.phone ? `55${lead.phone}` : "")).replace(/\D/g, "");
    const dmButtons = (o.dms ?? []).map((dm, index) =>
      h(
        "div",
        { className: "lead__dm" },
        h("p", {}, dm),
        h(
          "div",
          { className: "import__row" },
          h("button", { className: "btn btn--soft", onclick: () => copy(dm) }, icon("copy"), `Copiar DM ${index + 1}`),
          lead.instagram ? h("a", { className: "btn", href: `https://instagram.com/${lead.instagram}`, target: "_blank", rel: "noopener noreferrer", onclick: () => (copy(dm, "DM copiada. Cole no Instagram."), contacted(lead, "instagram")) }, "Abrir Instagram") : null,
          phone ? h("a", { className: "btn", href: `https://wa.me/${phone}?text=${encodeURIComponent(dm)}`, target: "_blank", rel: "noopener noreferrer", onclick: () => contacted(lead, "whatsapp") }, icon("whatsapp"), "Abrir WhatsApp") : null,
        ),
      ),
    );
    const emailButtons = (o.emails ?? []).map((mail, index) =>
      h(
        "div",
        { className: "lead__dm" },
        h("p", {}, h("strong", {}, mail.assunto), h("br"), mail.corpo),
        h(
          "div",
          { className: "import__row" },
          h("button", { className: "btn btn--soft", onclick: () => copy(`${mail.assunto}\n\n${mail.corpo}`) }, icon("copy"), `Copiar e-mail ${index + 1}`),
          lead.email
            ? h("button", { className: "btn", onclick: () => api(`radar/leads/${lead.id}/email`, { method: "POST", body: { variant: index } }).then(() => toast("Na fila de envio. Revise e envie de lá.", { label: "Ver", run: () => (location.hash = "#envios") }), (error) => toast(error.message)) }, icon("send"), "Mandar pra fila de envio")
            : null,
        ),
      ),
    );
    return h(
      "div",
      { className: "lead__detail" },
      h("p", { className: "fit__head" }, h("strong", {}, `Fit ${d.fit}%`), h("span", { className: `tag ${d.merece_projeto_gratuito ? "tag--ok" : ""}` }, d.merece_projeto_gratuito ? "Vale uma amostra grátis" : "Sem amostra grátis"), h("span", { className: "tag tag--brand" }, icon("sparkle"), "dossiê do Claude")),
      h("dl", { className: "lead__dossier" }, [["Diagnóstico", d.diagnostico], ["Dor provável", d.dor_provavel], ["O que oferecer", d.servico_recomendado], ["Ideia de amostra", d.ideia_preview], ["Por quê", d.motivo]].map(([term, value]) => h("div", {}, h("dt", {}, term), h("dd", {}, value)))),
      dmButtons.length ? h("h4", {}, "Mensagem direta") : null,
      dmButtons,
      emailButtons.length ? h("h4", {}, "E-mail frio") : null,
      emailButtons,
      lead.status !== "contatado" ? h("button", { className: "btn btn--ghost", onclick: () => contacted(lead, "manual") }, icon("check"), "Marcar como contatado") : h("span", { className: "tag tag--ok" }, icon("check"), "Contatado"),
    );
  }

  let opened = null;

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
      lead.status !== "descartado" ? h("button", { className: "icon-btn", title: "Dossiê e abordagem", "aria-label": "Dossiê e abordagem", onclick: () => ((opened = opened === lead.id ? null : lead.id), loadLeads()) }, icon("sparkle")) : null,
      lead.status !== "descartado" ? h("button", { className: "icon-btn", title: "Descartar", "aria-label": "Descartar", onclick: () => update("leads", lead.id, { status: "descartado" }).then(loadLeads) }, icon("trash")) : null,
      opened === lead.id ? leadDetail(lead) : null,
    );
  }

  // triagem: um lead por vez, ← descarta, → gera dossiê (mesma ideia da Maratona de vagas)
  function triage(items) {
    const queue = items.filter((lead) => ["enriquecido", "sem_site"].includes(lead.status) && !lead.dossier && lead.aiStatus !== "gerando");
    if (!queue.length) return toast("Nada pra triar nessa campanha.");
    const card = h("div", { className: "triage" });
    const close = () => (removeEventListener("keydown", keys), card.remove(), loadLeads());
    const decide = async (keep) => {
      const lead = queue.shift();
      await (keep ? dossier(lead) : update("leads", lead.id, { status: "descartado" }));
      queue.length ? paint() : close();
    };
    function paint() {
      const lead = queue[0];
      const s = lead.signals ?? {};
      card.replaceChildren(
        h("p", { className: "eyebrow" }, `${queue.length} pra triar · ← descarta · → dossiê · Esc sai`),
        h("h3", {}, lead.name),
        h("p", {}, s.description || s.title || "Sem descrição no site."),
        h("small", {}, [lead.city, lead.domain, lead.email, lead.instagram && `@${lead.instagram}`].filter(Boolean).join(" · ")),
        h("div", { className: "import__row" }, h("button", { className: "btn", onclick: () => decide(false) }, icon("skip"), "Descartar"), h("button", { className: "btn btn--primary", onclick: () => decide(true) }, icon("sparkle"), "Gerar dossiê"), h("button", { className: "btn btn--ghost", onclick: close }, "Sair")),
      );
    }
    const keys = (event) => (event.key === "ArrowLeft" ? decide(false) : event.key === "ArrowRight" ? decide(true) : event.key === "Escape" ? close() : null);
    addEventListener("keydown", keys);
    leadsBox.prepend(card);
    paint();
  }

  async function loadLeads() {
    if (!selected) return leadsBox.replaceChildren();
    const { items } = await list("leads", { filter: mine(`campaign = ${quote(selected)}`), sort: "status,name", perPage: 300 }).catch(() => ({ items: [] }));
    leadsBox.replaceChildren(
      items.length
        ? h("div", {}, h("button", { className: "btn btn--soft leads__triage", onclick: () => triage(items) }, icon("bolt"), "Triagem rápida"), h("ul", { className: "rows rows--plain" }, items.map(leadRow)))
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
