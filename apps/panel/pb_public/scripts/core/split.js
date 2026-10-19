import { h, icon, isTyping } from "./dom.js";
import { jobDetail, jobRow } from "./job.js";
import { skeletonRows } from "./ui.js";

const PAGE_SIZE = 40;
const compact = matchMedia("(max-width: 980px)");

export function createSplit(root, { load, empty, toolbar, signal, onCount }) {
  const rows = h("ul", { className: "rows" });
  const pane = h("div", { className: "pane" });
  const banner = h("button", { className: "arrivals", hidden: true });
  const total = h("p", { className: "results__count" });
  const list = h("div", { className: "results" }, toolbar, h("div", { className: "results__bar" }, total, banner), rows);
  const shell = h("div", { className: "split" }, list, h("div", { className: "pane-wrap" }, pane));
  root.append(shell);

  const sentinel = h("li", { className: "sentinel", "aria-hidden": "true" });
  const wrap = shell.lastElementChild;
  let swipe = null;
  wrap.addEventListener("touchstart", (event) => {
    if (!compact.matches || event.touches.length !== 1) return;
    swipe = { x: event.touches[0].clientX, y: event.touches[0].clientY, dx: 0, locked: false };
  }, { passive: true });
  wrap.addEventListener("touchmove", (event) => {
    if (!swipe) return;
    const dx = event.touches[0].clientX - swipe.x;
    const dy = event.touches[0].clientY - swipe.y;
    if (!swipe.locked) {
      if (Math.abs(dy) > Math.abs(dx) || dx < 8) return dx < 0 || Math.abs(dy) > 10 ? (swipe = null) : undefined;
      swipe.locked = true;
      wrap.classList.add("is-swiping");
    }
    swipe.dx = Math.max(0, dx);
    wrap.style.transform = `translateX(${swipe.dx}px)`;
  }, { passive: true });
  const endSwipe = () => {
    if (!swipe) return;
    wrap.classList.remove("is-swiping");
    wrap.style.removeProperty("transform");
    if (swipe.locked && swipe.dx > wrap.offsetWidth * 0.3) close();
    swipe = null;
  };
  wrap.addEventListener("touchend", endSwipe);
  wrap.addEventListener("touchcancel", endSwipe);
  const state = { items: [], page: 0, totalPages: 1, totalItems: 0, selectedId: null, loading: false, token: 0 };
  const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && more(), { rootMargin: "400px" });
  signal.addEventListener("abort", () => observer.disconnect());

  const index = (id) => state.items.findIndex((item) => item.id === id);
  const current = () => state.items[index(state.selectedId)] ?? null;

  function rowFor(item, position) {
    const node = jobRow(item);
    node.dataset.id = item.id;
    node.tabIndex = -1;
    node.style.setProperty("--i", Math.min(position, 14));
    node.addEventListener("click", () => select(item.id, true));
    if (item.id === state.selectedId) node.classList.add("is-active");
    return node;
  }

  function counter() {
    total.textContent = state.totalItems ? `${state.totalItems.toLocaleString("pt-BR")} ${state.totalItems === 1 ? "vaga" : "vagas"}` : "";
    onCount?.(state.totalItems);
  }

  function render(animate) {
    rows.classList.toggle("stagger", animate);
    counter();
    if (!state.items.length) {
      rows.replaceChildren(h("li", { className: "rows__empty" }, empty()));
      pane.replaceChildren();
      shell.classList.remove("is-open");
      return;
    }
    rows.replaceChildren(...state.items.map(rowFor), sentinel);
    observer.observe(sentinel);
    const keep = index(state.selectedId) >= 0 ? state.selectedId : compact.matches ? null : state.items[0].id;
    select(keep, false);
  }

  async function fetchPage(reset) {
    if (!reset && (state.loading || state.page >= state.totalPages)) return;
    const token = ++state.token;
    state.loading = true;
    if (reset) rows.replaceChildren(...skeletonRows(9, "job-row job-row--ghost"));
    try {
      const result = await load(reset ? 1 : state.page + 1, PAGE_SIZE);
      if (signal.aborted || token !== state.token) return;
      state.page = result.page;
      state.totalPages = result.totalPages;
      state.totalItems = result.totalItems;
      state.items = reset ? result.items : [...state.items, ...result.items.filter((item) => index(item.id) < 0)];
      if (reset) render(true);
      else {
        sentinel.remove();
        rows.append(...result.items.map((item, position) => rowFor(item, position)), sentinel);
      }
    } catch (error) {
      if (reset && token === state.token) rows.replaceChildren(h("li", { className: "rows__empty" }, h("div", { className: "empty" }, "Não deu pra carregar.", h("button", { className: "btn", onclick: () => fetchPage(true) }, "Tentar de novo"))));
      throw error;
    } finally {
      if (token === state.token) state.loading = false;
    }
  }

  const more = () => fetchPage(false);

  function showDetail() {
    const item = current();
    if (!item) {
      pane.replaceChildren(h("div", { className: "pane__empty" }, icon("briefcase"), "Escolha uma vaga pra ver tudo"));
      return;
    }
    const detail = jobDetail(item, { onChange: (job) => refresh(job.id, job) });
    pane.replaceChildren(h("button", { className: "pane__back", onclick: close }, icon("back"), "Voltar"), detail);
    pane.scrollTop = 0;
    detail.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  }

  function select(id, open) {
    if (state.selectedId === id && !open && pane.firstChild) return;
    state.selectedId = id;
    for (const node of rows.querySelectorAll(".job-row")) {
      const active = node.dataset.id === id;
      node.classList.toggle("is-active", active);
      if (active) node.scrollIntoView({ block: "nearest" });
    }
    showDetail();
    if (open && compact.matches) shell.classList.add("is-open");
  }

  function close() {
    shell.classList.remove("is-open");
  }

  function step(delta) {
    if (!state.items.length) return;
    const next = Math.min(Math.max(index(state.selectedId) + delta, 0), state.items.length - 1);
    select(state.items[next].id, false);
    if (next >= state.items.length - 6) more();
  }

  function refresh(id, patch) {
    const item = state.items[index(id)];
    if (!item) return;
    Object.assign(item, patch);
    rows.querySelector(`[data-id="${id}"]`)?.replaceWith(rowFor(item, 0));
  }

  function prepend(items) {
    const fresh = items.filter((item) => index(item.id) < 0);
    if (!fresh.length) return 0;
    state.items = [...fresh, ...state.items];
    state.totalItems += fresh.length;
    counter();
    if (rows.querySelector(".rows__empty")) {
      render(true);
      return fresh.length;
    }
    const nodes = fresh.map(rowFor);
    rows.prepend(...nodes);
    for (const node of nodes) node.animate([{ opacity: 0, transform: "translateY(-12px)", background: "var(--brand-soft)" }, { opacity: 1, transform: "none", background: "transparent" }], { duration: 900, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    if (!state.selectedId && !compact.matches) select(state.items[0].id, false);
    return fresh.length;
  }

  addEventListener(
    "keydown",
    (event) => {
      if (isTyping(event) || (event.key === "Enter" && event.target.closest("button, a"))) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const detail = pane.querySelector(".job");
      const actions = {
        j: () => step(1),
        ArrowDown: () => step(1),
        k: () => step(-1),
        ArrowUp: () => step(-1),
        Escape: close,
        a: () => detail?.actions.apply(),
        s: () => detail?.actions.toggleSave(),
        o: () => current() && open(current().url, "_blank", "noopener,noreferrer"),
      };
      if (!actions[key]) return;
      event.preventDefault();
      actions[key]();
    },
    { signal },
  );

  const reload = () => fetchPage(true);
  return { reload, prepend, refresh, banner, current, items: () => state.items };
}
