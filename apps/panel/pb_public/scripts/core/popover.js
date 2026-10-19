import { h } from "./dom.js";

let open = null;

export function closePopover() {
  open?.close();
}

export function popover(anchor, content, { width = 420, onClose } = {}) {
  closePopover();
  const panel = h("div", { className: "popover", role: "dialog", style: { "--pop-w": `${width}px` } }, content);
  document.body.append(panel);

  const place = () => {
    const box = anchor.getBoundingClientRect();
    const room = innerHeight - box.bottom;
    const left = Math.min(Math.max(12, box.left), innerWidth - panel.offsetWidth - 12);
    const above = room < Math.min(panel.offsetHeight, 360) && box.top > room;
    panel.style.left = `${left}px`;
    panel.style.top = above ? `${Math.max(12, box.top - panel.offsetHeight - 8)}px` : `${box.bottom + 8}px`;
    panel.style.setProperty("--pop-origin", `${box.left - left + box.width / 2}px ${above ? "bottom" : "top"}`);
  };

  const outside = (event) => !panel.contains(event.target) && !anchor.contains(event.target) && close();
  const escape = (event) => event.key === "Escape" && (event.stopPropagation(), close());

  function close() {
    if (open?.panel !== panel) return;
    open = null;
    panel.remove();
    removeEventListener("pointerdown", outside, true);
    removeEventListener("keydown", escape, true);
    removeEventListener("resize", place);
    anchor.setAttribute("aria-expanded", "false");
    if (anchor.isConnected) anchor.focus({ preventScroll: true });
    onClose?.();
  }

  place();
  addEventListener("pointerdown", outside, true);
  addEventListener("keydown", escape, true);
  addEventListener("resize", place);
  anchor.setAttribute("aria-expanded", "true");
  open = { panel, close };
  panel.querySelector("input, [aria-checked='true'], button")?.focus({ preventScroll: true });
  return { close, panel };
}
