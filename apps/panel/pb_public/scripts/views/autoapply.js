import { api, list, quote, update } from "../core/api.js";
import { SENIORITY } from "../core/catalog.js";
import { applicationFor, ctx, fitFor, loadApplications, mine, requestFit, track } from "../core/context.js";
import { h, header, icon, logo, toast } from "../core/dom.js";
import { ago } from "../core/format.js";
import { fitCard, jobDetail } from "../core/job.js";
import { match } from "../core/match.js";
import { listen } from "../core/realtime.js";
import { refuse } from "../core/refuse.js";
import { segmented } from "../core/ui.js";
import { candidatesFilter } from "./marathon.js";

// "Candidatura automática" do AiApply: Revisão rápida (um cartão por vez) + Suas vagas (tabela com gaveta)
const MODES = [["auto", "Modo automático"], ["hibrido", "Modo híbrido"], ["revisao", "Modo revisão"]];
const SKIP_KEY = "radar:auto-skip";
const label = (score) => (score >= 85 ? ["Match forte", "tag--ok"] : score >= 70 ? ["Bom match", "tag--brand"] : score >= 50 ? ["Match potencial", "tag--warn"] : ["Match fraco", "tag--down"]);
const plain = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const place = (job) => (job.workplace === "remoto" ? "Remoto" : [job.city, job.state].filter(Boolean).join("/") || job.country || "Brasil");

function skipped() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SKIP_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function skip(id) {
  const set = skipped();
  set.add(id);
  try {
    sessionStorage.setItem(SKIP_KEY, JSON.stringify([...set]));
  } catch {}
}

async function jobsById(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 60) {
    const chunk = ids.slice(i, i + 60);
    if (!chunk.length) continue;
    const { items } = await list("jobs", { filter: chunk.map((id) => `id = ${quote(id)}`).join(" || "), perPage: 60, expand: "source" });
    for (const job of items) out.set(job.id, job);
  }
  return out;
}

// todas as vagas que o Claude já avaliou pra esta função, com o estado no funil e a carta (se houver)
async function loadRows() {
  const [{ items: fits }, { items: apps }, { items: messages }] = await Promise.all([
    list("ai_tasks", { filter: mine("type = 'job_fit' && status = 'done'"), sort: "-updatedAt", perPage: 300, fields: "id,ref,result,updatedAt" }),
    list("applications", { filter: mine("job != ''"), perPage: 500, fields: "id,job,stage,reason,updated,appliedAt" }),
    list("messages", { filter: mine("job != ''"), sort: "-createdAt", perPage: 300 }),
  ]);
  const appBy = new Map(apps.map((item) => [item.job, item]));
  const msgBy = new Map();
  for (const message of messages) if (!msgBy.has(message.job)) msgBy.set(message.job, message);
  const ids = [...new Set([...fits.map((fit) => fit.ref), ...apps.map((item) => item.job)])];
  const jobs = await jobsById(ids);
  const fitBy = new Map(fits.map((fit) => [fit.ref, fit]));
  return ids
    .filter((id) => jobs.has(id))
    .map((id) => {
      const app = appBy.get(id);
      const message = msgBy.get(id);
      const fit = fitBy.get(id);
      const stage = app?.stage;
      const status = stage === "recusada" ? "recusado" : message?.status === "enviada" || (stage && stage !== "salva") ? "candidatou" : message?.status === "pronta" || message?.status === "gerando" ? "preparando" : "revisar";
      return { job: jobs.get(id), fit, app, message, status, score: fit?.result?.score ?? match(jobs.get(id))?.score ?? 0, updated: [fit?.updatedAt, app?.updated, message?.updatedAt].filter(Boolean).sort().pop() };
    })
    .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
}

async function candidate(job) {
  if (!ctx.profile) return toast("Crie seu perfil primeiro.");
  if (!job.contactEmail) {
    await track(job, "aplicada");
    open(job.applyUrl || job.url, "_blank", "noopener");
    toast("Vaga sem e-mail: abri o site pra você aplicar. Ficou como Candidatei no funil.");
    return;
  }
  const { reused } = await api("radar/apply/prepare", { method: "POST", body: { profile: ctx.profile.id, job: job.id } });
  toast(reused ? "Essa candidatura já está na fila." : "Claude preparando carta e CV. Revise em Prontas para enviar.", { label: "Ver", run: () => (location.hash = "#envios") });
}

export default async function autoapply(root, { query, signal }) {
  if (!ctx.profile) {
    root.append(header("Candidatura automática", null), h("div", { className: "empty card" }, h("strong", {}, "Crie sua primeira função"), "Use o seletor no topo do menu."));
    return;
  }
  const mode = h("select", { className: "auto__mode", "aria-label": "Modo de candidatura" }, MODES.map(([key, text]) => h("option", { value: key, selected: (ctx.profile.sendMode || "revisao") === key }, text)));
  const pill = h("span", { className: "tag" });
  const paintPill = () => {
    const on = mode.value !== "revisao";
    pill.className = on ? "tag tag--ok" : "tag";
    pill.textContent = on ? "Candidatando agora" : "Pausado (revisão)";
  };
  paintPill();
  mode.addEventListener("change", async () => {
    ctx.profile = await update("profile", ctx.profile.id, { sendMode: mode.value });
    paintPill();
    toast(mode.value === "auto" ? "Automático ligado: sai sozinho até o limite diário." : mode.value === "hibrido" ? "Híbrido: o Claude prepara as boas, você confirma." : "Revisão: nada sai sem você.");
  });

  let rows = await loadRows();
  const body = h("div", { className: "auto__body" });
  const tabs = segmented(
    [["rapida", "Revisão rápida"], ["vagas", "Suas vagas"]],
    query.get("aba") === "vagas" ? "vagas" : "rapida",
    (key) => show(key),
    "Seções",
  );

  // ── Revisão rápida: o melhor ainda não decidido, um por vez
  function queue() {
    const skip = skipped();
    // ponytail: nota < 50 sem "vale aplicar" não merece cartão; continua na tabela como Match fraco
    return rows.filter((row) => row.status === "revisar" && row.fit && row.job.status === "open" && !skip.has(row.job.id) && (row.score >= 50 || row.fit.result?.vale_aplicar)).sort((a, b) => b.score - a.score);
  }

  function quick() {
    const pending = queue();
    const sent = rows.filter((row) => row.status === "candidatou").length;
    const banner = h(
      "div",
      { className: "banner" },
      h("span", {}, h("strong", {}, mode.value === "revisao" ? "Revise as vagas que o Claude achou pra você" : "Candidatando-se automaticamente às suas melhores vagas"), h("small", {}, "Aqui ficam as de menor confiança, pra você decidir.")),
      h("button", { className: "btn btn--soft", onclick: () => show("vagas") }, `Ver ${sent} candidaturas`, icon("arrow")),
    );
    if (!pending.length) return [banner, emptyQuick()];
    const { job, fit } = pending[0];
    const result = fit.result;
    const [text, tone] = label(result.score);
    const next = () => {
      skip(job.id);
      body.replaceChildren(...quick());
    };
    const actions = h(
      "div",
      { className: "auto__actions" },
      h("button", { className: "btn auto__no", onclick: async () => (await refuse(job)) && ((pending[0].status = "recusado"), body.replaceChildren(...quick())) }, icon("close"), "Recusar"),
      h("button", { className: "btn", onclick: next }, "Pular"),
      h(
        "button",
        {
          className: "btn auto__yes",
          onclick: async (event) => {
            event.currentTarget.disabled = true;
            try {
              await candidate(job);
              pending[0].status = job.contactEmail ? "preparando" : "candidatou";
            } catch (error) {
              toast(error.message || "Não deu pra candidatar.");
            }
            body.replaceChildren(...quick());
          },
        },
        icon("check"),
        "Candidatar",
      ),
    );
    return [
      banner,
      h(
        "article",
        { className: "panel auto__card" },
        h(
          "div",
          { className: "auto__left" },
          h("header", { className: "auto__head" }, logo(job.company || job.expand?.source?.name, job.companyLogo || job.expand?.source?.logoUrl, "lg"), h("div", {}, h("strong", {}, job.title), h("span", {}, job.company || job.expand?.source?.name || ""))),
          h("div", { className: "quick" }, job.seniority ? h("span", { className: "tag" }, SENIORITY[job.seniority]) : null, h("span", { className: `tag ${tone}` }, text, ` · ${result.score}`), h("span", { className: "tag" }, place(job)), h("a", { className: "tag", href: job.url, target: "_blank", rel: "noopener noreferrer" }, "Ver vaga ", icon("external"))),
          h("h3", {}, "Resumo"),
          h("p", { className: "auto__summary" }, plain(job.summary || job.description).slice(0, 700) || "Sem descrição na fonte."),
        ),
        h(
          "div",
          { className: "auto__right" },
          h("h3", {}, "Por que pode ser boa opção"),
          h("p", {}, result.por_que),
          result.atende?.length ? [h("h3", {}, "Correspondências"), h("ul", { className: "auto__list auto__list--ok" }, result.atende.map((item) => h("li", {}, icon("check"), item)))] : null,
          result.falta?.length ? [h("h3", {}, "Lacunas"), h("ul", { className: "auto__list auto__list--no" }, result.falta.map((item) => h("li", {}, icon("close"), item)))] : null,
        ),
      ),
      actions,
      h("p", { className: "settings__help auto__note" }, `${pending.length - 1} na fila. Candidatar usa seu currículo, gera a carta de apresentação e responde as perguntas com a Biblioteca de respostas. Você revisa antes de enviar (no Automático, sai sozinho).`),
    ];
  }

  function emptyQuick() {
    const go = h("button", { className: "btn btn--primary" }, icon("sparkle"), "Avaliar vagas novas com o Claude");
    go.addEventListener("click", async () => {
      go.disabled = true;
      try {
        const { items } = await list("jobs", { filter: candidatesFilter(ctx.profile), sort: "-firstSeenAt", perPage: 200 });
        const best = items
          .filter((job) => !fitFor(job.id) && !applicationFor(job.id))
          .map((job) => ({ id: job.id, score: match(job)?.score ?? 0 }))
          .filter(({ score }) => score > 40)
          .sort((a, b) => b.score - a.score)
          .slice(0, 15);
        if (!best.length) return toast("Nenhuma vaga nova da sua função pra avaliar agora. Rode uma busca.");
        toast(`${await requestFit(best.map(({ id }) => id))} vagas na fila do Claude. Elas aparecem aqui sozinhas.`);
      } finally {
        go.disabled = false;
      }
    });
    return h("div", { className: "empty card" }, h("strong", {}, "Nada pra revisar agora"), "Peça pro Claude avaliar as vagas novas da sua função. As boas aparecem aqui, uma por vez.", go);
  }

  // ── Suas vagas: tabela por estado + gaveta com Visão geral / Candidatura / Compatibilidade
  let filter = "todos";
  let term = "";
  const TABS = [["todos", "Todos"], ["revisar", "Revisar matches"], ["preparando", "Preparando"], ["candidatou", "Candidatou-se"], ["recusado", "Recusado"]];
  const STATUS = { revisar: ["Revisar", "tag--warn"], preparando: ["Preparando", "tag--brand"], candidatou: ["Candidatura enviada", "tag--ok"], recusado: ["Recusado", "tag--down"] };

  function drawer(row) {
    const pane = h("div", { className: "auto__pane" });
    const message = row.message;
    const views = {
      geral: () => jobDetail(row.job),
      candidatura: () =>
        message
          ? h(
              "div",
              { className: "auto__letter" },
              h("p", { className: "settings__help" }, `Para: ${message.to || "sem e-mail (aplicar no site)"} · ${message.status}`),
              h("h3", {}, message.subject || "Carta de apresentação"),
              h("pre", { className: "auto__pre" }, message.body || ""),
              message.cv?.headline ? h("p", { className: "settings__help" }, `CV adaptado: ${message.cv.headline}`) : null,
              h("a", { className: "btn btn--soft", href: "#envios" }, "Abrir em Prontas para enviar", icon("arrow")),
            )
          : h("div", { className: "empty card" }, h("strong", {}, "Ainda sem candidatura"), "Clique em Candidatar pra o Claude escrever a carta e adaptar o CV.", h("button", { className: "btn btn--primary", onclick: () => candidate(row.job).catch((error) => toast(error.message)) }, icon("check"), "Candidatar")),
      compat: () => fitCard(row.job),
    };
    const seg = segmented([["geral", "Visão geral"], ["candidatura", "Candidatura"], ["compat", "Compatibilidade"]], "geral", (key) => pane.replaceChildren(views[key]()), "Detalhes");
    pane.append(views.geral());
    const dialog = h("dialog", { className: "auto__drawer" }, h("div", { className: "auto__drawer-head" }, seg, h("button", { className: "icon-btn", "aria-label": "Fechar", onclick: () => dialog.close() }, icon("close"))), pane);
    dialog.addEventListener("close", () => dialog.remove());
    dialog.addEventListener("click", (event) => event.target === dialog && dialog.close());
    document.body.append(dialog);
    dialog.showModal();
  }

  function table() {
    const sent = rows.filter((row) => row.status === "candidatou").length;
    const search = h("input", { type: "search", placeholder: "Buscar vagas ou empresas", value: term });
    const tbody = h("tbody");
    const paint = () => {
      const shown = rows.filter((row) => (filter === "todos" || row.status === filter) && (!term || `${row.job.title} ${row.job.company}`.toLowerCase().includes(term.toLowerCase())));
      tbody.replaceChildren(
        ...shown.slice(0, 200).map((row) => {
          const [text, tone] = STATUS[row.status];
          const [matchText, matchTone] = label(row.score);
          const tr = h(
            "tr",
            { onclick: () => drawer(row) },
            h("td", {}, h("span", { className: "auto__company" }, logo(row.job.company || row.job.expand?.source?.name, row.job.companyLogo, "sm"), h("span", {}, row.job.company || row.job.expand?.source?.name || "Empresa"), h("span", { className: `tag ${tone}` }, text))),
            h("td", {}, h("span", {}, row.job.title), " ", row.fit ? h("span", { className: `tag ${matchTone}` }, matchText) : null),
            h("td", { className: "auto__when" }, row.updated ? ago(row.updated) : ""),
            h(
              "td",
              { className: "auto__row-actions" },
              row.status === "revisar"
                ? [
                    h("button", { className: "btn btn--ghost btn--sm", onclick: async (event) => (event.stopPropagation(), (await refuse(row.job)) && ((row.status = "recusado"), paint())) }, "Recusar"),
                    h("button", { className: "btn btn--primary btn--sm", onclick: async (event) => (event.stopPropagation(), await candidate(row.job).catch((error) => toast(error.message)), (row.status = row.job.contactEmail ? "preparando" : "candidatou"), paint()) }, "Candidatar"),
                  ]
                : h("button", { className: "btn btn--ghost btn--sm", onclick: (event) => (event.stopPropagation(), drawer(row)) }, "Abrir"),
            ),
          );
          return tr;
        }),
      );
      if (!shown.length) tbody.append(h("tr", {}, h("td", { colSpan: 4 }, h("div", { className: "empty" }, "Nada aqui ainda."))));
    };
    search.addEventListener("input", () => ((term = search.value), paint()));
    const filters = segmented(TABS.map(([key, text]) => [key, text, String(key === "todos" ? rows.length : rows.filter((row) => row.status === key).length)]), filter, (key) => ((filter = key), paint()), "Filtro");
    paint();
    return [
      h(
        "div",
        { className: "auto__stats" },
        h("div", { className: "panel" }, h("small", {}, "Candidatando agora"), pill.cloneNode(true)),
        h("div", { className: "panel" }, h("small", {}, "Candidaturas enviadas"), h("strong", { className: "num" }, String(sent))),
        h("div", { className: "panel" }, h("small", {}, "Vagas avaliadas pelo Claude"), h("strong", { className: "num" }, String(rows.filter((row) => row.fit).length))),
      ),
      h("div", { className: "auto__toolbar" }, filters, search),
      h("div", { className: "panel auto__table-wrap" }, h("table", { className: "auto__table" }, h("thead", {}, h("tr", {}, h("th", {}, "Empresa"), h("th", {}, "Vaga"), h("th", {}, "Atualizado"), h("th", {}, "Ação"))), tbody)),
    ];
  }

  function show(key) {
    tabs.set(key);
    history.replaceState(null, "", `#auto${key === "vagas" ? "?aba=vagas" : ""}`);
    body.replaceChildren(...(key === "vagas" ? table() : quick()));
  }

  root.append(header("Candidatura automática", "O Claude acha, avalia e prepara candidaturas pra vagas da sua função.", pill, mode), h("div", { className: "prefs__tabs" }, tabs), body);
  show(query.get("aba") === "vagas" ? "vagas" : "rapida");

  // nota nova do Claude entra na fila sem recarregar (só se a pessoa não estiver no meio de um cartão)
  let timer;
  listen(
    "ai_tasks",
    ({ record }) => {
      if (record.type !== "job_fit" || record.profile !== ctx.profile.id || record.status !== "done") return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        rows = await loadRows();
        await loadApplications();
        if (!queue().length || body.querySelector(".empty")) show(tabs.querySelector("[aria-checked=true]")?.dataset.value ?? "rapida");
      }, 1500);
    },
    signal,
  );
}
