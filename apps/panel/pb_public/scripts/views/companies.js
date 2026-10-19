import { api, list, quote, update } from "../core/api.js";
import { h, header, icon, logo, toast } from "../core/dom.js";
import { ago, number, parseDate } from "../core/format.js";
import { segmented } from "../core/ui.js";

const PER_PAGE = 48;

export default async function companies(root, { signal }) {
  let mode = "hiring";
  let page = 1;
  let typing;
  const input = h("input", { type: "search", placeholder: "Buscar empresa", maxLength: 60 });
  const grid = h("ul", { className: "companies stagger" });
  const more = h("button", { className: "btn more", hidden: true }, "Carregar mais");
  const tabs = segmented(
    [
      ["hiring", "Contratando agora"],
      ["follow", "Seguir empresas"],
    ],
    mode,
    (value) => {
      mode = value;
      load(true);
    },
    "Visão",
  );

  root.append(
    header("Empresas", "Quem está contratando agora e quais páginas de carreira você quer acompanhar de perto.", tabs),
    h("div", { className: "toolbar-row" }, h("label", { className: "search" }, icon("search"), input)),
    grid,
    more,
  );

  const hiringCard = (company, index) =>
    h(
      "li",
      { style: { "--i": index % PER_PAGE } },
      h(
        "a",
        { className: "company", href: `#vagas?company=${encodeURIComponent(company.name)}` },
        logo(company.name, company.logo, "lg"),
        h("strong", {}, company.name),
        h("span", { className: "company__count num" }, number(company.total), h("small", {}, company.total === 1 ? " vaga aberta" : " vagas abertas")),
        h(
          "span",
          { className: "company__meta" },
          company.remote > 0 && h("span", { className: "tag" }, icon("laptop"), `${number(company.remote)} remotas`),
          Date.now() - parseDate(company.latest) < 864e5 && h("span", { className: "tag tag--brand" }, h("i", { className: "dot dot--live" }), "nova hoje"),
        ),
      ),
    );

  function followCard(source, index) {
    const button = h("button", { className: source.active ? "btn is-done" : "btn btn--primary" }, icon(source.active ? "check" : "plus"), source.active ? "Seguindo" : "Seguir");
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        source = await update("sources", source.id, { active: !source.active, runRequested: !source.active });
        button.className = source.active ? "btn is-done" : "btn btn--primary";
        button.replaceChildren(icon(source.active ? "check" : "plus"), source.active ? "Seguindo" : "Seguir");
        toast(source.active ? `Seguindo ${source.name}. As vagas chegam na próxima coleta.` : `Parou de seguir ${source.name}.`);
      } catch {
        toast("Não deu pra atualizar.");
      } finally {
        button.disabled = false;
      }
    });
    return h(
      "li",
      { style: { "--i": index % PER_PAGE } },
      h(
        "div",
        { className: "company" },
        logo(source.name, source.logoUrl, "lg"),
        h("strong", {}, source.name),
        h("span", { className: "company__hint" }, source.group === "agencia" ? "Agência de RH" : "Página de carreira", source.lastRunAt ? ` · coletada ${ago(source.lastRunAt)}` : ""),
        button,
      ),
    );
  }

  async function load(reset) {
    if (reset) {
      page = 1;
      grid.replaceChildren(...Array.from({ length: 12 }, () => h("li", {}, h("div", { className: "company skeleton company--ghost" }))));
    }
    const term = input.value.trim();
    let items;
    let hasMore;
    if (mode === "hiring") {
      const result = await api(`ujob/companies?q=${encodeURIComponent(term)}&page=${page}`);
      items = result.items.map(hiringCard);
      hasMore = result.more;
    } else {
      const filter = [`kind = 'gupy'`, term && `name ~ ${quote(term)}`].filter(Boolean).join(" && ");
      const result = await list("sources", { filter, sort: "-active,name", page, perPage: PER_PAGE, fields: "id,name,logoUrl,group,active,lastRunAt" });
      items = result.items.map(followCard);
      hasMore = result.page < result.totalPages;
    }
    if (signal.aborted) return;
    if (reset) grid.replaceChildren(...items);
    else grid.append(...items);
    if (reset && !items.length) grid.replaceChildren(h("li", { className: "empty" }, h("strong", {}, "Nenhuma empresa por aqui"), "Tenta outro nome."));
    more.hidden = !hasMore;
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
