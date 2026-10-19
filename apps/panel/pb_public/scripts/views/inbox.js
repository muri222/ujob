import { api, get, list, update } from "../core/api.js";
import { askClaude, brainProblem, ctx } from "../core/context.js";
import { h, header, icon, toast } from "../core/dom.js";
import { ago } from "../core/format.js";
import { listen } from "../core/realtime.js";
import { segmented, toggle } from "../core/ui.js";

// Entrada (igual AiApply): e-mails de candidatura lidos do seu IMAP, com etiqueta, ligação ao funil e resposta sugerida
const LABELS = {
  confirmacao: ["Confirmação de candidatura", "tag--brand"],
  entrevista: ["Convite pra entrevista", "tag--ok"],
  teste: ["Teste / desafio", "tag--warn"],
  proposta: ["Proposta", "tag--ok"],
  rejeicao: ["Rejeição", "tag--down"],
  acompanhamento: ["Acompanhamento", ""],
  outro: ["Sem etiqueta", ""],
};
// etiqueta → etapa do funil sugerida
const STAGE_FOR = { confirmacao: "aplicada", entrevista: "entrevista", teste: "teste", proposta: "proposta", rejeicao: "recusada" };
const STAGE_TEXT = { aplicada: "Candidatei", entrevista: "Entrevista", teste: "Teste", proposta: "Proposta", contratado: "Contratado", recusada: "Recusada" };

export default async function inbox(root, { signal }) {
  const { items: accounts } = await list("mail_accounts", { sort: "-verifiedAt", perPage: 5 }).catch(() => ({ items: [] }));
  const account = accounts[0];
  if (!account?.verifiedAt || !account.imapHost) {
    root.append(
      header("Entrada", "As respostas das suas candidaturas, direto do seu e-mail."),
      h("div", { className: "empty card" }, h("strong", {}, "Conecte seu e-mail primeiro"), "Em Config. da conta, coloque seu e-mail e a senha de app. O Radar lê só os e-mails de candidatura (empresas pra onde você aplicou e sistemas de vagas), aqui no seu PC.", h("a", { className: "btn btn--primary", href: "#config" }, icon("gear"), "Configurar e-mail")),
    );
    return;
  }

  let folder = "entrada";
  let label = "";
  let unread = false;
  let term = "";
  let items = [];
  let current = null;
  const listBox = h("ul", { className: "mail__list" });
  const pane = h("div", { className: "mail__pane" });
  const state = h("small", { className: "settings__help" });
  const paintState = (record) => state.replaceChildren(record.syncError ? h("span", { className: "fit__err" }, record.syncError) : record.syncedAt ? `Lido ${ago(record.syncedAt)} · ${record.email}` : `Ainda não lido · ${record.email}`);
  paintState(account);

  async function load() {
    const filters = [folder === "arquivo" ? "archived = true" : "archived = false"];
    if (label) filters.push(`label = '${label}'`);
    if (unread) filters.push("read = false");
    ({ items } = await list("inbox", { filter: filters.join(" && "), sort: "-date", perPage: 200, expand: "application", fields: "id,fromEmail,fromName,subject,date,snippet,label,read,archived,application,expand.application.id,expand.application.title,expand.application.company,expand.application.stage" }));
    paintList();
  }

  function paintList() {
    const shown = items.filter((item) => !term || `${item.fromName} ${item.fromEmail} ${item.subject} ${item.snippet}`.toLowerCase().includes(term));
    listBox.replaceChildren(
      ...shown.map((item) => {
        const [text, tone] = LABELS[item.label] ?? LABELS.outro;
        return h(
          "li",
          {},
          h(
            "button",
            { type: "button", className: `mail__item${item.read ? "" : " is-unread"}${current?.id === item.id ? " is-on" : ""}`, onclick: () => openMail(item.id) },
            h("span", { className: "mail__from" }, item.fromName || item.fromEmail, h("time", {}, item.date ? ago(item.date) : "")),
            h("strong", {}, item.subject || "(sem assunto)"),
            h("small", {}, item.snippet),
            h("span", { className: "quick" }, item.label !== "outro" ? h("span", { className: `tag ${tone}` }, text) : null, item.expand?.application ? h("span", { className: "tag" }, icon("kanban"), item.expand.application.company) : null),
          ),
        );
      }),
    );
    if (!shown.length) listBox.append(h("li", {}, h("div", { className: "empty" }, h("strong", {}, "Nada por aqui"), folder === "arquivo" ? "Nenhum e-mail arquivado." : "Quando chegar resposta de candidatura, aparece aqui.")));
  }

  async function openMail(id) {
    const mail = await get("inbox", id, { expand: "application" });
    current = mail;
    if (!mail.read) {
      update("inbox", id, { read: true }).catch(() => {});
      const item = items.find((entry) => entry.id === id);
      if (item) item.read = true;
    }
    paintList();
    const app = mail.expand?.application;
    const suggested = STAGE_FOR[mail.label];
    const labelPick = h("select", { "aria-label": "Etiqueta" }, Object.entries(LABELS).map(([key, [text]]) => h("option", { value: key, selected: key === mail.label }, text)));
    labelPick.addEventListener("change", async () => {
      await update("inbox", id, { label: labelPick.value });
      const item = items.find((entry) => entry.id === id);
      if (item) item.label = labelPick.value;
      paintList();
      openMail(id);
    });
    const ai = h("div", { className: "mail__ai" });
    const paintAi = (result) =>
      ai.replaceChildren(
        h("p", {}, h("strong", {}, "Resumo: "), result.resumo),
        h("p", {}, h("strong", {}, "Próxima ação: "), result.proxima_acao),
        h("pre", { className: "auto__pre" }, result.resposta),
        h(
          "div",
          { className: "import__row" },
          h("button", { className: "btn btn--soft btn--sm", onclick: () => navigator.clipboard.writeText(result.resposta).then(() => toast("Copiado.")) }, icon("copy"), "Copiar resposta"),
          h("a", { className: "btn btn--primary btn--sm", href: `mailto:${mail.fromEmail}?subject=${encodeURIComponent(`Re: ${mail.subject}`)}&body=${encodeURIComponent(result.resposta)}` }, icon("send"), "Responder no meu e-mail"),
          app && result.etapa && result.etapa !== app.stage ? h("button", { className: "btn btn--ghost btn--sm", onclick: () => move(app, result.etapa) }, `Mover pra ${STAGE_TEXT[result.etapa]}`) : null,
        ),
      );
    if (mail.ai?.resumo) paintAi(mail.ai);
    else {
      const go = h("button", { className: "btn btn--soft" }, icon("sparkle"), "Resumir e sugerir resposta");
      go.addEventListener("click", async () => {
        const problem = await brainProblem(true);
        if (problem) return toast(problem);
        go.disabled = true;
        ai.replaceChildren(h("p", { className: "fit__ai" }, h("span", { className: "spinner" }), "Claude lendo o e-mail…"));
        try {
          const profile = ctx.profile ?? {};
          const result = await askClaude("inbox_reply", {
            email: { de: `${mail.fromName} <${mail.fromEmail}>`, assunto: mail.subject, data: mail.date, texto: mail.body.slice(0, 6000) },
            candidatura: app ? { vaga: app.title, empresa: app.company, etapa: app.stage } : {},
            cv: { name: profile.name, headline: profile.headline, email: profile.email, phone: profile.phone },
          });
          await update("inbox", id, { ai: result }).catch(() => {});
          paintAi(result);
        } catch (error) {
          ai.replaceChildren(h("p", { className: "fit__err" }, error.message), go);
          go.disabled = false;
        }
      });
      ai.replaceChildren(go);
    }
    async function move(application, stage) {
      try {
        await update("applications", application.id, { stage, ...(stage === "aplicada" && !application.appliedAt ? { appliedAt: new Date().toISOString() } : {}) });
        toast(`Movida pra ${STAGE_TEXT[stage]} no funil.`, { label: "Ver funil", run: () => (location.hash = "#funil") });
        openMail(id);
      } catch {
        toast("Não deu pra mover.");
      }
    }
    pane.replaceChildren(
      h(
        "div",
        { className: "mail__head" },
        h("h2", {}, mail.subject || "(sem assunto)"),
        h("p", { className: "settings__help" }, `${mail.fromName ? `${mail.fromName} · ` : ""}${mail.fromEmail} · ${mail.date ? new Date(mail.date.replace(" ", "T")).toLocaleString("pt-BR") : ""}`),
        h(
          "div",
          { className: "import__row" },
          labelPick,
          app ? h("a", { className: "btn btn--ghost btn--sm", href: "#funil" }, icon("kanban"), `${app.company}: ${STAGE_TEXT[app.stage] ?? app.stage}`) : null,
          app && suggested && suggested !== app.stage ? h("button", { className: "btn btn--primary btn--sm", onclick: () => move(app, suggested) }, `Mover pra ${STAGE_TEXT[suggested]}`) : null,
          h("button", { className: "btn btn--ghost btn--sm", onclick: async () => (await update("inbox", id, { archived: !mail.archived }), toast(mail.archived ? "Voltou pra Entrada." : "Arquivado."), (pane.textContent = ""), load()) }, mail.archived ? "Desarquivar" : "Arquivar"),
        ),
      ),
      ai,
      h("pre", { className: "mail__body" }, mail.body || mail.snippet),
    );
  }

  const search = h("input", { type: "search", placeholder: "Buscar e-mails" });
  search.addEventListener("input", () => ((term = search.value.trim().toLowerCase()), paintList()));
  const labelFilter = h("select", { "aria-label": "Etiqueta" }, h("option", { value: "" }, "Todas as etiquetas"), Object.entries(LABELS).map(([key, [text]]) => h("option", { value: key }, text)));
  labelFilter.addEventListener("change", () => ((label = labelFilter.value), load()));
  const refresh = h("button", { className: "btn btn--soft" }, icon("radar"), "Atualizar");
  refresh.addEventListener("click", async () => {
    refresh.disabled = true;
    try {
      const { queued } = await api("radar/inbox/sync", { method: "POST" });
      toast(queued ? "Lendo seu e-mail…" : "Já está lendo.");
    } catch (error) {
      toast(error.message);
    } finally {
      setTimeout(() => (refresh.disabled = false), 4000);
    }
  });

  root.classList.add("view--wide");
  root.append(
    header("Entrada", "As respostas das suas candidaturas, direto do seu e-mail. Só e-mails de candidatura entram aqui.", state, refresh),
    h(
      "div",
      { className: "auto__toolbar" },
      segmented([["entrada", "Entrada"], ["arquivo", "Arquivados"]], "entrada", (key) => ((folder = key), load()), "Pasta"),
      h("div", { className: "import__row" }, h("label", { className: "check" }, toggle("Só não lidas", false, (on) => ((unread = on), load())), h("span", {}, "Só não lidas")), labelFilter, search),
    ),
    h("div", { className: "mail" }, h("div", { className: "panel mail__side" }, listBox), h("div", { className: "panel mail__main" }, pane)),
  );
  pane.append(h("div", { className: "empty" }, h("strong", {}, "Escolha um e-mail"), "O Claude resume, sugere a resposta e move a vaga no funil."));
  await load();

  listen("inbox", () => load(), signal);
  listen(
    "mail_accounts",
    async ({ record }) => {
      if (record.id === account.id) paintState(record);
    },
    signal,
  );
}
