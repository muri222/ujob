import { list } from "../core/api.js";
import { asMap, stats } from "../core/context.js";
import { h, icon } from "../core/dom.js";
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
  const toolbar = h("div", { className: "explorer" }, h("div", { className: "explorer__top" }, sentence), h("div", { className: "explorer__bar" }, chips, status, hunt));

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
