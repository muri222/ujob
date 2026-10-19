import { update } from "./api.js";
import { CATEGORIES } from "./catalog.js";
import { applicationFor, ctx, track } from "./context.js";
import { h, icon, toast } from "./dom.js";
import { match } from "./match.js";

export const DEFAULT_LETTER = `Olá, equipe {empresa}!

Vi a vaga de {cargo} e tenho muito interesse na oportunidade. {resumo}

{experiencia}Acredito que posso contribuir com {habilidades}, sempre com dedicação e vontade de aprender.

Fico à disposição para uma conversa. Meu contato: {contato}.

Agradeço a atenção,
{nome}`;

const list = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} e ${items.at(-1)}` : items[0] ?? "");

export function compose(job, profile = ctx.profile ?? {}) {
  const result = match(job, profile);
  const skills = result?.hits.length ? result.hits : (profile.skills ?? []).slice(0, 3);
  const last = (profile.experiences ?? [])[0];
  const values = {
    empresa: job.company || "de recrutamento",
    cargo: job.title,
    nome: profile.name || "",
    area: CATEGORIES[job.category] ?? "",
    resumo: profile.about ? profile.about.split(/(?<=[.!?])\s/).slice(0, 2).join(" ") : profile.headline ? `Sou ${profile.headline.toLowerCase()}.` : "",
    experiencia: last?.role ? `Atualmente${last.end ? " (até recentemente)" : ""} atuo como ${last.role}${last.company ? ` na ${last.company}` : ""}. ` : "",
    habilidades: skills.length ? list(skills) : "a minha experiência",
    contato: [profile.phone, profile.email].filter(Boolean).join(" · ") || "pelo e-mail desta candidatura",
  };
  return (profile.letter || DEFAULT_LETTER).replace(/\{(\w+)\}/g, (all, key) => values[key] ?? all).replace(/\n{3,}/g, "\n\n").trim();
}

export function letterDrawer(job) {
  const text = h("textarea", { className: "letter__text", value: compose(job), spellcheck: true, rows: 16 });
  const dialog = h(
    "dialog",
    { className: "drawer" },
    h("header", { className: "drawer__head" }, h("div", {}, h("p", { className: "eyebrow" }, icon("letter"), "Carta de apresentação"), h("h2", {}, job.title)), h("button", { className: "icon-btn", "aria-label": "Fechar", onclick: () => dialog.close() }, icon("close"))),
    h(
      "div",
      { className: "drawer__body" },
      h("p", { className: "letter__hint" }, "Montei com base no seu currículo e no que a vaga pede. Ajuste o que quiser antes de mandar."),
      text,
    ),
    h(
      "footer",
      { className: "drawer__foot" },
      h("button", { className: "btn btn--ghost", onclick: () => (text.value = compose(job)) }, icon("refresh"), "Refazer"),
      h("button", { className: "btn", onclick: () => navigator.clipboard.writeText(text.value).then(() => toast("Carta copiada.")) }, icon("copy"), "Copiar"),
      job.contactEmail
        ? h("a", { className: "btn", href: `mailto:${job.contactEmail}?subject=${encodeURIComponent(`Candidatura: ${job.title}`)}&body=${encodeURIComponent(text.value)}`, onclick: (event) => (event.currentTarget.href = `mailto:${job.contactEmail}?subject=${encodeURIComponent(`Candidatura: ${job.title}`)}&body=${encodeURIComponent(text.value)}`) }, icon("mail"), "E-mail")
        : null,
      h(
        "button",
        {
          className: "btn btn--primary",
          onclick: async () => {
            try {
              const record = await track(job, applicationFor(job.id)?.stage ?? "salva");
              await update("applications", record.id, { letter: text.value });
              toast("Carta guardada no funil.");
              dialog.close();
            } catch {
              toast("Não deu pra guardar agora.");
            }
          },
        },
        icon("bookmark"),
        "Guardar",
      ),
    ),
  );
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}
