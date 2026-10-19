import { CATEGORIES, CONTRACTS, SENIORITY, STATES } from "../core/catalog.js";
import { asMap, stats } from "../core/context.js";
import { brazilMap, hbars } from "../core/charts.js";
import { cat, h, header, icon } from "../core/dom.js";
import { number } from "../core/format.js";
import { tilt } from "../core/fx.js";
import { busyCities, isCity } from "../core/places.js";
import { runSearch } from "./search.js";

export default async function areas(root) {
  const data = await stats(true);
  const byArea = asMap(data.category);
  const byState = asMap(data.state);
  const top = Math.max(1, ...Object.values(byArea));
  let picked = "";
  const detail = h("div", { className: "map__detail" });
  const map = brazilMap(byState, { onPick: (code) => pick(picked === code ? "" : code) });

  async function cityList(state) {
    const rows = await busyCities(state);
    const real = [];
    for (const row of rows) if (real.length < 10 && (await isCity(row.key, state))) real.push(row);
    if (picked !== state || !real.length) return;
    detail.querySelector(".map__cities")?.replaceChildren(
      h("p", { className: "popover__title" }, "Cidades com mais vagas"),
      h(
        "ul",
        { className: "map__rank stagger" },
        real.map((row, index) => h("li", { style: { "--i": index } }, h("a", { href: `#vagas?state=${state}&city=${encodeURIComponent(row.key)}` }, h("span", {}, row.key), h("b", { className: "num" }, number(row.total))))),
      ),
    );
  }

  function pick(code) {
    picked = code;
    map.select(code);
    paintDetail();
    if (code) cityList(code);
  }

  function paintDetail() {
    const total = picked ? byState[picked] ?? 0 : data.open;
    detail.replaceChildren(
      h("p", { className: "eyebrow" }, icon("pin"), picked ? STATES[picked] : "Brasil inteiro"),
      h("strong", { className: "map__number num" }, number(total)),
      h("span", {}, "vagas abertas"),
      h(
        "div",
        { className: "map__actions" },
        h("a", { className: "btn btn--primary", href: picked ? `#vagas?state=${picked}` : "#vagas" }, "Ver vagas", icon("arrow")),
        h("button", { className: "btn", onclick: () => runSearch(picked ? { state: picked } : {}) }, icon("radar"), "Buscar mais"),
      ),
      picked
        ? h("div", { className: "map__cities" }, h("div", { className: "skeleton map__skeleton" }))
        : h(
            "ol",
            { className: "map__rank" },
            data.state.slice(0, 6).map((row, index) => h("li", {}, h("button", { type: "button", onclick: () => pick(row.key) }, h("span", {}, `${index + 1}. ${STATES[row.key] ?? row.key}`), h("b", { className: "num" }, number(row.total))))),
          ),
    );
  }
  paintDetail();

  root.append(
    header("Áreas e mapa", "Todas as frentes de trabalho que o radar cobre, e onde elas estão no Brasil."),
    h(
      "ul",
      { className: "area-board stagger" },
      Object.entries(CATEGORIES).map(([key, label], index) =>
        h(
          "li",
          { style: { "--i": index } },
          tilt(h(
            "a",
            { className: "area-card", href: `#vagas?category=${key}`, style: { "--share": `${((byArea[key] ?? 0) / top) * 100}%` } },
            cat(key, 44),
            h("strong", {}, label),
            h("span", { className: "num" }, byArea[key] ? `${number(byArea[key])} abertas` : "Sem vagas agora"),
            h("i", { className: "area-card__bar" }),
          )),
        ),
      ),
    ),
    h("section", { className: "section map card" }, map, detail),
    h(
      "div",
      { className: "dash dash--two" },
      h(
        "section",
        { className: "panel" },
        h("header", { className: "section__head" }, h("h2", {}, "Tipo de contrato")),
        hbars(data.contract.filter((row) => row.key), { href: (row) => `#vagas?contract=${row.key}`, render: (row) => h("span", { className: "hbars__label" }, icon("contract"), CONTRACTS[row.key] ?? row.key) }),
      ),
      h(
        "section",
        { className: "panel" },
        h("header", { className: "section__head" }, h("h2", {}, "Nível")),
        hbars(data.seniority.filter((row) => row.key), { href: (row) => `#vagas?seniority=${row.key}`, render: (row) => h("span", { className: "hbars__label" }, icon("level"), SENIORITY[row.key] ?? row.key) }),
      ),
    ),
  );
}
