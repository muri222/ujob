import { api } from "./api.js";
import { CATEGORIES, CONTRACTS, SENIORITY, STAGES, WORKPLACES } from "./catalog.js";
import { applicationFor, brainProblem, ctx, fitFor, onFit, requestFit, track, untrack } from "./context.js";
import { cat, h, host, icon, logo, safeUrl, toast } from "./dom.js";
import { ago, formatDay, parseDate, phoneLabel, salary } from "./format.js";
import { letterDrawer } from "./letter.js";
import { match, tone } from "./match.js";
import { refuse } from "./refuse.js";
import { richText } from "./sanitize.js";

const place = (job) => (job.workplace === "remoto" && !job.city ? "Remoto" : [job.city, job.state].filter(Boolean).join("/") || job.country || "Local não informado");

export const isFresh = (job) => Date.now() - parseDate(job.firstSeenAt) < 864e5;

// nota da IA quando existir, senão a regra local
const scoreOf = (job) => {
  const fit = fitFor(job.id);
  return fit?.status === "done" ? { score: fit.result.score, ai: true } : match(job);
};

export function scoreBadge(job, size = "sm") {
  const result = scoreOf(job);
  if (!result) return null;
  const node = h(
    "span",
    { className: `score score--${size} score--${tone(result.score)}${result.ai ? " score--ai" : ""}`, title: result.ai ? `${result.score}% na avaliação do Claude` : `${result.score}% compatível com o seu perfil` },
    h("b", { className: "num" }, result.score),
    h("small", {}, "%"),
  );
  if (size === "lg") {
    const ns = "http://www.w3.org/2000/svg";
    const ring = document.createElementNS(ns, "svg");
    ring.setAttribute("viewBox", "0 0 40 40");
    ring.setAttribute("class", "score__ring");
    ring.innerHTML = `<circle cx="20" cy="20" r="17" pathLength="100"/><circle class="score__arc" cx="20" cy="20" r="17" pathLength="100" stroke-dasharray="${result.score} 100"/>`;
    node.prepend(ring);
  }
  return node;
}

export function jobRow(job) {
  const stage = applicationFor(job.id)?.stage;
  return h(
    "li",
    { className: `job-row${job.status === "closed" ? " is-closed" : ""}` },
    logo(job.company || job.expand?.source?.name, job.companyLogo || job.expand?.source?.logoUrl),
    h(
      "div",
      { className: "job-row__body" },
      h("p", { className: "job-row__title" }, job.title),
      h("p", { className: "job-row__meta" }, h("span", {}, job.company || job.expand?.source?.name || "Empresa confidencial"), h("span", {}, place(job))),
      h(
        "p",
        { className: "job-row__tags" },
        job.workplace && h("span", { className: "tag" }, WORKPLACES[job.workplace]),
        job.salaryMin > 0 && h("span", { className: "tag tag--ok" }, salary(job)),
        stage && h("span", { className: `tag ${stage === "recusada" ? "tag--down" : "tag--brand"}` }, icon("bookmark"), STAGES.find(([key]) => key === stage)?.[1] ?? "Recusada"),
      ),
    ),
    h("div", { className: "job-row__side" }, scoreBadge(job), h("time", { className: "job-row__time" }, isFresh(job) && h("i", { className: "dot dot--live" }), ago(job.firstSeenAt))),
  );
}

function aiFit(job, fit) {
  const { score, por_que, atende = [], parcial = [], falta = [], vale_aplicar, motivo } = fit.result;
  const tags = (list, className) => list.map((item) => h("span", { className: `tag ${className}` }, item));
  return h(
    "section",
    { className: `fit fit--${tone(score)}` },
    scoreBadge(job, "lg"),
    h(
      "div",
      { className: "fit__body" },
      h("p", { className: "fit__head" }, h("strong", {}, vale_aplicar ? "Vale aplicar" : "Melhor pular"), h("span", { className: "tag tag--brand" }, icon("sparkle"), "avaliada pelo Claude")),
      h("p", {}, por_que),
      atende.length ? h("p", { className: "fit__row" }, icon("check"), h("span", {}, "Atende: "), tags(atende, "tag--ok")) : null,
      parcial.length ? h("p", { className: "fit__row" }, icon("level"), h("span", {}, "Em parte: "), tags(parcial, "")) : null,
      falta.length ? h("p", { className: "fit__row" }, icon("plus"), h("span", {}, "Falta: "), tags(falta, "tag--down")) : null,
      motivo ? h("p", { className: "fit__why" }, motivo) : null,
      fit.updatedAt && fit.updatedAt < ctx.profile?.updated ? [h("p", { className: "fit__err" }, "Seu perfil mudou depois desta nota."), aiAction(job, null)] : null,
    ),
  );
}

function aiAction(job, fit) {
  if (fit?.status === "queued" || fit?.status === "running") return h("p", { className: "fit__ai" }, h("span", { className: "spinner" }), "Claude avaliando a vaga…");
  const slot = h("p", { className: "fit__ai" });
  const button = h("button", { className: "btn btn--soft" }, icon("sparkle"), fit?.status === "failed" ? "Tentar de novo" : "Avaliar com Claude");
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await requestFit([job.id]);
      slot.replaceChildren(h("span", { className: "spinner" }), "Claude avaliando a vaga…");
    } catch {
      toast("Não deu pra pedir a avaliação.");
      button.disabled = false;
    }
  });
  slot.append(button, fit?.status === "failed" ? h("span", { className: "fit__err" }, "A última avaliação falhou.") : "");
  brainProblem().then((problem) => problem && slot.append(h("span", { className: "fit__err" }, problem)));
  return slot;
}

function fitCard(job) {
  const holder = h("div", { className: "fit-slot" });
  const paint = () => holder.replaceChildren(fitView(job) ?? "");
  paint();
  onFit(holder, (ref) => ref === job.id && paint());
  return holder;
}

function fitView(job) {
  const fit = fitFor(job.id);
  if (fit?.status === "done" && fit.result) return aiFit(job, fit);
  const result = match(job);
  if (!result) return null;
  return h(
    "section",
    { className: `fit fit--${tone(result.score)}` },
    scoreBadge(job, "lg"),
    h(
      "div",
      { className: "fit__body" },
      h("strong", {}, result.score >= 80 ? "Vaga com a sua cara" : result.score >= 60 ? "Boa chance" : "Vale tentar, mas fica de olho"),
      result.reasons.length ? h("p", {}, result.reasons.join(" · ")) : null,
      result.hits.length ? h("p", { className: "fit__row" }, icon("check"), h("span", {}, "Você tem: "), result.hits.map((skill) => h("span", { className: "tag tag--ok" }, skill))) : null,
      result.misses.length ? h("p", { className: "fit__row" }, icon("plus"), h("span", {}, "A vaga cita: "), result.misses.map((skill) => h("span", { className: "tag" }, skill))) : null,
      !(ctx.profile?.skills ?? []).length ? h("a", { className: "link", href: "#curriculo" }, "Complete seu currículo pra uma nota mais certeira", icon("arrow")) : null,
      aiAction(job, fit),
    ),
  );
}

function contactButtons(job) {
  const subject = encodeURIComponent(`Vaga: ${job.title}`);
  const hello = encodeURIComponent(`Olá! Vi a vaga de ${job.title}${job.company ? ` na ${job.company}` : ""} e gostaria de me candidatar.`);
  return [
    job.contactWhatsapp && h("a", { className: "btn btn--soft", href: `https://wa.me/${job.contactWhatsapp}?text=${hello}`, target: "_blank", rel: "noopener noreferrer" }, icon("whatsapp"), "WhatsApp"),
    job.contactEmail && h("a", { className: "btn btn--soft", href: `mailto:${job.contactEmail}?subject=${subject}&body=${hello}` }, icon("mail"), "E-mail"),
    job.contactPhone && !job.contactWhatsapp && h("a", { className: "btn btn--soft", href: `tel:+55${job.contactPhone}` }, icon("phone"), phoneLabel(job.contactPhone)),
  ].filter(Boolean);
}

function facts(job) {
  const rows = [
    ["calendar", "Publicada", job.publishedAt ? `${formatDay(job.publishedAt)} · ${ago(job.publishedAt)}` : "Sem data na fonte"],
    ["eye", "Achamos", ago(job.firstSeenAt)],
    ["refresh", job.status === "closed" ? "Encerrou" : "Confirmada aberta", job.status === "closed" ? ago(job.closedAt) : ago(job.lastSeenAt)],
    job.expiresAt && ["clock", "Inscrições até", formatDay(job.expiresAt)],
    job.contactEmail && ["mail", "E-mail", job.contactEmail],
    (job.contactWhatsapp || job.contactPhone) && ["phone", "Telefone", phoneLabel(job.contactWhatsapp || job.contactPhone)],
  ].filter(Boolean);
  return h("dl", { className: "facts" }, rows.map(([name, term, value]) => h("div", {}, icon(name), h("dt", {}, term), h("dd", {}, value))));
}

export function jobDetail(job, { onChange } = {}) {
  const source = job.expand?.source;
  const target = safeUrl(job.applyUrl) || safeUrl(job.url) || job.url;
  const body = h("div", { className: "job__body" });
  const stage = () => applicationFor(job.id)?.stage;

  const save = h("button", { className: "btn", title: "Salvar (S)" });
  const paintSave = () => {
    const saved = Boolean(stage());
    save.replaceChildren(icon("bookmark"), saved ? STAGES.find(([key]) => key === stage())?.[1] ?? "Recusada" : "Salvar");
    save.classList.toggle("is-done", saved);
  };
  paintSave();

  async function toggleSave() {
    try {
      if (stage()) {
        await untrack(job);
        toast("Tirei do seu funil.");
      } else {
        await track(job, "salva");
        toast("Salva no funil.", { label: "Ver funil", run: () => (location.hash = "#funil") });
      }
      paintSave();
      onChange?.(job);
    } catch {
      toast("Não deu pra salvar agora.");
    }
  }
  save.addEventListener("click", toggleSave);

  function apply() {
    open(target, "_blank", "noopener,noreferrer");
    if (stage() === "aplicada") return;
    toast("Conseguiu se candidatar?", {
      label: "Sim, marcar",
      run: () => track(job, "aplicada").then(() => (paintSave(), onChange?.(job), toast("Boa! Movi pra Candidatei."))),
    });
  }

  const copyLink = () => navigator.clipboard.writeText(job.url).then(() => toast("Link copiado."), () => toast("Não deu pra copiar."));
  const share = () => open(`https://wa.me/?text=${encodeURIComponent(`${job.title}${job.company ? ` · ${job.company}` : ""}\n${job.url}`)}`, "_blank", "noopener,noreferrer");

  function paintBody() {
    if (job.description) {
      body.replaceChildren(richText(job.description));
      return;
    }
    if (job.enriched) {
      body.replaceChildren(job.summary ? h("p", { className: "job__summary" }, job.summary) : h("p", { className: "job__summary" }, "A fonte não publicou a descrição completa."), h("a", { className: "btn btn--soft", href: job.url, target: "_blank", rel: "noopener noreferrer" }, "Ver na fonte", icon("external")));
      return;
    }
    body.replaceChildren(h("div", { className: "job__loading" }, h("span", { className: "spinner" }), "Buscando a descrição completa na fonte…"), ...Array.from({ length: 5 }, (_, i) => h("span", { className: "skeleton job__line", style: { "--w": `${90 - i * 12}%` } })));
    api(`ujob/jobs/${job.id}/enrich`, { method: "POST" })
      .then(({ job: fresh }) => {
        Object.assign(job, fresh, { expand: job.expand });
        node.replaceWith(jobDetail(job, { onChange }));
        onChange?.(job);
      })
      .catch(() => {
        job.enriched = true;
        paintBody();
      });
  }

  const node = h(
    "article",
    { className: "job" },
    h(
      "header",
      { className: "job__head" },
      logo(job.company || source?.name, job.companyLogo || source?.logoUrl, "xl"),
      h(
        "div",
        { className: "job__who" },
        h("strong", {}, job.company || "Empresa confidencial"),
        h("span", {}, "via ", h("a", { href: `#fontes?q=${encodeURIComponent(source?.name ?? "")}` }, source?.name ?? host(job.url))),
      ),
      job.status === "closed" ? h("span", { className: "tag tag--down" }, "Encerrada") : isFresh(job) ? h("span", { className: "tag tag--brand" }, h("i", { className: "dot dot--live" }), "Nova") : null,
    ),
    h("h2", { className: "job__title" }, job.title),
    h(
      "div",
      { className: "job__tags" },
      job.category && h("a", { className: "tag tag--brand", href: `#vagas?category=${job.category}` }, cat(job.category, 18), CATEGORIES[job.category]),
      h("span", { className: "tag" }, icon("pin"), place(job)),
      job.workplace && h("span", { className: "tag" }, icon("laptop"), WORKPLACES[job.workplace]),
      job.contract && h("span", { className: "tag" }, icon("contract"), CONTRACTS[job.contract]),
      job.seniority && h("span", { className: "tag" }, icon("level"), SENIORITY[job.seniority]),
      job.salaryMin > 0 && h("span", { className: "tag tag--ok" }, icon("money"), salary(job)),
    ),
    h(
      "div",
      { className: "job__actions" },
      h("button", { className: "btn btn--primary btn--lg", onclick: apply, title: "Candidatar (A)" }, icon("send"), job.status === "closed" ? "Ver na fonte" : "Candidatar"),
      save,
      h("button", { className: "btn", onclick: () => prepare(), title: "Claude escreve a carta e adapta o CV pra essa vaga" }, icon("sparkle"), "Preparar candidatura"),
      h("button", { className: "btn", onclick: () => letterDrawer(job), title: "Carta de apresentação" }, icon("letter"), "Carta"),
      h("button", { className: "btn btn--ghost", onclick: () => decline(), title: "Não quero (N)" }, icon("skip"), "Não quero"),
      h("a", { className: "btn btn--ghost", href: `#claude?entrevista=${job.id}`, title: "Simular entrevista dessa vaga com o Claude" }, icon("live"), "Treinar entrevista"),
      ...contactButtons(job),
      h("button", { className: "icon-btn", title: "Copiar link", "aria-label": "Copiar link", onclick: copyLink }, icon("copy")),
      h("button", { className: "icon-btn", title: "Mandar no WhatsApp", "aria-label": "Mandar no WhatsApp", onclick: share }, icon("whatsapp")),
      h("a", { className: "icon-btn", href: job.url, target: "_blank", rel: "noopener noreferrer", title: "Abrir na fonte", "aria-label": "Abrir na fonte" }, icon("external")),
    ),
    fitCard(job),
    facts(job),
    body,
    job.tags?.length > 0 && h("div", { className: "job__skills" }, job.tags.map((tag) => h("span", { className: "tag" }, tag))),
  );
  async function prepare() {
    if (!ctx.profile) return toast("Crie seu perfil primeiro.");
    try {
      const { reused } = await api("radar/apply/prepare", { method: "POST", body: { profile: ctx.profile.id, job: job.id } });
      toast(reused ? "Essa candidatura já está na fila." : job.contactEmail ? "Claude preparando carta e CV. Revise antes de enviar." : "Claude preparando. Essa vaga não tem e-mail: você copia a carta e aplica no site.", { label: "Ver", run: () => (location.hash = "#envios") });
    } catch (error) {
      toast(error.message || "Não deu pra preparar.");
    }
  }

  async function decline() {
    if (await refuse(job)) {
      paintSave();
      onChange?.(job);
    }
  }
  node.actions = { apply, toggleSave, decline };
  paintBody();
  return node;
}
