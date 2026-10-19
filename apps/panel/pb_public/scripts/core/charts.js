import { STATES } from "./catalog.js";
import { h } from "./dom.js";
import { number } from "./format.js";

const SVG = "http://www.w3.org/2000/svg";
const dayLabel = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });
const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "narrow", timeZone: "UTC" });

const svg = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};

export function flowChart(opened, closed, days = 14) {
  const byDay = (rows) => Object.fromEntries(rows.map((row) => [row.key, row.total]));
  const ins = byDay(opened);
  const outs = byDay(closed);
  const keys = Array.from({ length: days }, (_, i) => new Date(Date.now() - (days - 1 - i) * 864e5).toISOString().slice(0, 10));
  const max = Math.max(1, ...keys.map((key) => Math.max(ins[key] ?? 0, outs[key] ?? 0)));
  const tip = h("div", { className: "chart__tip", hidden: true });

  const columns = keys.map((key, index) => {
    const date = new Date(`${key}T12:00:00Z`);
    const column = h(
      "div",
      { className: "flow__col", style: { "--i": index } },
      h("div", { className: "flow__bars" }, h("i", { className: "flow__in", style: { "--h": `${((ins[key] ?? 0) / max) * 100}%` } }), h("i", { className: "flow__out", style: { "--h": `${((outs[key] ?? 0) / max) * 100}%` } })),
      h("span", { className: "flow__day" }, index === days - 1 ? "hoje" : weekday.format(date)),
    );
    column.addEventListener("pointerenter", () => {
      tip.hidden = false;
      tip.replaceChildren(h("strong", {}, dayLabel.format(date)), h("span", {}, h("i", { className: "flow__in" }), `${number(ins[key] ?? 0)} entraram`), h("span", {}, h("i", { className: "flow__out" }), `${number(outs[key] ?? 0)} encerraram`));
      tip.style.setProperty("--x", `${column.offsetLeft + column.offsetWidth / 2}px`);
    });
    column.addEventListener("pointerleave", () => (tip.hidden = true));
    return column;
  });
  return h("div", { className: "flow" }, h("div", { className: "flow__plot" }, columns, tip), h("div", { className: "flow__legend" }, h("span", {}, h("i", { className: "flow__in" }), "Entraram"), h("span", {}, h("i", { className: "flow__out" }), "Encerraram")));
}

export function hbars(rows, { render, href, limit = 8 }) {
  const max = Math.max(1, ...rows.map((row) => row.total));
  return h(
    "ul",
    { className: "hbars stagger" },
    rows.slice(0, limit).map((row, index) =>
      h(
        "li",
        { style: { "--i": index } },
        h(
          "a",
          { href: href(row) },
          render(row),
          h("span", { className: "hbars__track" }, h("i", { style: { "--w": `${(row.total / max) * 100}%` } })),
          h("b", { className: "num" }, number(row.total)),
        ),
      ),
    ),
  );
}

export function stackBar(segments) {
  const total = Math.max(1, segments.reduce((sum, segment) => sum + segment.total, 0));
  return h(
    "div",
    { className: "stack" },
    h(
      "div",
      { className: "stack__bar" },
      segments.map((segment, index) => h("i", { className: `stack__seg stack__seg--${index}`, style: { "--w": `${(segment.total / total) * 100}%` }, title: `${segment.label}: ${number(segment.total)}` })),
    ),
    h(
      "ul",
      { className: "stack__legend" },
      segments.map((segment, index) => h("li", {}, h("i", { className: `stack__seg--${index}` }), h("span", {}, segment.label), h("b", { className: "num" }, `${Math.round((segment.total / total) * 100)}%`))),
    ),
  );
}

const SMALL_STATES = new Set(["DF", "SE", "AL", "PB", "RN", "ES", "RJ"]);
let shapes = null;

export function brazilMap(counts, { onPick, selected = "" } = {}) {
  const max = Math.max(1, ...Object.values(counts));
  const level = (value) => (value ? Math.min(5, 1 + Math.floor((Math.log(value) / Math.log(max + 1)) * 5)) : 0);
  const tip = h("div", { className: "chart__tip brmap__tip", hidden: true });
  const plot = svg("svg", { class: "brmap__svg", role: "img", "aria-label": "Mapa do Brasil com vagas por estado" });
  const root = h(
    "div",
    { className: "brmap" },
    plot,
    tip,
    h("div", { className: "brmap__legend" }, h("span", {}, "menos"), [0, 1, 2, 3, 4, 5].map((step) => h("i", { className: `heat-${step}` })), h("span", {}, "mais")),
  );
  const paths = new Map();

  root.select = (code) => {
    selected = code;
    for (const [key, path] of paths) path.classList.toggle("is-selected", key === code);
    root.classList.toggle("has-selection", Boolean(code));
  };

  shapes ??= fetch("assets/brazil.json").then((response) => response.json());
  shapes.then(({ w, h: height, states }) => {
    plot.setAttribute("viewBox", `-10 -10 ${w + 20} ${height + 20}`);
    const labels = svg("g", { class: "brmap__labels", "aria-hidden": "true" });
    Object.entries(states).forEach(([code, shape], index) => {
      const total = counts[code] ?? 0;
      const path = svg("path", { d: shape.d, class: `brmap__state heat-${level(total)}`, tabindex: "0", role: "button", "aria-label": `${STATES[code]}: ${number(total)} vagas` });
      path.style.setProperty("--i", index);
      const show = () => {
        tip.hidden = false;
        tip.replaceChildren(h("strong", {}, STATES[code]), h("span", {}, `${number(total)} ${total === 1 ? "vaga aberta" : "vagas abertas"}`));
        const box = plot.getBoundingClientRect();
        tip.style.setProperty("--x", `${(shape.x / w) * box.width}px`);
        tip.style.setProperty("--y", `${(shape.y / height) * box.height}px`);
      };
      path.addEventListener("pointerenter", show);
      path.addEventListener("focus", show);
      path.addEventListener("pointerleave", () => (tip.hidden = true));
      path.addEventListener("blur", () => (tip.hidden = true));
      path.addEventListener("click", () => onPick?.(code));
      path.addEventListener("keydown", (event) => ["Enter", " "].includes(event.key) && (event.preventDefault(), onPick?.(code)));
      paths.set(code, path);
      plot.append(path);
      if (!SMALL_STATES.has(code)) {
        const label = svg("text", { x: shape.x, y: shape.y, class: `brmap__label${level(total) >= 3 ? " is-dark" : ""}` });
        label.textContent = code;
        labels.append(label);
      }
    });
    plot.append(labels);
    root.select(selected);
  });
  return root;
}

export function sparkline(values, width = 120, height = 32) {
  const max = Math.max(1, ...values);
  const step = width / Math.max(1, values.length - 1);
  const points = values.map((value, index) => `${(index * step).toFixed(1)},${(height - 2 - (value / max) * (height - 4)).toFixed(1)}`).join(" ");
  const node = svg("svg", { viewBox: `0 0 ${width} ${height}`, class: "spark", "aria-hidden": "true" });
  node.append(svg("polyline", { points, fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", pathLength: "100" }));
  return node;
}
