import { list, quote } from "../core/api.js";
import { CATEGORIES, WORKPLACES } from "../core/catalog.js";
import { applicationFor, ctx, track, untrack } from "../core/context.js";
import { cat, h, header, icon, logo, safeUrl, toast } from "../core/dom.js";
import { ago, number, salary } from "../core/format.js";
import { scoreBadge } from "../core/job.js";
import { refuse } from "../core/refuse.js";
import { letterDrawer } from "../core/letter.js";
import { mascot } from "../core/mascot.js";
import { match } from "../core/match.js";

const SKIPPED = "ujob:skipped";
const FLING = 110;
const VISIBLE = 3;

const readSkipped = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(SKIPPED) ?? "[]"));
  } catch {
    return new Set();
  }
};

const writeSkipped = (ids) => {
  try {
    localStorage.setItem(SKIPPED, JSON.stringify([...ids].slice(-800)));
  } catch {}
};

export function candidatesFilter(profile) {
  const parts = ["status = 'open'"];
  const areas = profile.categories ?? [];
  if (areas.length) parts.push(`(${areas.map((key) => `category = ${quote(key)}`).join(" || ")})`);
  if (profile.state) parts.push(`(state = ${quote(profile.state)} || workplace = 'remoto')`);
  return parts.join(" && ");
}

function card(job) {
  const result = match(job);
  const place = job.workplace === "remoto" && !job.city ? "Remoto" : [job.city, job.state].filter(Boolean).join("/") || "Brasil";
  return h(
    "article",
    { className: "swipe" },
    h("span", { className: "swipe__stamp swipe__stamp--save" }, "Salvar"),
    h("span", { className: "swipe__stamp swipe__stamp--skip" }, "Pular"),
    h("span", { className: "swipe__stamp swipe__stamp--apply" }, "Candidatar"),
    h("header", { className: "swipe__head" }, logo(job.company || job.expand?.source?.name, job.companyLogo || job.expand?.source?.logoUrl, "lg"), h("div", {}, h("strong", {}, job.company || "Empresa confidencial"), h("span", {}, `${place} · ${ago(job.firstSeenAt)}`)), scoreBadge(job, "lg")),
    h("h2", { className: "swipe__title" }, job.title),
    h(
      "div",
      { className: "swipe__tags" },
      job.category ? h("span", { className: "tag tag--brand" }, cat(job.category, 16), CATEGORIES[job.category]) : null,
      job.workplace ? h("span", { className: "tag" }, icon("laptop"), WORKPLACES[job.workplace]) : null,
      job.salaryMin > 0 ? h("span", { className: "tag tag--ok" }, icon("money"), salary(job)) : null,
    ),
    result?.reasons.length ? h("p", { className: "swipe__why" }, icon("sparkle"), result.reasons.join(" · ")) : null,
    result?.hits.length ? h("p", { className: "swipe__skills" }, result.hits.slice(0, 6).map((skill) => h("span", { className: "tag tag--ok" }, icon("check"), skill))) : null,
    job.summary ? h("p", { className: "swipe__summary" }, job.summary) : null,
    h("a", { className: "link swipe__more", href: `#vaga/${job.id}` }, "Ver vaga completa", icon("arrow")),
  );
}

export default async function marathon(root, { signal }) {
  const profile = ctx.profile ?? {};
  const skipped = readSkipped();
  const tally = { seen: 0, saved: 0, applied: 0 };
  const history = [];

  const deck = h("div", { className: "deck" });
  const counter = h("p", { className: "deck__tally" });
  const left = h("span", { className: "deck__left num" });

  const { items } = await list("jobs", { filter: candidatesFilter(profile), sort: "-firstSeenAt", perPage: 200, expand: "source", fields: "*,expand.source.name,expand.source.logoUrl" });
  const queue = items
    .filter((job) => !applicationFor(job.id) && !skipped.has(job.id))
    .map((job) => ({ job, score: match(job)?.score ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .map(({ job }) => job);

  function paintTally() {
    counter.replaceChildren(h("b", { className: "num" }, number(tally.seen)), " vistas · ", h("b", { className: "num" }, number(tally.saved)), " salvas · ", h("b", { className: "num" }, number(tally.applied)), " candidaturas");
    left.textContent = queue.length ? `${number(queue.length)} na fila` : "";
  }

  function render() {
    paintTally();
    if (!queue.length) {
      deck.replaceChildren(
        h(
          "div",
          { className: "deck__done" },
          h("div", { className: "mascot-slot" }, mascot("mark", { label: "Fim da fila" })),
          h("strong", {}, "Fila zerada!"),
          h("p", {}, "Você viu tudo que combinava agora. Dispara uma busca nova pra trazer mais."),
          h("a", { className: "btn btn--primary", href: "#buscar" }, icon("radar"), "Buscar mais vagas"),
        ),
      );
      return;
    }
    const cards = queue.slice(0, VISIBLE).map((job, depth) => {
      const node = card(job);
      node.style.setProperty("--depth", depth);
      node.style.zIndex = String(VISIBLE - depth);
      if (depth === 0) grab(node, job);
      return node;
    });
    deck.replaceChildren(...cards.reverse());
  }

  async function decide(job, action, node) {
    queue.shift();
    tally.seen++;
    history.push({ job, action });
    if (action === "skip") {
      skipped.add(job.id);
      writeSkipped(skipped);
      toast("Pulou.", { label: "Por quê?", run: () => refuse(job) });
    } else if (action === "save") {
      tally.saved++;
      track(job, "salva").catch(() => toast("Não deu pra salvar essa."));
    } else if (action === "apply") {
      tally.applied++;
      open(safeUrl(job.applyUrl) || safeUrl(job.url) || job.url, "_blank", "noopener,noreferrer");
      track(job, "aplicada").catch(() => {});
      toast("Candidatura aberta na fonte.", { label: "Fazer carta", run: () => letterDrawer(job) });
    }
    if (node) {
      const [x, y, r] = action === "save" ? [1, 0, 18] : action === "skip" ? [-1, 0, -18] : [0, -1, 0];
      await node.animate([{ transform: getComputedStyle(node).transform }, { transform: `translate(${x * 140}vw, ${y * 120}vh) rotate(${r}deg)`, opacity: 0.4 }], { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }).finished.catch(() => {});
    }
    render();
  }

  async function undo() {
    const last = history.pop();
    if (!last) return toast("Nada pra desfazer.");
    queue.unshift(last.job);
    tally.seen--;
    if (last.action === "skip") {
      skipped.delete(last.job.id);
      writeSkipped(skipped);
    } else {
      if (last.action === "save") tally.saved--;
      if (last.action === "apply") tally.applied--;
      await untrack(last.job).catch(() => {});
    }
    render();
    deck.lastElementChild?.animate([{ transform: "translateY(-30px) scale(1.04)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 420, easing: "cubic-bezier(0.34, 1.5, 0.64, 1)" });
  }

  function grab(node, job) {
    let start = null;
    node.addEventListener("pointerdown", (event) => {
      if (event.target.closest("a, button")) return;
      start = { x: event.clientX, y: event.clientY };
      node.setPointerCapture(event.pointerId);
      node.classList.add("is-dragging");
    });
    node.addEventListener("pointermove", (event) => {
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      node.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
      node.style.setProperty("--save", Math.max(0, Math.min(1, dx / FLING)));
      node.style.setProperty("--skip", Math.max(0, Math.min(1, -dx / FLING)));
      node.style.setProperty("--apply", Math.max(0, Math.min(1, -dy / FLING)) * (Math.abs(dx) < FLING / 2 ? 1 : 0));
    });
    const release = (event) => {
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      start = null;
      node.classList.remove("is-dragging");
      if (dx > FLING) decide(job, "save", node);
      else if (dx < -FLING) decide(job, "skip", node);
      else if (dy < -FLING && Math.abs(dx) < FLING / 2) decide(job, "apply", node);
      else {
        node.style.transform = "";
        for (const name of ["--save", "--skip", "--apply"]) node.style.setProperty(name, 0);
      }
    };
    node.addEventListener("pointerup", release);
    node.addEventListener("pointercancel", release);
  }

  const act = (action) => queue.length && decide(queue[0], action, deck.lastElementChild);
  const controls = h(
    "div",
    { className: "deck__controls" },
    h("button", { className: "deck__btn deck__btn--undo", "aria-label": "Desfazer", title: "Desfazer (Z)", onclick: undo }, icon("undo")),
    h("button", { className: "deck__btn deck__btn--skip", "aria-label": "Pular", title: "Pular (←)", onclick: () => act("skip") }, icon("skip")),
    h("button", { className: "deck__btn deck__btn--apply", "aria-label": "Candidatar", title: "Candidatar (↑)", onclick: () => act("apply") }, icon("send")),
    h("button", { className: "deck__btn deck__btn--save", "aria-label": "Salvar", title: "Salvar (→)", onclick: () => act("save") }, icon("heart")),
    h("button", { className: "deck__btn deck__btn--letter", "aria-label": "Carta de apresentação", title: "Carta (C)", onclick: () => queue.length && letterDrawer(queue[0]) }, icon("letter")),
  );

  addEventListener(
    "keydown",
    (event) => {
      if (event.target.closest("input, textarea, dialog")) return;
      const keys = { ArrowLeft: "skip", ArrowRight: "save", ArrowUp: "apply" };
      if (keys[event.key]) {
        event.preventDefault();
        act(keys[event.key]);
      } else if (event.key.toLowerCase() === "z") undo();
      else if (event.key.toLowerCase() === "c" && queue.length) letterDrawer(queue[0]);
    },
    { signal },
  );

  root.append(
    header("Maratona", "As vagas que mais combinam com você, uma de cada vez. Arraste pro lado ou use as setas.", left),
    h("div", { className: "marathon" }, deck, controls, counter, h("p", { className: "deck__hint" }, h("kbd", {}, "←"), " pular  ", h("kbd", {}, "→"), " salvar  ", h("kbd", {}, "↑"), " candidatar  ", h("kbd", {}, "Z"), " desfazer")),
  );
  render();
}
