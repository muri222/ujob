import { count, get, list, quote, update } from "../core/api.js";
import { ctx } from "../core/context.js";
import { h, icon, logo, toast } from "../core/dom.js";
import { mascot } from "../core/mascot.js";
import { ago, number, stamp } from "../core/format.js";
import { countUp } from "../core/motion.js";
import { countriesFilter, describe, toFilter } from "../core/query.js";
import { listen } from "../core/realtime.js";
import { createSentence } from "../core/sentence.js";
import { createSplit } from "../core/split.js";
import { toggle } from "../core/ui.js";
import { runSearch } from "./search.js";

const POLL_MS = 2500;
const QUERY_KEYS = ["term", "category", "state", "city", "workplace", "contract"];

export default async function searchRun(root, { params, signal }) {
  let search = await get("searches", params.id);
  const query = Object.fromEntries(QUERY_KEYS.filter((key) => search[key]).map((key) => [key, search[key]]));
  if (search.terms?.length) query.terms = search.terms;
  if (search.countries?.length && !search.state) query.countries = search.countries;
  const opened = stamp(new Date(Date.now() - 5000));
  // busca descrita: o que os portais devolverem também precisa bater com algum termo (portal devolve muita coisa solta)
  const termMatch = search.terms?.length ? ` && (${search.terms.map((term) => `title ~ ${quote(term)}`).join(" || ")})` : "";
  const countryMatch = search.countries?.length && !search.state ? ` && ${countriesFilter(search.countries)}` : "";
  const matches = `(${toFilter(query)}) || (status = 'open' && search_hits_via_job.search ?= ${quote(search.id)}${termMatch}${countryMatch})`;
  let newest = opened;

  const sourceIds = () => Object.keys(search.progress ?? {});
  const sources = new Map();
  async function loadSources() {
    const missing = sourceIds().filter((id) => !sources.has(id));
    if (!missing.length) return;
    const { items } = await list("sources", { filter: missing.map((id) => `id = ${quote(id)}`).join(" || "), perPage: 200, fields: "id,name,logoUrl,site" });
    for (const item of items) sources.set(item.id, item);
  }

  const total = h("strong", { className: "run__total num" }, "0");
  const status = h("p", { className: "run__status" });
  const bar = h("div", { className: "run__bar" }, h("i"));
  const strip = h("ul", { className: "run__sources" });
  const radar = h("p", { className: "run__radar" });
  let local = await count("jobs", toFilter(query)).catch(() => 0);
  const alertToggle = toggle("Avisar quando entrar vaga nova", search.saved, async (saved) => {
    try {
      search = await update("searches", search.id, { saved });
      toast(saved ? "Busca salva. Ela roda sozinha e te avisa." : "Busca removida dos alertas.");
      ctx.refreshCounts();
    } catch {
      toast("Não deu pra salvar.");
    }
  });

  // na frase os países fora ("-BR") viram "menos Brasil"; os de dentro seguem na busca nova se não escolher outro lugar
  const wanted = (search.countries ?? []).filter((code) => code[0] !== "-");
  const { countries: _, ...shown } = query;
  shown.not = (search.countries ?? []).filter((code) => code[0] === "-").map((code) => code.slice(1)).join(",");
  const sentence = createSentence({ query: shown, size: "md", onChange: (next) => runSearch({ ...next, countries: next.country || next.state || !wanted.length ? undefined : wanted }).catch(() => toast("Não deu pra buscar.")) });

  root.classList.add("view--flush");
  root.append(
    h(
      "header",
      { className: "run" },
      h("div", { className: "run__query" }, h("a", { className: "icon-btn", href: "#buscar", "aria-label": "Nova busca" }, icon("back")), sentence),
      search.terms?.length ? h("p", { className: "run__custom" }, icon("sparkle"), h("span", {}, search.prompt ? `“${search.prompt}” · ` : "", "buscando: ", search.terms.join(", "))) : null,
      h(
        "div",
        { className: "run__board" },
        h("div", { className: "run__count" }, total, h("span", {}, "vagas achadas"), status),
        h("div", { className: "run__side" }, h("label", { className: "run__alert" }, icon("bell"), h("span", {}, "Me avisar"), alertToggle), bar),
      ),
      radar,
      strip,
    ),
  );

  function paint() {
    const entries = sourceIds().map((id) => [id, search.progress[id]]);
    const done = entries.filter(([, state]) => ["done", "error"].includes(state.status)).length;
    const running = search.status === "running" || search.status === "queued";
    root.classList.toggle("is-running", running);
    countUp(total, search.found ?? 0, { duration: 700 });
    bar.style.setProperty("--progress", running ? `${entries.length ? Math.max(6, (done / entries.length) * 100) : 4}%` : "100%");
    status.replaceChildren(
      ...(search.status === "queued"
        ? [h("span", { className: "spinner" }), "Na fila. Começa em segundos."]
        : running
          ? [h("span", { className: "spinner" }), `Vasculhando ${entries.length} fontes · ${done} prontas`]
          : search.status === "canceled"
            ? [icon("refresh"), "Você começou outra busca, então essa parou. Mostrando o que já chegou."]
            : search.status === "error"
              ? [icon("close"), "As fontes não responderam. Tenta de novo daqui a pouco."]
              : [icon("check"), `Pronta ${ago(search.finishedAt)} · ${number(search.created)} inéditas no ujob`]),
    );
    const chip = (id, state) => {
      const source = sources.get(id);
      const name = source?.name ?? "Fonte";
      return h(
        "li",
        { className: `run__source is-${state.status}${state.found ? " has-found" : ""}`, title: state.status === "error" ? `${name} não respondeu agora` : name },
        logo(name, source?.logoUrl, "sm"),
        h("span", {}, name),
        state.status === "running" ? h("span", { className: "spinner" }) : state.found ? h("b", { className: "num" }, number(state.found)) : null,
      );
    };
    const rank = ([, a], [, b]) => b.found - a.found || (a.status === "running") - (b.status === "running");
    const loud = entries.filter(([, state]) => state.found || state.status === "running").sort(rank);
    const quiet = entries.filter(([, state]) => !state.found && state.status !== "running");
    strip.replaceChildren(
      h("li", { className: "run__source run__source--home has-found" }, h("span", { className: "run__home" }, mascot("mark", { label: "" })), h("span", {}, "Acervo ujob"), h("b", { className: "num" }, number(local))),
      ...loud.map(([id, state]) => chip(id, state)),
      quiet.length ? h("li", { className: "run__quiet", title: quiet.map(([id]) => sources.get(id)?.name).filter(Boolean).join(", ") }, quiet.slice(0, 8).map(([id]) => logo(sources.get(id)?.name ?? "?", sources.get(id)?.logoUrl, "sm")), h("span", {}, `${quiet.length} sem vaga nova`)) : "",
    );
    radar.replaceChildren(
      h("b", { className: "num" }, number(entries.length + 1)),
      " fontes · ",
      h("b", { className: "num" }, number(done)),
      " prontas · ",
      h("b", { className: "num" }, number(loud.filter(([, state]) => state.found).length + (local ? 1 : 0))),
      " com vagas",
    );
  }

  const split = createSplit(root, {
    signal,
    empty: () =>
      h(
        "div",
        { className: "empty" },
        search.status === "done" ? h("strong", {}, "Nada por enquanto") : h("div", { className: "mascot-slot" }, mascot("mark", { label: "Buscando" })),
        search.status === "done" ? "Tenta abrir o leque: outra cidade, outra modalidade ou deixa a área em branco." : "As primeiras vagas aparecem aqui em instantes.",
      ),
    load: (page, perPage) => list("jobs", { filter: matches, sort: "-lastSeenAt", page, perPage, expand: "source", fields: "*,expand.source.name,expand.source.logoUrl,expand.source.group" }),
  });

  async function poll() {
    if (signal.aborted || document.hidden) return;
    const { items } = await list("jobs", { filter: `(${matches}) && lastSeenAt > ${quote(newest)}`, sort: "-lastSeenAt", perPage: 60, expand: "source" }).catch(() => ({ items: [] }));
    if (items.length) {
      newest = items[0].lastSeenAt;
      split.prepend(items.reverse());
    }
  }

  await loadSources().catch(() => {});
  paint();
  await split.reload();
  newest = split.items()[0]?.lastSeenAt ?? opened;

  listen(
    `searches/${search.id}`,
    async ({ record }) => {
      search = record;
      if (record.status === "done") local = await count("jobs", toFilter(query)).catch(() => local);
      await loadSources().catch(() => {});
      paint();
      poll();
    },
    signal,
  );
  const timer = setInterval(() => (search.status === "running" || search.status === "queued") && poll(), POLL_MS);
  signal.addEventListener("abort", () => clearInterval(timer));
  if (search.saved) update("searches", search.id, { seenAt: new Date().toISOString() }).then(ctx.refreshCounts).catch(() => {});
  document.title = `${describe(query)} · ujob`;
  signal.addEventListener("abort", () => (document.title = "ujob"));
}
