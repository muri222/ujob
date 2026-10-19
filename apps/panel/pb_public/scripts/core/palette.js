import { list, quote } from "./api.js";
import { h, icon, logo } from "./dom.js";
import { ago } from "./format.js";

const PAGES = [
  ["Nova busca", "#buscar", "radar"],
  ["Visão geral", "#inicio", "home"],
  ["Vagas", "#vagas", "briefcase"],
  ["Maratona de candidaturas", "#maratona", "bolt"],
  ["Meu currículo", "#curriculo", "file"],
  ["Vagas novas de hoje", "#vagas?period=24h", "sparkle"],
  ["Vagas remotas", "#vagas?workplace=remoto", "laptop"],
  ["Vagas com salário", "#vagas?salary=1", "money"],
  ["Vagas com contato direto", "#vagas?contact=1", "whatsapp"],
  ["Ao vivo", "#ao-vivo", "live"],
  ["Empresas", "#empresas", "building"],
  ["Áreas e mapa", "#areas", "map"],
  ["Candidaturas", "#funil", "kanban"],
  ["Buscas salvas", "#alertas", "bell"],
  ["De onde vem as vagas", "#fontes", "antenna"],
  ["Histórico de coletas", "#historico", "history"],
];

export function createPalette({ actions }) {
  const input = h("input", { type: "search", placeholder: "Buscar vaga, empresa ou ir para…", "aria-label": "Buscar" });
  const results = h("ul", { className: "palette__results", role: "listbox" });
  const dialog = h(
    "dialog",
    { className: "palette" },
    h("label", { className: "palette__field" }, icon("search"), input, h("kbd", {}, "Esc")),
    results,
    h("footer", { className: "palette__hint" }, h("span", {}, h("kbd", {}, "↑"), h("kbd", {}, "↓"), " navegar"), h("span", {}, h("kbd", {}, "Enter"), " abrir")),
  );
  document.body.append(dialog);

  let items = [];
  let active = 0;
  let typing;

  const go = (href) => () => (location.hash = href);

  function render() {
    results.replaceChildren(
      ...(items.length
        ? items.map((item, index) =>
            h(
              "li",
              { role: "option", className: index === active ? "is-active" : "", "aria-selected": String(index === active), onmousemove: () => focus(index), onclick: () => choose(index) },
              item.visual ?? icon(item.iconName),
              h("span", {}, item.label),
              item.hint && h("small", {}, item.hint),
            ),
          )
        : [h("li", { className: "palette__empty" }, "Nada com esse nome. Tenta outra palavra.")]),
    );
  }

  function focus(index) {
    if (index === active) return;
    active = index;
    for (const [i, node] of [...results.children].entries()) {
      node.classList.toggle("is-active", i === active);
      node.setAttribute("aria-selected", String(i === active));
    }
    results.children[active]?.scrollIntoView({ block: "nearest" });
  }

  function choose(index) {
    const item = items[index];
    if (!item) return;
    dialog.close();
    item.run();
  }

  async function search() {
    const term = input.value.trim();
    const lower = term.toLowerCase();
    const shortcuts = [
      ...(term.length > 1 ? [{ label: `Buscar vagas de “${term}” agora`, run: go(`#buscar?term=${encodeURIComponent(term)}&go=1`), iconName: "radar" }] : []),
      ...PAGES.filter(([label]) => !lower || label.toLowerCase().includes(lower)).map(([label, href, iconName]) => ({ label, run: go(href), iconName })),
      ...actions.filter(([label]) => !lower || label.toLowerCase().includes(lower)).map(([label, run, iconName]) => ({ label, run, iconName })),
    ];
    items = shortcuts;
    active = 0;
    render();
    if (term.length < 2) return;

    const { items: found } = await list("jobs", { filter: `status = 'open' && (title ~ ${quote(term)} || company ~ ${quote(term)})`, sort: "-firstSeenAt", perPage: 8, fields: "id,title,company,companyLogo,firstSeenAt" }).catch(() => ({ items: [] }));
    if (input.value.trim() !== term) return;
    items = [
      ...shortcuts.slice(0, 1),
      ...found.map((job) => ({ label: job.title, hint: [job.company, ago(job.firstSeenAt)].filter(Boolean).join(" · "), visual: logo(job.company, job.companyLogo, "sm"), run: go(`#vaga/${job.id}`) })),
      ...shortcuts.slice(1),
    ];
    render();
  }

  input.addEventListener("input", () => {
    clearTimeout(typing);
    typing = setTimeout(search, 140);
  });

  input.addEventListener("keydown", (event) => {
    const moves = { ArrowDown: 1, ArrowUp: -1 };
    if (event.key in moves) {
      event.preventDefault();
      focus((active + moves[event.key] + items.length) % Math.max(items.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(active);
    }
  });

  dialog.addEventListener("click", (event) => event.target === dialog && dialog.close());

  return {
    open() {
      if (dialog.open) return;
      input.value = "";
      search();
      dialog.showModal();
      input.focus();
    },
  };
}
