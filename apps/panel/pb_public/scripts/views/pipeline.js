import { api, create, list, update } from "../core/api.js";
import { STAGES } from "../core/catalog.js";
import { ctx, loadApplications, mine } from "../core/context.js";
import { confirm, h, header, icon, logo, toast } from "../core/dom.js";
import { ago, formatDay, parseDate } from "../core/format.js";
import { interviewPrep } from "../core/interview.js";

const toInput = (value) => (value ? new Date(parseDate(value).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export default async function pipeline(root, { signal }) {
  const { items } = await list("applications", { sort: "position", perPage: 500, filter: mine() });
  const byStage = new Map(STAGES.map(([key]) => [key, []]));
  for (const item of items) byStage.get(item.stage)?.push(item);

  const add = h("button", { className: "btn btn--primary" }, icon("plus"), "Adicionar vaga de fora");
  root.append(header("Candidaturas", "Arraste os cartões entre as colunas. Cada passo fica registrado, sem planilha.", add));

  const board = h("div", { className: "kanban" });
  const columns = new Map();

  function cardFor(item) {
    const next = item.nextAt && parseDate(item.nextAt);
    const node = h(
      "li",
      { className: "kcard", tabIndex: 0, "data-id": item.id },
      h("div", { className: "kcard__top" }, logo(item.company, item.companyLogo, "sm"), h("span", {}, item.company || "Empresa")),
      h("strong", {}, item.title),
      h(
        "div",
        { className: "kcard__meta" },
        next && h("span", { className: next < Date.now() ? "tag tag--warn" : "tag tag--brand" }, icon("calendar"), formatDay(item.nextAt)),
        item.notes && h("span", { className: "tag" }, icon("edit"), "nota"),
        h("time", {}, ago(item.updated)),
      ),
    );
    node.addEventListener("click", () => !node.dataset.dragged && edit(item));
    node.addEventListener("keydown", (event) => {
      const order = STAGES.map(([key]) => key);
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (event.key === "Enter") edit(item);
      if (!step) return;
      const target = order[order.indexOf(item.stage) + step];
      if (target) move(item, target, Infinity);
    });
    node.addEventListener("pointerdown", (event) => drag(event, node, item));
    return node;
  }

  function paint() {
    board.replaceChildren(
      ...STAGES.map(([key, label, hint], index) => {
        const list = h("ul", { className: "kcol__list" }, byStage.get(key).map(cardFor));
        columns.set(key, list);
        return h(
          "section",
          { className: `kcol kcol--${key}`, style: { "--i": index } },
          h("header", {}, h("strong", {}, label), h("span", { className: "kcol__count num" }, byStage.get(key).length || ""), h("small", {}, hint)),
          list,
        );
      }),
    );
  }

  async function move(item, stage, index) {
    const from = byStage.get(item.stage);
    from.splice(from.indexOf(item), 1);
    const target = byStage.get(stage);
    const at = Math.min(index, target.length);
    target.splice(at, 0, item);
    const before = target[at - 1]?.position ?? 0;
    const after = target[at + 1]?.position ?? before + 2;
    const changes = { stage, position: (before + after) / 2 };
    if (stage === "aplicada" && !item.appliedAt) changes.appliedAt = new Date().toISOString();
    Object.assign(item, changes);
    paint();
    columns.get(stage).querySelector(`[data-id="${item.id}"]`)?.animate([{ transform: "scale(1.04)" }, { transform: "none" }], { duration: 360, easing: "cubic-bezier(0.34, 1.5, 0.64, 1)" });
    try {
      await update("applications", item.id, changes);
      if (stage === "contratado") toast("Contratado! Que notícia boa.");
      loadApplications().then(ctx.refreshCounts);
    } catch {
      toast("Não deu pra mover. Recarregando.");
      location.reload();
    }
  }

  function drag(event, node, item) {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let ghost = null;
    let target = null;

    const over = (x, y) => {
      for (const [stage, list] of columns) {
        const box = list.parentElement.getBoundingClientRect();
        if (x >= box.left && x <= box.right && y >= box.top - 40 && y <= box.bottom + 40) {
          const cards = [...list.children].filter((child) => child !== node);
          const index = cards.findIndex((child) => y < child.getBoundingClientRect().top + child.offsetHeight / 2);
          return { stage, index: index < 0 ? cards.length : index };
        }
      }
      return null;
    };

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!ghost && Math.hypot(dx, dy) < 6) return;
      if (!ghost) {
        const box = node.getBoundingClientRect();
        ghost = node.cloneNode(true);
        ghost.className = "kcard kcard--ghost";
        ghost.style.width = `${box.width}px`;
        ghost.style.left = `${box.left}px`;
        ghost.style.top = `${box.top}px`;
        document.body.append(ghost);
        node.classList.add("is-lifted");
        node.dataset.dragged = "1";
      }
      ghost.style.transform = `translate(${dx}px, ${dy}px) rotate(${Math.max(-4, Math.min(4, dx / 40))}deg)`;
      target = over(moveEvent.clientX, moveEvent.clientY);
      for (const [stage, list] of columns) list.parentElement.classList.toggle("is-target", stage === target?.stage);
    };

    const onUp = () => {
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerup", onUp);
      for (const list of columns.values()) list.parentElement.classList.remove("is-target");
      if (!ghost) return;
      ghost.remove();
      node.classList.remove("is-lifted");
      setTimeout(() => delete node.dataset.dragged, 0);
      if (target && (target.stage !== item.stage || byStage.get(item.stage).indexOf(item) !== target.index)) move(item, target.stage, target.index);
    };

    addEventListener("pointermove", onMove);
    addEventListener("pointerup", onUp);
  }

  function edit(item) {
    const fields = {
      notes: h("textarea", { value: item.notes ?? "", placeholder: "Como foi, o que pediram, próximos passos…" }),
      contactName: h("input", { value: item.contactName ?? "", placeholder: "Quem está cuidando da vaga", maxLength: 120 }),
      contactEmail: h("input", { value: item.contactEmail ?? "", type: "email", placeholder: "email@empresa.com", maxLength: 160 }),
      contactPhone: h("input", { value: item.contactPhone ?? "", type: "tel", placeholder: "(69) 99999-9999", maxLength: 30 }),
      salary: h("input", { value: item.salary ?? "", placeholder: "Pretensão ou proposta", maxLength: 80 }),
      nextAt: h("input", { type: "datetime-local", value: toInput(item.nextAt) }),
    };
    const stage = h("select", {}, STAGES.map(([key, label]) => h("option", { value: key, selected: key === item.stage }, label)));
    const prep = interviewPrep(item.prep ?? {});
    const letter = h("textarea", { value: item.letter ?? "", rows: 6, placeholder: "A carta que você mandou fica guardada aqui." });
    const remove = h("button", { type: "button", className: "btn btn--danger" }, icon("trash"), "Remover");
    const dialog = h(
      "dialog",
      { className: "drawer" },
      h(
        "form",
        { method: "dialog", className: "drawer__form" },
        h("header", { className: "drawer__head" }, h("h2", {}, item.title), h("button", { type: "button", className: "icon-btn", "aria-label": "Fechar", onclick: () => dialog.close() }, icon("close"))),
        h(
          "div",
          { className: "drawer__body" },
          h("div", { className: "kdetail" }, logo(item.company, item.companyLogo, "lg"), h("div", {}, h("strong", {}, item.company || "Empresa"), item.url && h("a", { href: item.url, target: "_blank", rel: "noopener noreferrer", className: "link" }, "Abrir vaga", icon("external")))),
          h("label", { className: "field" }, h("span", {}, "Etapa"), stage),
          h("label", { className: "field" }, h("span", {}, "Próximo passo"), fields.nextAt),
          prep,
          h("label", { className: "field" }, h("span", {}, "Anotações"), fields.notes),
          h("label", { className: "field" }, h("span", {}, "Contato"), fields.contactName),
          h("div", { className: "welcome__row" }, h("label", { className: "field" }, h("span", {}, "E-mail"), fields.contactEmail), h("label", { className: "field" }, h("span", {}, "Telefone"), fields.contactPhone)),
          h("label", { className: "field" }, h("span", {}, "Salário"), fields.salary),
          h("label", { className: "field" }, h("span", {}, "Carta de apresentação"), letter),
        ),
        h("footer", { className: "drawer__foot" }, remove, h("button", { className: "btn btn--primary", value: "save" }, "Salvar")),
      ),
    );
    remove.addEventListener("click", async () => {
      if (!(await confirm("Tirar essa vaga do funil?", { confirmLabel: "Remover" }))) return;
      await api(`collections/applications/records/${item.id}`, { method: "DELETE" });
      byStage.get(item.stage).splice(byStage.get(item.stage).indexOf(item), 1);
      dialog.close();
      paint();
      loadApplications().then(ctx.refreshCounts);
    });
    dialog.addEventListener("close", async () => {
      dialog.remove();
      if (dialog.returnValue !== "save") return;
      const changes = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, key === "nextAt" ? (input.value ? new Date(input.value).toISOString() : "") : input.value.trim()]));
      changes.prep = prep.value();
      changes.letter = letter.value.trim();
      try {
        Object.assign(item, await update("applications", item.id, changes));
        if (stage.value !== item.stage) await move(item, stage.value, Infinity);
        else paint();
        toast("Guardado.");
      } catch {
        toast("Não deu pra salvar.");
      }
    });
    document.body.append(dialog);
    dialog.showModal();
  }

  add.addEventListener("click", () => {
    const title = h("input", { required: true, maxLength: 300, placeholder: "Ex.: Auxiliar administrativo" });
    const company = h("input", { maxLength: 160, placeholder: "Nome da empresa" });
    const url = h("input", { type: "url", placeholder: "https://…" });
    const dialog = h(
      "dialog",
      { className: "drawer" },
      h(
        "form",
        { method: "dialog", className: "drawer__form" },
        h("header", { className: "drawer__head" }, h("h2", {}, "Vaga de fora"), h("button", { type: "button", className: "icon-btn", "aria-label": "Fechar", onclick: () => dialog.close() }, icon("close"))),
        h(
          "div",
          { className: "drawer__body" },
          h("p", { className: "lead" }, "Achou uma vaga por indicação, no grupo da família ou no Instagram? Bota aqui e acompanha junto com as outras."),
          h("label", { className: "field" }, h("span", {}, "Cargo"), title),
          h("label", { className: "field" }, h("span", {}, "Empresa"), company),
          h("label", { className: "field" }, h("span", {}, "Link"), url),
        ),
        h("footer", { className: "drawer__foot" }, h("button", { className: "btn btn--primary", value: "save" }, "Adicionar")),
      ),
    );
    dialog.addEventListener("close", async () => {
      dialog.remove();
      if (dialog.returnValue !== "save" || !title.value.trim()) return;
      try {
        const record = await create("applications", { profile: ctx.profile?.id, title: title.value.trim(), company: company.value.trim(), url: url.value.trim(), stage: "salva", position: 0 });
        byStage.get("salva").unshift(record);
        paint();
        ctx.refreshCounts();
      } catch {
        toast("Confere o link e tenta de novo.");
      }
    });
    document.body.append(dialog);
    dialog.showModal();
  });

  paint();
  if (!items.length) {
    root.append(h("div", { className: "empty" }, h("strong", {}, "Seu funil está vazio"), "Abre uma vaga e aperta Salvar. Ela aparece aqui.", h("a", { className: "btn btn--primary", href: "#buscar" }, icon("radar"), "Buscar vagas")));
  }
  root.append(board);
  signal.addEventListener("abort", () => document.querySelector(".kcard--ghost")?.remove());
}
