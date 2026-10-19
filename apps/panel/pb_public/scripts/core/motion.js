import { number } from "./format.js";

const reduced = matchMedia("(prefers-reduced-motion: reduce)");

export function countUp(node, to, { duration = 1100, format = number } = {}) {
  const from = Number(node.dataset.value ?? 0);
  node.dataset.value = to;
  if (reduced.matches || from === to) {
    node.textContent = format(to);
    return;
  }
  const started = performance.now();
  const tick = (now) => {
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - progress, 4);
    node.textContent = format(from + (to - from) * eased);
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function flip(container, update) {
  const before = new Map([...container.children].map((child) => [child.dataset.key, child.getBoundingClientRect()]));
  update();
  if (reduced.matches) return;
  for (const child of container.children) {
    const previous = before.get(child.dataset.key);
    if (!previous) continue;
    const now = child.getBoundingClientRect();
    const dx = previous.left - now.left;
    const dy = previous.top - now.top;
    if (!dx && !dy) continue;
    child.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  }
}

export function slide(group) {
  const active = group.querySelector('[aria-checked="true"], [aria-selected="true"]');
  if (!active) return;
  group.style.setProperty("--seg-x", `${active.offsetLeft - 3}px`);
  group.style.setProperty("--seg-w", `${active.offsetWidth}px`);
}
