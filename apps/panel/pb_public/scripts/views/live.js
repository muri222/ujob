import { count, list, quote } from "../core/api.js";
import { h, icon, logo } from "../core/dom.js";
import { ago, number, since } from "../core/format.js";
import { jobRow } from "../core/job.js";
import { countUp } from "../core/motion.js";
import { describe } from "../core/query.js";
import { listen } from "../core/realtime.js";

const RUN_FIELDS = "id,status,found,created,updated,closed,finishedAt,error,search,expand.source.name,expand.source.logoUrl,expand.source.group";

function runRow(run) {
  const source = run.expand?.source ?? {};
  const summary = run.status === "error" ? run.error || "A fonte não respondeu" : [run.created && `+${number(run.created)} novas`, `${number(run.found)} vistas`, run.closed && `${number(run.closed)} encerradas`].filter(Boolean).join(" · ");
  return h(
    "li",
    { className: `feed-run is-${run.status}` },
    h("span", { className: "feed-run__rail" }, h("i")),
    logo(source.name, source.logoUrl),
    h("div", { className: "feed-run__body" }, h("strong", {}, source.name ?? "Fonte"), h("span", {}, summary)),
    run.search && h("span", { className: "tag tag--brand" }, "busca"),
    h("time", {}, ago(run.finishedAt)),
  );
}

export default async function live(root, { signal }) {
  const opened = new Date().toISOString().replace("T", " ");
  const [runsToday, jobsToday, runs, jobs, searching] = await Promise.all([
    count("runs", `finishedAt >= ${since(24)}`),
    count("jobs", `firstSeenAt >= ${since(24)}`),
    list("runs", { sort: "-finishedAt", perPage: 40, expand: "source", fields: RUN_FIELDS }),
    list("jobs", { filter: "status = 'open'", sort: "-firstSeenAt", perPage: 30, expand: "source" }),
    list("searches", { filter: "status = 'running' || status = 'queued'", sort: "-requestedAt", perPage: 5 }),
  ]);

  const state = h("p", { className: "live__state" });
  const counters = [
    ["Coletas nas últimas 24h", runsToday],
    ["Vagas novas nas últimas 24h", jobsToday],
    ["Fontes que responderam agora há pouco", new Set(runs.items.map((run) => run.expand?.source?.name)).size],
  ].map(([label, value]) => {
    const node = h("strong", { className: "num" }, "0");
    requestAnimationFrame(() => countUp(node, value));
    return h("div", { className: "live__counter" }, node, h("span", {}, label));
  });

  const feed = h("ul", { className: "feed stagger" }, runs.items.map((run, i) => ((node) => (node.style.setProperty("--i", i), node))(runRow(run))));
  const stream = h("ul", { className: "rows rows--plain stagger" }, jobs.items.map((job, i) => {
    const row = jobRow(job);
    row.style.setProperty("--i", i);
    row.addEventListener("click", () => (location.hash = `#vaga/${job.id}`));
    return row;
  }));
  const searches = h("div", { className: "live__searches" });

  function paintSearches(items) {
    searches.replaceChildren(
      ...items.map((item) =>
        h(
          "a",
          { className: "live__search", href: `#buscar/${item.id}` },
          h("span", { className: "spinner" }),
          h("span", {}, describe(item)),
          h("b", { className: "num" }, `${number(item.found)} achadas`),
        ),
      ),
    );
  }
  paintSearches(searching.items);

  let idle;
  const setBusy = (busy) => {
    root.classList.toggle("is-busy", busy);
    state.replaceChildren(h("i", { className: busy ? "dot dot--live" : "dot dot--ok" }), busy ? "Coletando agora" : "Em espera. A próxima rodada começa sozinha.");
    clearTimeout(idle);
    if (busy) idle = setTimeout(() => setBusy(false), 25_000);
  };
  setBusy(searching.items.length > 0);

  root.append(
    h(
      "header",
      { className: "live" },
      h("div", {}, h("p", { className: "eyebrow" }, icon("live"), "Ao vivo"), h("h1", {}, "O radar trabalhando"), state),
      h("div", { className: "live__counters" }, counters),
    ),
    searches,
    h(
      "div",
      { className: "live__grid" },
      h("section", { className: "panel" }, h("header", { className: "section__head" }, h("h2", {}, "Coletas"), h("a", { href: "#historico" }, "Histórico", icon("arrow"))), feed),
      h("section", { className: "panel" }, h("header", { className: "section__head" }, h("h2", {}, "Vagas chegando"), h("a", { href: "#vagas?period=24h" }, "Todas de hoje", icon("arrow"))), stream),
    ),
  );

  let newest = jobs.items[0]?.firstSeenAt ?? opened;
  async function pullJobs() {
    const { items } = await list("jobs", { filter: `status = 'open' && firstSeenAt > ${quote(newest)}`, sort: "-firstSeenAt", perPage: 20, expand: "source" }).catch(() => ({ items: [] }));
    if (!items.length) return;
    newest = items[0].firstSeenAt;
    for (const job of items.reverse()) {
      const row = jobRow(job);
      row.addEventListener("click", () => (location.hash = `#vaga/${job.id}`));
      stream.prepend(row);
      row.animate([{ opacity: 0, transform: "translateY(-10px)", background: "var(--brand-soft)" }, { opacity: 1, transform: "none", background: "transparent" }], { duration: 900, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    }
    while (stream.children.length > 60) stream.lastChild.remove();
    countUp(counters[1].firstChild, Number(counters[1].firstChild.dataset.value) + items.length);
  }

  listen(
    "runs",
    async ({ action, record }) => {
      if (action !== "create") return;
      setBusy(true);
      const { items } = await list("runs", { filter: `id = ${quote(record.id)}`, expand: "source", fields: RUN_FIELDS }).catch(() => ({ items: [] }));
      const row = runRow(items[0] ?? record);
      feed.prepend(row);
      row.animate([{ opacity: 0, transform: "translateX(-16px)" }, { opacity: 1, transform: "none" }], { duration: 480, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      while (feed.children.length > 60) feed.lastChild.remove();
      countUp(counters[0].firstChild, Number(counters[0].firstChild.dataset.value) + 1);
      if (record.created) pullJobs();
    },
    signal,
  );
  listen(
    "searches",
    async () => {
      const { items } = await list("searches", { filter: "status = 'running' || status = 'queued'", sort: "-requestedAt", perPage: 5 }).catch(() => ({ items: [] }));
      paintSearches(items);
      if (items.length) setBusy(true);
      pullJobs();
    },
    signal,
  );
}
