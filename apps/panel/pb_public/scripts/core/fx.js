import { h } from "./dom.js";

const calm = matchMedia("(prefers-reduced-motion: reduce)");
const fine = matchMedia("(hover: hover) and (pointer: fine)");

export function blurText(text, { tag = "span", className = "", delay = 0 } = {}) {
  const words = String(text).split(/(\s+)/);
  let index = 0;
  return h(
    tag,
    { className: `fx-blur ${className}`.trim(), "aria-label": text },
    words.map((word) => (/^\s+$/.test(word) ? word : h("span", { "aria-hidden": "true", style: { "--i": index++, "--d": `${delay}ms` } }, word))),
  );
}

export function rotatingText(words, { every = 2200, signal } = {}) {
  let index = 0;
  const box = h("span", { className: "fx-rotate", "aria-live": "polite" });
  const show = () => {
    const word = h("span", { className: "fx-rotate__word" }, words[index]);
    const previous = box.firstElementChild;
    if (previous) {
      previous.classList.add("is-out");
      previous.addEventListener("animationend", () => previous.remove(), { once: true });
    }
    box.append(word);
    box.style.setProperty("--w", `${word.offsetWidth || words[index].length * 0.6}px`);
    requestAnimationFrame(() => box.style.setProperty("--w", `${word.getBoundingClientRect().width}px`));
  };
  show();
  if (!calm.matches) {
    const timer = setInterval(() => {
      if (!box.isConnected) return clearInterval(timer);
      index = (index + 1) % words.length;
      show();
    }, every);
    signal?.addEventListener("abort", () => clearInterval(timer));
  }
  return box;
}

export function magnet(node, strength = 0.28) {
  if (!fine.matches || calm.matches) return node;
  node.classList.add("fx-magnet");
  node.addEventListener("pointermove", (event) => {
    const box = node.getBoundingClientRect();
    const x = (event.clientX - box.left - box.width / 2) * strength;
    const y = (event.clientY - box.top - box.height / 2) * strength;
    node.style.setProperty("--mx", `${x.toFixed(1)}px`);
    node.style.setProperty("--my", `${y.toFixed(1)}px`);
  });
  node.addEventListener("pointerleave", () => {
    node.style.setProperty("--mx", "0px");
    node.style.setProperty("--my", "0px");
  });
  return node;
}

export function tilt(node, max = 6) {
  if (!fine.matches || calm.matches) return node;
  node.classList.add("fx-tilt");
  node.addEventListener("pointermove", (event) => {
    const box = node.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    node.style.setProperty("--rx", `${(-y * max).toFixed(2)}deg`);
    node.style.setProperty("--ry", `${(x * max).toFixed(2)}deg`);
  });
  node.addEventListener("pointerleave", () => {
    node.style.setProperty("--rx", "0deg");
    node.style.setProperty("--ry", "0deg");
  });
  return node;
}

export function clickSpark(selector = ".btn--primary, .btn--ink, .side__cta, .tabbar__go, [data-spark]") {
  if (calm.matches) return;
  addEventListener(
    "pointerdown",
    (event) => {
      if (!event.target.closest(selector)) return;
      const burst = h("span", { className: "fx-spark", style: { "--x": `${event.clientX}px`, "--y": `${event.clientY}px` } }, Array.from({ length: 8 }, (_, i) => h("i", { style: { "--a": `${i * 45}deg` } })));
      document.body.append(burst);
      setTimeout(() => burst.remove(), 600);
    },
    { passive: true },
  );
}

export function reveal(nodes, { root = null } = {}) {
  if (calm.matches || !("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      }
    },
    { root, rootMargin: "0px 0px -8% 0px" },
  );
  for (const node of nodes) {
    node.classList.add("fx-reveal");
    observer.observe(node);
  }
}

export function dotGrid(host, { gap = 24, reach = 150 } = {}) {
  const canvas = h("canvas", { className: "fx-dots", "aria-hidden": "true" });
  host.classList.add("has-dots");
  host.prepend(canvas);
  const context = canvas.getContext("2d");
  const style = getComputedStyle(document.documentElement);
  const rest = style.getPropertyValue("--line-strong").trim() || "#ddd5c9";
  const lit = style.getPropertyValue("--brand").trim() || "#9a7a4f";
  let pointer = null;
  let wave = null;
  let frame = 0;
  let size = { w: 0, h: 0, ratio: 1 };

  function resize() {
    const box = host.getBoundingClientRect();
    size = { w: box.width, h: box.height, ratio: Math.min(2, devicePixelRatio || 1) };
    canvas.width = size.w * size.ratio;
    canvas.height = size.h * size.ratio;
    draw();
  }

  function draw() {
    frame = 0;
    if (!canvas.isConnected) return;
    context.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);
    context.clearRect(0, 0, size.w, size.h);
    const now = performance.now();
    const radius = wave ? ((now - wave.at) / 900) * Math.max(size.w, size.h) : 0;
    if (wave && radius > Math.max(size.w, size.h) * 1.2) wave = null;
    for (let x = gap / 2; x < size.w; x += gap) {
      for (let y = gap / 2; y < size.h; y += gap) {
        let glow = 0;
        if (pointer) glow = Math.max(0, 1 - Math.hypot(x - pointer.x, y - pointer.y) / reach);
        if (wave) glow = Math.max(glow, Math.max(0, 1 - Math.abs(Math.hypot(x - wave.x, y - wave.y) - radius) / 40) * 0.8);
        context.globalAlpha = 0.55 + glow * 0.45;
        context.fillStyle = glow > 0.05 ? lit : rest;
        context.beginPath();
        context.arc(x, y, 1.1 + glow * 1.8, 0, Math.PI * 2);
        context.fill();
      }
    }
    if (wave) frame = requestAnimationFrame(draw);
  }

  const schedule = () => frame || (frame = requestAnimationFrame(draw));
  host.addEventListener("pointermove", (event) => {
    const box = canvas.getBoundingClientRect();
    pointer = { x: event.clientX - box.left, y: event.clientY - box.top };
    schedule();
  });
  host.addEventListener("pointerleave", () => ((pointer = null), schedule()));
  host.addEventListener("pointerdown", (event) => {
    if (calm.matches) return;
    const box = canvas.getBoundingClientRect();
    wave = { x: event.clientX - box.left, y: event.clientY - box.top, at: performance.now() };
    schedule();
  });
  new ResizeObserver(resize).observe(host);
  return canvas;
}
