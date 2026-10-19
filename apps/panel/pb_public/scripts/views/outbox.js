import { api, list, update } from "../core/api.js";
import { ctx, mine } from "../core/context.js";
import { h, header, icon, logo, toast } from "../core/dom.js";
import { ago } from "../core/format.js";
import { listen } from "../core/realtime.js";
import { paper } from "./resume.js";

const STATUS = {
  gerando: ["Claude preparando…", "tag tag--brand"],
  pronta: ["Pronta", "tag tag--ok"],
  enviando: ["Enviando…", "tag tag--brand"],
  enviada: ["Enviada", "tag"],
  erro: ["Falhou", "tag tag--down"],
};

export default async function outbox(root, { signal }) {
  if (!ctx.profile) {
    root.append(header("Prontas para enviar", null), h("div", { className: "empty card" }, h("strong", {}, "Crie seu perfil primeiro"), "As candidaturas preparadas pelo Claude aparecem aqui."));
    return;
  }
  const holder = h("div", { className: "outbox" });
  const quota = h("small", {});
  root.append(header("Prontas para enviar", "O Claude prepara carta e CV para cada vaga. Você revisa, edita e só sai com o seu clique."), h("p", { className: "outbox__quota" }, quota), holder);

  function card(message) {
    const lead = message.expand?.lead;
    const job = message.expand?.job ?? (lead ? { title: `E-mail frio · ${lead.name}`, company: lead.domain, url: lead.website } : {});
    const [label, tone] = STATUS[message.status] ?? STATUS.pronta;
    const subject = h("input", { value: message.subject ?? "", maxLength: 200 });
    const body = h("textarea", { value: message.body ?? "", rows: 12, maxLength: 8000 });
    const editable = message.status === "pronta";
    subject.disabled = body.disabled = !editable;
    const persist = () => update("messages", message.id, { subject: subject.value, body: body.value }).catch(() => {});
    subject.addEventListener("change", persist);
    body.addEventListener("change", persist);

    const send = async (button) => {
      button.disabled = true;
      try {
        const { sentToday, cap } = await api(`radar/messages/${message.id}/send`, { method: "POST", body: { subject: subject.value, body: body.value } });
        toast(`Enviando. ${sentToday} de ${cap} hoje.`);
      } catch (error) {
        toast(error.message);
        button.disabled = false;
      }
    };
    const discard = () => update("messages", message.id, { status: "descartada" }).then(load);
    const copy = () => navigator.clipboard.writeText(body.value).then(() => toast("Carta copiada."), () => toast("Não deu pra copiar."));

    const actions =
      message.status === "pronta"
        ? message.channel === "email"
          ? [h("button", { className: "btn btn--primary", onclick: (event) => send(event.currentTarget) }, icon("send"), `Enviar para ${message.to}`)]
          : [h("button", { className: "btn btn--primary", onclick: copy }, icon("copy"), "Copiar carta"), job.applyUrl || job.url ? h("a", { className: "btn", href: job.applyUrl || job.url, target: "_blank", rel: "noopener noreferrer" }, icon("external"), "Abrir vaga") : null, h("small", {}, "Essa vaga não tem e-mail: candidate-se no site com a carta.")]
        : message.status === "erro" && message.body
          ? [h("button", { className: "btn btn--soft", onclick: () => update("messages", message.id, { status: "pronta", error: "" }).then(load) }, icon("undo"), "Voltar pra revisão")]
          : [];

    return h(
      "article",
      { className: "panel outbox__item" },
      h(
        "header",
        { className: "outbox__head" },
        logo(job.company, job.companyLogo),
        h("div", {}, h("strong", {}, job.title ?? "Vaga"), h("small", {}, [job.company, message.lang && message.lang.toUpperCase(), ago(message.updatedAt)].filter(Boolean).join(" · "))),
        h("span", { className: tone }, label),
      ),
      message.status === "gerando" ? h("p", { className: "fit__ai" }, h("span", { className: "spinner" }), "Escrevendo a carta e adaptando o CV sem inventar nada…") : null,
      message.error ? h("p", { className: "fit__err" }, message.error) : null,
      message.body
        ? h(
            "div",
            { className: "outbox__grid" },
            h("div", { className: "outbox__letter" }, h("label", { className: "field" }, h("span", {}, "Assunto"), subject), h("label", { className: "field" }, h("span", {}, "Carta"), body)),
            message.cv ? h("div", { className: "outbox__cv" }, h("span", { className: "eyebrow" }, "CV adaptado (vai em PDF)"), paper(message.cv)) : null,
          )
        : null,
      h("div", { className: "import__row" }, ...actions, message.status !== "enviando" && message.status !== "enviada" ? h("button", { className: "btn btn--ghost", onclick: discard }, "Descartar") : null),
    );
  }

  const known = new Map();
  async function load() {
    try {
      const since = new Date(Date.now() - 864e5).toISOString().replace("T", " ");
      const [{ items }, sent] = await Promise.all([
        list("messages", { filter: mine("status != 'descartada'"), sort: "-updatedAt", perPage: 50, expand: "job,lead" }),
        list("messages", { filter: mine(`status = 'enviada' && sentAt >= '${since}'`), perPage: 1, fields: "id" }),
      ]);
      quota.textContent = `${sent.totalItems} de ${ctx.profile.dailyCap || 10} envios nas últimas 24h · ajuste em Configurações`;
      for (const item of items) known.set(item.id, item.status);
      holder.replaceChildren(
        ...(items.length
          ? items.map(card)
          : [h("div", { className: "empty card" }, h("strong", {}, "Nada por aqui ainda"), "Abra uma vaga e clique em Preparar candidatura.", h("a", { className: "btn btn--primary", href: "#vagas" }, "Ver vagas"))]),
      );
    } catch {
      holder.replaceChildren(h("div", { className: "empty card" }, h("strong", {}, "Não deu pra carregar"), "Tenta recarregar a página."));
    }
  }

  // só recarrega quando muda o status (não atropela a carta que você está editando)
  listen("messages", ({ record }) => record.profile === ctx.profile.id && known.get(record.id) !== record.status && load(), signal);
  await load();
}
