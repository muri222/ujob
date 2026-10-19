import { count, list, quote, update } from "../core/api.js";
import { ctx } from "../core/context.js";
import { cat, h, header, icon, toast } from "../core/dom.js";
import { ago, number } from "../core/format.js";
import { describe, toFilter } from "../core/query.js";

const EVERY = [
  [30, "a cada 30 min"],
  [60, "de hora em hora"],
  [120, "a cada 2 horas"],
  [360, "a cada 6 horas"],
  [1440, "uma vez por dia"],
];

export default async function saved(root) {
  const { items } = await list("searches", { filter: "saved = true", sort: "-finishedAt", perPage: 100 });
  root.append(header("Buscas salvas", "Elas rodam sozinhas no ritmo que você escolher e avisam quando entra vaga nova.", h("a", { className: "btn btn--primary", href: "#buscar" }, icon("plus"), "Nova busca")));

  if (!items.length) {
    root.append(
      h(
        "div",
        { className: "empty card" },
        h("span", { className: "cat", style: { "--size": "56px" } }, icon("bell")),
        h("strong", {}, "Nenhuma busca salva ainda"),
        "Na hora de buscar, marca “Salvar e me avisar”. O radar faz o resto.",
        h("a", { className: "btn btn--primary", href: "#buscar" }, icon("radar"), "Fazer uma busca"),
      ),
    );
    return;
  }

  const fresh = await Promise.all(items.map((item) => count("jobs", `${toFilter(item)} && firstSeenAt > ${quote(item.seenAt || item.requestedAt)}`).catch(() => 0)));

  root.append(
    h(
      "ul",
      { className: "alerts stagger" },
      items.map((item, index) => {
        const every = h("select", { className: "input input--inline", "aria-label": "Frequência" }, EVERY.map(([minutes, text]) => h("option", { value: minutes, selected: minutes === (item.everyMinutes || 120) }, text)));
        every.addEventListener("change", () => update("searches", item.id, { everyMinutes: Number(every.value) }).then(() => toast("Ritmo atualizado.")));
        const node = h(
          "li",
          { className: "alert", style: { "--i": index } },
          cat(item.category || "outros", 44),
          h(
            "div",
            { className: "alert__body" },
            h("strong", {}, item.name || describe(item)),
            h("span", {}, item.finishedAt ? `Rodou ${ago(item.finishedAt)} · ${number(item.found)} encontradas` : "Esperando a primeira rodada", " · ", every),
          ),
          fresh[index] > 0 ? h("span", { className: "alert__new" }, h("b", { className: "num" }, number(fresh[index])), fresh[index] === 1 ? " nova" : " novas") : h("span", { className: "tag" }, "nada novo"),
          h(
            "div",
            { className: "alert__actions" },
            h("a", { className: "btn btn--primary", href: `#buscar/${item.id}` }, "Abrir"),
            h(
              "button",
              {
                className: "icon-btn",
                title: "Rodar agora",
                "aria-label": "Rodar agora",
                onclick: () => update("searches", item.id, { status: "queued", requestedAt: new Date().toISOString() }).then(() => (location.hash = `#buscar/${item.id}`)),
              },
              icon("refresh"),
            ),
            h(
              "button",
              {
                className: "icon-btn",
                title: "Parar de avisar",
                "aria-label": "Parar de avisar",
                onclick: async () => {
                  await update("searches", item.id, { saved: false });
                  node.animate([{ opacity: 1 }, { opacity: 0, transform: "translateX(-16px)" }], { duration: 240 }).finished.then(() => node.remove());
                  ctx.refreshCounts();
                  toast("Busca removida dos alertas.");
                },
              },
              icon("trash"),
            ),
          ),
        );
        return node;
      }),
    ),
  );
}
