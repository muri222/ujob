import { get, list, quote } from "../core/api.js";
import { h, icon } from "../core/dom.js";
import { jobDetail, jobRow } from "../core/job.js";

export default async function job(root, { params }) {
  const item = await get("jobs", params.id, { expand: "source" }).catch(() => null);
  if (!item) {
    root.append(h("div", { className: "lost" }, h("strong", {}, "Ops"), h("p", {}, "Essa vaga saiu do ar ou nunca existiu."), h("a", { className: "btn btn--primary", href: "#vagas" }, "Ver outras vagas")));
    return;
  }

  const back = h("a", { className: "btn btn--ghost", href: "#vagas" }, icon("back"), "Todas as vagas");
  root.append(h("div", { className: "solo" }, back, h("div", { className: "solo__card" }, jobDetail(item))));

  if (!item.company) return;
  const { items } = await list("jobs", { filter: `status = 'open' && company = ${quote(item.company)} && id != ${quote(item.id)}`, sort: "-firstSeenAt", perPage: 6, expand: "source" });
  if (!items.length) return;
  root.append(
    h(
      "section",
      { className: "section solo" },
      h("header", { className: "section__head" }, h("h2", {}, `Mais vagas na ${item.company}`), h("a", { href: `#vagas?company=${encodeURIComponent(item.company)}` }, "Ver todas", icon("arrow"))),
      h("ul", { className: "rows rows--plain stagger" }, items.map((other, i) => {
        const row = jobRow(other);
        row.style.setProperty("--i", i);
        row.addEventListener("click", () => (location.hash = `#vaga/${other.id}`));
        return row;
      })),
    ),
  );
}
