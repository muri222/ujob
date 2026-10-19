import { create, list, quote, update } from "./api.js";
import { CATEGORIES, CONTRACTS, SENIORITY } from "./catalog.js";
import { ctx, track } from "./context.js";
import { h, modal, toast } from "./dom.js";
import { salary } from "./format.js";

// motivo pronto → fato aprovado na Mente (escolha explícita do usuário, sem IA)
function reasons(job) {
  return [
    job.workplace === "presencial" && ["Presencial", "restricao", "Não quer trabalho presencial"],
    job.workplace === "hibrido" && ["Híbrido", "restricao", "Não quer trabalho híbrido"],
    job.city && ["Longe de casa", "restricao", `Não quer vagas em ${job.city}${job.state ? `/${job.state}` : ""}`],
    job.salaryMin > 0 ? ["Salário baixo", "preferencia", `Quer salário acima de ${salary(job)}`] : ["Sem salário", "preferencia", "Prefere vagas que informam o salário"],
    job.category && ["Fora da minha área", "restricao", `Não quer vagas de ${CATEGORIES[job.category]}`],
    job.seniority && ["Nível errado", "restricao", `Não quer vagas nível ${SENIORITY[job.seniority]}`],
    job.contract && ["Tipo de contrato", "restricao", `Não aceita contrato ${CONTRACTS[job.contract]}`],
    job.company && ["Não curto a empresa", "restricao", `Não quer vagas na ${job.company}`],
  ].filter(Boolean);
}

async function remember(kind, text, origin) {
  const { totalItems } = await list("mind_facts", { filter: `profile = ${quote(ctx.profile.id)} && text = ${quote(text)}`, perPage: 1, fields: "id" });
  if (!totalItems) await create("mind_facts", { profile: ctx.profile.id, kind, text, origin, confidence: 1, status: "aprovado" });
}

export async function refuse(job) {
  if (!ctx.profile) return toast("Crie seu perfil primeiro.");
  const picked = new Set();
  const options = reasons(job);
  const chips = options.map(([label], index) => {
    const chip = h("button", { type: "button", className: "chip", "aria-pressed": "false" }, label);
    chip.addEventListener("click", () => {
      picked.has(index) ? picked.delete(index) : picked.add(index);
      chip.setAttribute("aria-pressed", String(picked.has(index)));
    });
    return chip;
  });
  const text = h("textarea", { rows: 3, maxLength: 1000, placeholder: "Conta com suas palavras (opcional). O Claude transforma em aprendizado pra Mente." });
  const dialog = h(
    "dialog",
    { className: "confirm refuse" },
    h(
      "form",
      { method: "dialog" },
      h("p", {}, h("strong", {}, "Por que essa não?"), h("br"), h("small", {}, "A Mente aprende e as próximas notas já levam isso em conta.")),
      h("div", { className: "quick" }, chips),
      h("label", { className: "field" }, text),
      h("div", { className: "confirm__actions" }, h("button", { className: "btn btn--ghost", value: "no", formNoValidate: true }, "Cancelar"), h("button", { className: "btn btn--primary", value: "yes" }, "Recusar vaga")),
    ),
  );
  if (!(await modal(dialog, (value) => value === "yes"))) return false;

  const origin = `recusa: ${job.title}`.slice(0, 160);
  const chosen = [...picked].map((index) => options[index]);
  const reason = [...chosen.map(([label]) => label), text.value.trim()].filter(Boolean).join(" · ");
  try {
    const record = await track(job, "recusada");
    if (reason) await update("applications", record.id, { reason });
    for (const [, kind, fact] of chosen) await remember(kind, fact, origin);
    if (text.value.trim()) {
      await create("ai_tasks", { type: "mind_extract", profile: ctx.profile.id, ref: job.id, status: "queued", payload: { text: text.value.trim(), vaga: `${job.title} · ${job.company ?? ""}`, origin }, attempts: 0 });
    }
    toast(chosen.length || text.value.trim() ? "Recusada. A Mente anotou." : "Recusada.", { label: "Ver a Mente", run: () => (location.hash = "#mente") });
    return true;
  } catch {
    toast("Não deu pra registrar a recusa.");
    return false;
  }
}
