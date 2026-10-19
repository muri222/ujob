import { api, list, quote, update } from "../core/api.js";
import { GROUPS, KINDS } from "../core/catalog.js";
import { h, header, host, icon, logo, toast } from "../core/dom.js";
import { ago, number } from "../core/format.js";
import { countUp } from "../core/motion.js";
import { segmented, toggle } from "../core/ui.js";

const PER_PAGE = 60;

function health(source) {
  if (!source.active) return ["Pausada", "dot"];
  if (!source.lastRunAt) return ["Esperando a 1ª coleta", "dot dot--warn"];
  if (source.lastStatus === "error") return ["Com problema", "dot dot--down"];
  if (source.lastStatus === "empty") return ["Sem vagas na última", "dot dot--warn"];
  return ["Saudável", "dot dot--ok"];
}

export default async function sources(root, { query, signal }) {
  let group = "";
  let page = 1;
  let typing;
  const input = h("input", { type: "search", placeholder: "Buscar fonte", maxLength: 60, value: query.get("q") ?? "" });
  const grid = h("ul", { className: "sources" });
  const more = h("button", { className: "btn more", hidden: true }, "Carregar mais");

  const totals = await Promise.all(Object.keys(GROUPS).map((key) => list("sources", { filter: `group = ${quote(key)}`, perPage: 1, fields: "id" }).then((result) => [key, result.totalItems])));
  const byGroup = Object.fromEntries(totals);
  const all = totals.reduce((sum, [, total]) => sum + total, 0);
  const mosaic = await list("sources", { filter: "logoUrl != '' && kind = 'gupy'", sort: "@random", perPage: 40, fields: "id,name,logoUrl" });
  const big = h("strong", { className: "num" }, "0");
  const data = await api("ujob/stats").catch(() => ({ group: [] }));
  const openByGroup = Object.fromEntries((data.group ?? []).map((row) => [row.key, row.total]));

  root.append(
    h(
      "section",
      { className: "origin" },
      h(
        "div",
        { className: "origin__text" },
        h("p", { className: "eyebrow" }, icon("antenna"), "De onde vem as vagas"),
        h("h1", {}, big, " fontes no radar"),
        h("p", { className: "lead" }, "Portais gerais, páginas oficiais de carreira, agências de RH, comunidades e quadros remotos. Tudo público, coletado com calma e respeitando as regras de cada site."),
      ),
      h("div", { className: "origin__mosaic stagger" }, mosaic.items.map((item, index) => h("span", { style: { "--i": index }, title: item.name }, logo(item.name, item.logoUrl)))),
    ),
    h(
      "ul",
      { className: "origin__groups stagger" },
      Object.entries(GROUPS).map(([key, [label, hint]], index) =>
        h(
          "li",
          { style: { "--i": index } },
          h("button", { className: "origin__group", onclick: () => (tabs.set(key), (group = key), load(true)) }, h("strong", { className: "num" }, number(byGroup[key] ?? 0)), h("span", {}, label), h("small", {}, hint), h("em", { className: "num" }, `${number(openByGroup[key] ?? 0)} vagas abertas`)),
        ),
      ),
    ),
  );
  requestAnimationFrame(() => countUp(big, all, { duration: 1500 }));

  const tabs = segmented([["", "Todas", number(all)], ...Object.entries(GROUPS).map(([key, [label]]) => [key, label, number(byGroup[key] ?? 0)])], group, (value) => {
    group = value;
    load(true);
  }, "Grupo");

  root.append(header("Todas as fontes", "Ligue, pause ou peça uma coleta na hora. As empresas da Gupy ficam pausadas até você seguir."), h("div", { className: "toolbar-row" }, tabs, h("label", { className: "search" }, icon("search"), input)), grid, more);

  function card(source, index) {
    const [status, tone] = health(source);
    const run = h("button", { className: "icon-btn", title: "Coletar agora", "aria-label": "Coletar agora" }, icon("refresh"));
    run.addEventListener("click", async () => {
      run.classList.add("is-spinning");
      await update("sources", source.id, { runRequested: true, active: true });
      toast(`${source.name} entra na próxima rodada.`);
    });
    return h(
      "li",
      { className: `source${source.active ? "" : " is-paused"}`, style: { "--i": index % PER_PAGE } },
      logo(source.name, source.logoUrl, "lg"),
      h(
        "div",
        { className: "source__body" },
        h("strong", {}, source.name),
        h("span", { className: "source__kind" }, `${GROUPS[source.group]?.[0] ?? ""} · ${KINDS[source.kind] ?? source.kind}`),
        h("span", { className: "source__health" }, h("i", { className: tone }), status, source.lastRunAt && ` · ${ago(source.lastRunAt)}`, source.lastFound ? ` · ${number(source.lastFound)} vistas` : ""),
        source.lastStatus === "error" && source.lastError && h("small", { className: "source__error" }, source.lastError),
      ),
      h(
        "div",
        { className: "source__actions" },
        toggle(`Ativar ${source.name}`, source.active, async (active) => {
          await update("sources", source.id, { active, runRequested: active });
          toast(active ? `${source.name} ligada.` : `${source.name} pausada.`);
        }),
        run,
        source.site && h("a", { className: "icon-btn", href: source.site, target: "_blank", rel: "noopener noreferrer", title: host(source.site), "aria-label": "Abrir site" }, icon("external")),
      ),
    );
  }

  async function load(reset) {
    if (reset) page = 1;
    const term = input.value.trim();
    const filter = [group && `group = ${quote(group)}`, term && `(name ~ ${quote(term)} || slug ~ ${quote(term)})`].filter(Boolean).join(" && ");
    const result = await list("sources", { filter, sort: "-active,group,name", page, perPage: PER_PAGE });
    if (signal.aborted) return;
    const nodes = result.items.map(card);
    if (reset) {
      grid.classList.add("stagger");
      grid.replaceChildren(...nodes);
    } else grid.append(...nodes);
    if (reset && !nodes.length) grid.replaceChildren(h("li", { className: "empty" }, "Nenhuma fonte com esse nome."));
    more.hidden = result.page >= result.totalPages;
  }

  input.addEventListener("input", () => {
    clearTimeout(typing);
    typing = setTimeout(() => load(true), 220);
  });
  more.addEventListener("click", () => {
    page++;
    load(false);
  });
  await load(true);
}
