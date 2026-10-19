import { list } from "../core/api.js";
import { h, header, icon, logo } from "../core/dom.js";
import { formatDateTime, number } from "../core/format.js";
import { segmented } from "../core/ui.js";

const PER_PAGE = 50;

export default async function history(root, { signal }) {
  let status = "";
  let page = 1;
  const rows = h("ul", { className: "history" });
  const more = h("button", { className: "btn more", hidden: true }, "Carregar mais");
  const tabs = segmented(
    [
      ["", "Todas"],
      ["ok", "Com vagas"],
      ["empty", "Vazias"],
      ["error", "Com erro"],
    ],
    status,
    (value) => {
      status = value;
      load(true);
    },
    "Situação",
  );

  root.append(header("Histórico", "Cada coleta fica registrada: o que entrou, o que foi atualizado e o que encerrou.", tabs), rows, more);

  const row = (run, index) => {
    const source = run.expand?.source ?? {};
    return h(
      "li",
      { className: `history__row is-${run.status}`, style: { "--i": index % PER_PAGE } },
      logo(source.name, source.logoUrl),
      h("div", { className: "history__who" }, h("strong", {}, source.name ?? "Fonte"), h("span", {}, formatDateTime(run.finishedAt), run.search && " · busca sob demanda")),
      h(
        "div",
        { className: "history__numbers" },
        h("span", { title: "Vistas" }, icon("eye"), h("b", { className: "num" }, number(run.found))),
        h("span", { title: "Novas", className: run.created ? "is-up" : "" }, icon("plus"), h("b", { className: "num" }, number(run.created))),
        h("span", { title: "Atualizadas" }, icon("refresh"), h("b", { className: "num" }, number(run.updated))),
        h("span", { title: "Encerradas" }, icon("close"), h("b", { className: "num" }, number(run.closed))),
      ),
      run.error && h("p", { className: "history__error" }, run.error),
    );
  };

  async function load(reset) {
    if (reset) page = 1;
    const result = await list("runs", { filter: status ? `status = '${status}'` : "", sort: "-finishedAt", page, perPage: PER_PAGE, expand: "source", fields: "*,expand.source.name,expand.source.logoUrl" });
    if (signal.aborted) return;
    const nodes = result.items.map(row);
    if (reset) {
      rows.classList.add("stagger");
      rows.replaceChildren(...nodes);
    } else rows.append(...nodes);
    if (reset && !nodes.length) rows.replaceChildren(h("li", { className: "empty" }, h("strong", {}, "Nada por aqui"), "Quando o radar rodar, cada coleta aparece nessa lista."));
    more.hidden = result.page >= result.totalPages;
  }

  more.addEventListener("click", () => {
    page++;
    load(false);
  });
  await load(true);
}
