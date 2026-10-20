import { list } from "../core/api.js";
import { askClaude, asMap, brainProblem, ctx, fitFor, requestFit, stats } from "../core/context.js";
import { h, icon, toast } from "../core/dom.js";
import { match } from "../core/match.js";
import { fromParams, toFilter, toParams } from "../core/query.js";
import { createSentence } from "../core/sentence.js";
import { createSplit } from "../core/split.js";
import { segmented } from "../core/ui.js";
import { runSearch } from "./search.js";
import { countryLabel, profileCountries } from "../core/countries.js";

const SENTENCE = ["term", "category", "state", "city", "workplace", "contract", "country", "not", "notUf"];
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

  // busca escrita: o Claude (Haiku) vira o texto em cargos PT/EN e filtros; sem Claude, vira busca por palavra
  const described = h("input", { type: "search", maxLength: 500, placeholder: "Ou escreva o que procura: \"editor de vídeo pra YouTube, remoto, freela\"", "aria-label": "Descreva a vaga" });
  const describeGo = h("button", { type: "button", className: "btn btn--soft" }, icon("sparkle"), "Buscar");
  async function submitDescribed() {
    const text = described.value.trim();
    if (!text) return described.focus();
    describeGo.disabled = true;
    try {
      if (await brainProblem()) return apply({ term: text.slice(0, 80), terms: "", q: "", category: "" });
      const found = await askClaude("job_query", { text, perfil: { headline: ctx.profile?.headline, skills: ctx.profile?.skills, cargos: ctx.profile?.prefs?.roles } }, { timeout: 60_000 });
      const next = { term: "", category: "", terms: found.terms.join("|"), q: text, workplace: found.workplace, contract: found.contract, state: found.state, city: found.city };
      sentence.set({ ...state, ...next });
      apply(next);
      toast(found.explicacao);
    } catch (error) {
      toast(error.message);
    } finally {
      describeGo.disabled = false;
    }
  }
  describeGo.addEventListener("click", submitDescribed);
  described.addEventListener("keydown", (event) => event.key === "Enter" && (event.preventDefault(), submitDescribed()));
  const status = segmented([["open", "Abertas"], ["closed", "Encerradas"]], state.status === "closed" ? "closed" : "open", (value) => apply({ status: value === "closed" ? "closed" : "" }), "Situação");
  const hunt = h("button", { className: "btn btn--soft", title: "Buscar mais nos portais agora" }, icon("radar"), "Buscar mais nas fontes");
  // a busca nos portais recebe os cargos como lista (igual à busca descrita)
  const portalQuery = () => {
    const { q, terms, ...rest } = state;
    return terms ? { ...rest, terms: terms.split("|"), prompt: q } : rest;
  };
  hunt.addEventListener("click", () => runSearch(portalQuery()));

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
      // países da função: um clique filtra (Brasil, Portugal, Mundo todo...)
      ...profileCountries(ctx.profile).map((code) => {
        const on = state.country === code;
        return h("button", { className: "chip", "aria-pressed": String(on), onclick: () => (apply({ country: on ? "" : code, state: "", city: "" }), sentence.set({ country: on ? "" : code, state: "", city: "" })) }, countryLabel(code));
      }),
      state.q ? h("button", { className: "chip", "aria-pressed": "true", title: (state.terms ?? "").split("|").join(", "), onclick: () => ((described.value = ""), apply({ q: "", terms: "" })) }, icon("sparkle"), `“${state.q.slice(0, 40)}”`, icon("close")) : "",
      state.company ? h("button", { className: "chip", "aria-pressed": "true", onclick: () => apply({ company: "" }) }, icon("building"), state.company, icon("close")) : "",
      state.seniority ? h("button", { className: "chip", "aria-pressed": "true", onclick: () => apply({ seniority: "" }) }, icon("level"), state.seniority, icon("close")) : "",
    );
  }
  paintChips();

  root.classList.add("view--flush");
  const toolbar = h("div", { className: "explorer" }, h("div", { className: "explorer__top" }, sentence, h("div", { className: "explorer__describe" }, described, describeGo)), h("div", { className: "explorer__bar" }, chips, status, judge, hunt));

  const split = createSplit(root, {
    signal,
    toolbar,
    empty: () =>
      h(
        "div",
        { className: "empty" },
        h("strong", {}, "Nenhuma vaga com esse filtro"),
        "Que tal buscar agora nos portais? Leva menos de um minuto.",
        h("button", { className: "btn btn--primary", onclick: () => runSearch(portalQuery()) }, icon("radar"), "Buscar nas fontes"),
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
