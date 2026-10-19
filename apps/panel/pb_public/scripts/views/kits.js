import { api, list } from "../core/api.js";
import { askClaude, brainProblem, ctx, mine } from "../core/context.js";
import { h, header, icon, modal, toast } from "../core/dom.js";
import { ago } from "../core/format.js";
import { listen } from "../core/realtime.js";
import { paper } from "./resume.js";

// Kits de candidatura (igual AiApply): carta + CV adaptado + follow-up, de vaga do radar ou de qualquer descrição colada
const STATUS = { gerando: ["Gerando", "tag--brand"], pronta: ["Pronto", "tag--ok"], enviando: ["Enviando", "tag--brand"], enviada: ["Enviado", "tag--ok"], erro: ["Falhou", "tag--down"], descartada: ["Descartado", ""] };
const fileSafe = (text) => String(text || "").normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");

const copy = (text) => navigator.clipboard.writeText(text).then(() => toast("Copiado."));

async function downloadCv(kit, button) {
  button.disabled = true;
  try {
    const { pdf } = await askClaude("cv_pdf", { cv: { ...ctx.profile, ...kit.cv }, lang: kit.lang || "pt" }, { timeout: 60_000 });
    const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(pdf), (char) => char.charCodeAt(0))], { type: "application/pdf" }));
    h("a", { href: url, download: `${fileSafe(ctx.profile.name || "curriculo")}-${fileSafe(kit.company || "vaga")}.pdf` }).click();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

function openKit(kit) {
  const block = (title, text, ...extra) => h("section", { className: "kit__block" }, h("header", {}, h("h3", {}, title), text ? h("button", { type: "button", className: "btn btn--ghost btn--sm", onclick: () => copy(text) }, icon("copy"), "Copiar") : null, ...extra), text ? h("pre", { className: "auto__pre" }, text) : null);
  const pdf = h("button", { type: "button", className: "btn btn--soft btn--sm" }, icon("upload"), "Baixar PDF");
  pdf.addEventListener("click", () => downloadCv(kit, pdf));
  const dialog = h(
    "dialog",
    { className: "auto__drawer" },
    h("div", { className: "auto__drawer-head" }, h("div", {}, h("strong", {}, kit.title || "Kit de candidatura"), h("small", { className: "settings__help" }, ` ${kit.company || ""}`)), h("button", { className: "icon-btn", "aria-label": "Fechar", onclick: () => dialog.close() }, icon("close"))),
    h(
      "div",
      { className: "auto__pane kit" },
      block(`Carta${kit.subject ? `: ${kit.subject}` : ""}`, kit.body),
      kit.followup ? block("E-mail de follow-up (mande em 7 dias)", kit.followup) : null,
      kit.cv ? h("section", { className: "kit__block" }, h("header", {}, h("h3", {}, "CV adaptado"), pdf), h("div", { className: "resume__paper translate__paper" }, paper({ ...ctx.profile, ...kit.cv }))) : null,
      kit.channel === "email" && kit.status === "pronta" ? h("a", { className: "btn btn--primary", href: "#envios" }, icon("send"), "Revisar e enviar por e-mail") : null,
    ),
  );
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (event) => event.target === dialog && dialog.close());
  document.body.append(dialog);
  dialog.showModal();
}

async function newKit() {
  const title = h("input", { maxLength: 200, placeholder: "Ex.: Character Artist" });
  const company = h("input", { maxLength: 160, placeholder: "Ex.: Studio X" });
  const to = h("input", { type: "email", placeholder: "E-mail do recrutador (opcional)" });
  const text = h("textarea", { rows: 8, required: true, maxLength: 12000, placeholder: "Cole aqui a descrição da vaga (do LinkedIn, do site da empresa, de onde for)" });
  const dialog = h(
    "dialog",
    { className: "confirm kit__new" },
    h(
      "form",
      { method: "dialog" },
      h("p", {}, h("strong", {}, "Novo kit de candidatura"), h("br"), h("small", {}, "Carta, CV adaptado e e-mail de follow-up, a partir do seu currículo. Nada é inventado.")),
      h("div", { className: "resume__grid" }, h("label", { className: "field" }, h("span", {}, "Cargo"), title), h("label", { className: "field" }, h("span", {}, "Empresa"), company)),
      h("label", { className: "field" }, h("span", {}, "Descrição da vaga"), text),
      h("label", { className: "field" }, h("span", {}, "E-mail pra enviar"), to),
      h("div", { className: "confirm__actions" }, h("button", { className: "btn btn--ghost", value: "no", formNoValidate: true }, "Cancelar"), h("button", { className: "btn btn--primary", value: "yes" }, icon("sparkle"), "Gerar")),
    ),
  );
  if (!(await modal(dialog, (value) => value === "yes"))) return;
  const problem = await brainProblem(true);
  if (problem) return toast(problem);
  try {
    await api("radar/kit", { method: "POST", body: { profile: ctx.profile.id, title: title.value, company: company.value, text: text.value, to: to.value } });
    toast("O Claude está montando o kit (leva ~1 min). Aparece aqui sozinho.");
  } catch (error) {
    toast(error.message);
  }
}

export default async function kits(root, { signal }) {
  if (!ctx.profile) {
    root.append(header("Kits de candidatura", null), h("div", { className: "empty card" }, h("strong", {}, "Crie sua primeira função"), "Use o seletor no topo do menu."));
    return;
  }
  const search = h("input", { type: "search", placeholder: "Cargo, empresa ou palavra-chave" });
  const grid = h("div", { className: "kits" });
  let items = [];
  const paint = () => {
    const term = search.value.trim().toLowerCase();
    const shown = items.filter((kit) => !term || `${kit.title} ${kit.company} ${kit.subject}`.toLowerCase().includes(term));
    grid.replaceChildren(
      ...shown.map((kit) => {
        const [text, tone] = STATUS[kit.status] ?? STATUS.pronta;
        return h(
          "button",
          { type: "button", className: "panel kit-card", disabled: kit.status === "gerando", onclick: () => openKit(kit) },
          h("span", { className: `tag ${tone}` }, kit.status === "gerando" ? h("span", { className: "spinner" }) : null, text),
          h("strong", {}, kit.title || kit.subject || "Kit de candidatura"),
          h("span", {}, kit.company || kit.to || ""),
          h("small", {}, [kit.kit ? "Descrição colada" : "Vaga do radar", ago(kit.createdAt)].join(" · ")),
          kit.error ? h("small", { className: "fit__err" }, kit.error) : null,
        );
      }),
    );
    if (!shown.length) grid.append(h("div", { className: "empty card" }, h("strong", {}, items.length ? "Nenhum kit com esse filtro" : "Nenhum kit ainda"), "Crie um kit colando a descrição de qualquer vaga, ou use Candidatar numa vaga do radar.", h("button", { className: "btn btn--primary", onclick: newKit }, icon("plus"), "Novo kit")));
  };
  const load = async () => {
    ({ items } = await list("messages", { filter: mine("lead = ''"), sort: "-createdAt", perPage: 200 }));
    paint();
  };
  search.addEventListener("input", paint);
  root.append(
    header("Kits de candidatura", "Carta, CV adaptado e follow-up pra cada vaga, gerados pelo Claude a partir do seu currículo.", h("button", { className: "btn btn--primary", onclick: newKit }, icon("plus"), "Novo kit de candidatura")),
    h("div", { className: "auto__toolbar" }, search),
    grid,
  );
  await load();
  listen("messages", ({ record }) => record.profile === ctx.profile.id && load(), signal);
}
