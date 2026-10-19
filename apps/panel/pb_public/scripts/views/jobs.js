import { list } from "../core/api.js";
import { asMap, ctx, fitFor, requestFit, stats } from "../core/context.js";
import { h, icon, toast } from "../core/dom.js";
import { match } from "../core/match.js";
import { fromParams, toFilter, toParams } from "../core/query.js";
import { createSentence } from "../core/sentence.js";
import { createSplit } from "../core/split.js";
import { segmented } from "../core/ui.js";
import { runSearch } from "./search.js";

const SENTENCE = ["term", "category", "state", "city", "workplace", "contract"];
const QUICK = [
  ["period", "24h", "sparkle", "Novas de hoje"],
  ["salary", "1", "money", "Com salário"],
  ["contact", "1", "whatsapp", "Contato direto"],
  ["workplace", "remoto", "laptop", "Remoto"],
  ["abroad", "1", "globe", "Fora do Brasil"],
];

export default async function jobs(root, { query, signal }) {
  let state = fromParams(query);
  const data = await stats().catch(() => null);
  const counts = { category: asMap(data?.category), state: asMap(data?.state), workplace: asMap(data?.workplace), contract: asMap(data?.contract) };

  const push = () => history.replaceState(null, "", `#vagas${toParams(state).size ? `?${toParams(state)}` : ""}`);
  const apply = (patch) => {
    state = { ...state, ...patch };
    for (const key of Object.keys(state)) if (!state[key]) delete state[key];
    push();
    paintChips();
    split.reload();
  };

  const sentence = createSentence({ query: state, counts, size: "sm", onChange: (next) => apply(Object.fromEntries(SENTENCE.map((key) => [key, next[key] ?? ""]))) });
  const chips = h("div", { className: "quick" });
  const status = segmented([["open", "Abertas"], ["closed", "Encerradas"]], state.status === "closed" ? "closed" : "open", (value) => apply({ status: value === "closed" ? "closed" : "" }), "Situação");
  const hunt = h("button", { className: "btn btn--soft", title: "Buscar mais nos portais agora" }, icon("radar"), "Buscar mais nas fontes");
  hunt.addEventListener("click", () => runSearch(state));

  // ponytail: a regra local filtra de graça; só as melhores acima de 50 vão pro Claude
  const judge = h("button", { className: "btn btn--soft", title: "Nota do Claude para as 20 melhores deste filtro" }, icon("sparkle"), "Avaliar com Claude");
  judge.addEventListener("click", async () => {
    if (!ctx.profile) return toast("Crie seu perfil primeiro.");
    judge.disabled = true;
    try {
      const { items } = await list("jobs", { filter: toFilter(state), sort: "-firstSeenAt", perPage: 200 });
      const best = items
        .filter((job) => {
          const fit = fitFor(job.id);
          return !["queued", "running"].includes(fit?.status) && !(fit?.status === "done" && fit.updatedAt > ctx.profile.updated);
        })
        .map((job) => ({ id: job.id, score: match(job)?.score ?? 0 }))
        .filter(({ score }) => score > 50)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);
      if (!best.length) return toast("Nenhuma vaga nova acima de 50 por aqui.");
      const created = await requestFit(best.map(({ id }) => id));
      toast(`${created} vagas na fila do Claude. As notas aparecem sozinhas.`);
    } catch {
      toast("Não deu pra pedir as avaliações.");
    } finally {
      judge.disabled = false;
    }
  });

  function paintChips() {
    chips.replaceChildren(
      ...QUICK.map(([key, value, iconName, text]) => {
        const on = state[key] === value;
        return h("button", { className: "chip", "aria-pressed": String(on), onclick: () => apply({ [key]: on ? "" : value }) }, icon(iconName), text);
      }),
      state.company ? h("button", { className: "chip", "aria-pressed": "true", onclick: () => apply({ company: "" }) }, icon("building"), state.company, icon("close")) : "",
      state.seniority ? h("button", { className: "chip", "aria-pressed": "true", onclick: () => apply({ seniority: "" }) }, icon("level"), state.seniority, icon("close")) : "",
    );
  }
  paintChips();

  root.classList.add("view--flush");
  const toolbar = h("div", { className: "explorer" }, h("div", { className: "explorer__top" }, sentence), h("div", { className: "explorer__bar" }, chips, status, judge, hunt));

  const split = createSplit(root, {
    signal,
    toolbar,
    empty: () =>
      h(
        "div",
        { className: "empty" },
        h("strong", {}, "Nenhuma vaga com esse filtro"),
        "Que tal buscar agora nos portais? Leva menos de um minuto.",
        h("button", { className: "btn btn--primary", onclick: () => runSearch(state) }, icon("radar"), "Buscar nas fontes"),
      ),
    load: (page, perPage) => list("jobs", { filter: toFilter(state), sort: state.status === "closed" ? "-closedAt" : "-firstSeenAt", page, perPage, expand: "source" }),
  });

  await split.reload();

  return {
    onQuery(params) {
      state = fromParams(params);
      sentence.set(state);
      status.set(state.status === "closed" ? "closed" : "open");
      paintChips();
      split.reload();
    },
  };
}
