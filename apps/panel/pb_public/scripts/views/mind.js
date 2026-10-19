import { api, create, list, update } from "../core/api.js";
import { ctx, mine } from "../core/context.js";
import { confirm, h, header, icon, toast } from "../core/dom.js";
import { ago } from "../core/format.js";
import { listen } from "../core/realtime.js";

const KINDS = [
  ["restricao", "Não aceita"],
  ["preferencia", "Prefere"],
  ["objetivo", "Quer"],
  ["fato", "Fato"],
];
const KIND_LABEL = Object.fromEntries(KINDS);

export default async function mind(root, { signal }) {
  if (!ctx.profile) {
    root.append(header("O que a Mente aprendeu", null), h("div", { className: "empty card" }, h("strong", {}, "Crie seu perfil primeiro"), "A Mente guarda o que você quer e o que não aceita, por perfil."));
    return;
  }
  const pending = h("ul", { className: "facts-list" });
  const approved = h("ul", { className: "facts-list" });
  const pendingBox = h("section", { className: "panel" }, h("header", { className: "section__head" }, h("h2", {}, "Pra você revisar"), h("small", {}, "Sugeridos pelo Claude a partir das suas recusas")), pending);

  const kind = h("select", { "aria-label": "Tipo" }, KINDS.map(([key, label]) => h("option", { value: key }, label)));
  const text = h("input", { maxLength: 300, placeholder: "Ex.: Só trabalho remoto, nunca presencial" });
  const add = h("form", { className: "facts-add" }, kind, text, h("button", { className: "btn btn--primary" }, icon("plus"), "Ensinar"));
  add.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!text.value.trim()) return;
    try {
      await create("mind_facts", { profile: ctx.profile.id, kind: kind.value, text: text.value.trim(), origin: "você escreveu", confidence: 1, status: "aprovado" });
      text.value = "";
      load();
    } catch {
      toast("Não deu pra salvar.");
    }
  });

  function row(fact) {
    const label = h("span", { className: `tag ${fact.kind === "restricao" ? "tag--down" : "tag--brand"}` }, KIND_LABEL[fact.kind]);
    const body = h("p", { className: "facts-list__text" }, fact.text);
    const meta = h("small", {}, [fact.origin, ago(fact.updatedAt), fact.status === "pendente" && fact.confidence < 1 ? `confiança ${Math.round(fact.confidence * 100)}%` : ""].filter(Boolean).join(" · "));

    async function edit() {
      const input = h("input", { value: fact.text, maxLength: 300 });
      body.replaceChildren(input);
      input.focus();
      const done = async () => {
        const value = input.value.trim();
        if (value && value !== fact.text) await update("mind_facts", fact.id, { text: value, status: "aprovado" }).catch(() => toast("Não salvou."));
        load();
      };
      input.addEventListener("keydown", (event) => event.key === "Enter" && done());
      input.addEventListener("blur", done);
    }
    const set = (status) => update("mind_facts", fact.id, { status }).then(load, () => toast("Não salvou."));
    const remove = async () => {
      if (!(await confirm("Esquecer esse aprendizado de vez?", { confirmLabel: "Esquecer" }))) return;
      await api(`collections/mind_facts/records/${fact.id}`, { method: "DELETE" }).then(load, () => toast("Não apagou."));
    };

    return h(
      "li",
      {},
      label,
      h("div", { className: "facts-list__body" }, body, meta),
      h(
        "div",
        { className: "facts-list__actions" },
        fact.status === "pendente" ? h("button", { className: "btn btn--soft", onclick: () => set("aprovado") }, icon("check"), "Aprovar") : null,
        h("button", { className: "icon-btn", title: "Corrigir", "aria-label": "Corrigir", onclick: edit }, icon("edit")),
        fact.status === "pendente"
          ? h("button", { className: "icon-btn", title: "Não é verdade", "aria-label": "Não é verdade", onclick: () => set("rejeitado") }, icon("close"))
          : h("button", { className: "icon-btn", title: "Esquecer", "aria-label": "Esquecer", onclick: remove }, icon("trash")),
      ),
    );
  }

  async function load() {
    try {
      const { items } = await list("mind_facts", { filter: mine("status != 'rejeitado'"), sort: "-updatedAt", perPage: 200 });
      const waiting = items.filter((fact) => fact.status === "pendente");
      const known = items.filter((fact) => fact.status === "aprovado");
      pendingBox.hidden = !waiting.length;
      pending.replaceChildren(...waiting.map(row));
      approved.replaceChildren(
        ...(known.length
          ? known.map(row)
          : [h("li", { className: "empty card" }, h("strong", {}, "A Mente ainda não sabe nada"), "Recuse vagas dizendo o porquê, ou ensine direto aqui em cima.")]),
      );
    } catch {
      approved.replaceChildren(h("li", { className: "empty card" }, h("strong", {}, "Não deu pra carregar"), "Tenta recarregar a página."));
    }
  }

  root.append(
    header("O que a Mente aprendeu", "Tudo que está aqui entra na nota que o Claude dá pras vagas. Corrija o que estiver errado."),
    pendingBox,
    h("section", { className: "panel" }, h("header", { className: "section__head" }, h("h2", {}, "Já sabe sobre você"), h("small", {}, ctx.profile.name || "")), add, approved),
  );
  listen("mind_facts", () => load(), signal);
  await load();
}
