const THRESHOLD = 0.3;
const sheet = matchMedia("(max-width: 820px)");

export function createSidebar() {
  const root = document.documentElement;
  const side = document.querySelector("[data-side]");
  const nav = document.querySelector("[data-side-nav]");
  let drag = null;

  [...nav.children].forEach((item, index) => item.style.setProperty("--i", index));

  const isOpen = () => root.classList.contains("side-open");

  function setOpen(open) {
    if (!sheet.matches) return;
    side.style.removeProperty("transform");
    root.style.removeProperty("--scrim");
    root.classList.toggle("side-open", open);
    if (open) nav.querySelector("[aria-current]")?.focus({ preventScroll: true });
  }

  function movePill() {
    const active = nav.querySelector("[aria-current]");
    nav.style.setProperty("--pill-o", active ? "1" : "0");
    if (!active) return;
    nav.style.setProperty("--pill-y", `${active.offsetTop}px`);
    nav.style.setProperty("--pill-h", `${active.offsetHeight}px`);
  }

  function start(event) {
    if (!sheet.matches || !isOpen() || event.touches.length !== 1 || side.scrollTop > 0) return;
    drag = { startY: event.touches[0].clientY, height: side.offsetHeight, moved: false, progress: 0 };
  }

  function move(event) {
    if (!drag) return;
    const dy = Math.max(0, event.touches[0].clientY - drag.startY);
    if (!drag.moved && dy < 6) return;
    drag.moved = true;
    drag.progress = dy / drag.height;
    root.classList.add("side-dragging");
    side.style.transform = `translateY(${dy}px)`;
    root.style.setProperty("--scrim", (1 - drag.progress).toFixed(3));
  }

  function end() {
    if (!drag) return;
    root.classList.remove("side-dragging");
    if (drag.moved) setOpen(drag.progress < THRESHOLD);
    drag = null;
  }

  document.querySelectorAll("[data-side-open]").forEach((button) => button.addEventListener("click", () => setOpen(true)));
  document.querySelectorAll("[data-side-close]").forEach((button) => button.addEventListener("click", () => setOpen(false)));
  addEventListener("keydown", (event) => event.key === "Escape" && isOpen() && setOpen(false));
  side.addEventListener("touchstart", start, { passive: true });
  side.addEventListener("touchmove", move, { passive: true });
  side.addEventListener("touchend", end);
  side.addEventListener("touchcancel", end);
  addEventListener("resize", movePill);
  sheet.addEventListener("change", () => setOpen(false));

  return {
    close: () => isOpen() && setOpen(false),
    sync: () => requestAnimationFrame(movePill),
  };
}
