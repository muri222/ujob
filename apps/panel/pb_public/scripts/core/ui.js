import { h } from "./dom.js";
import { slide } from "./motion.js";

export function segmented(options, current, onPick, label) {
  let value = current;
  const group = h("div", { className: "segmented", role: "radiogroup", "aria-label": label });
  for (const [option, text, hint] of options) {
    const button = h("button", { type: "button", role: "radio", "aria-checked": String(option === value) }, text, hint != null && h("small", {}, hint));
    button.dataset.value = option;
    button.addEventListener("click", () => {
      if (option === value) return;
      group.set(option);
      onPick(option, text);
    });
    group.append(button);
  }
  group.set = (option) => {
    value = option;
    for (const sibling of group.children) sibling.setAttribute("aria-checked", String(sibling.dataset.value === option));
    slide(group);
  };
  group.hint = (option, text) => {
    const node = [...group.children].find((child) => child.dataset.value === option)?.querySelector("small");
    if (node) node.textContent = text;
    slide(group);
  };
  new ResizeObserver(() => slide(group)).observe(group);
  return group;
}

export function toggle(labelText, checked, onChange) {
  const button = h("button", { type: "button", className: "switch", role: "switch", "aria-checked": String(checked), "aria-label": labelText });
  button.addEventListener("click", () => {
    const next = button.getAttribute("aria-checked") !== "true";
    button.setAttribute("aria-checked", String(next));
    onChange(next);
  });
  return button;
}

export function skeletonRows(total, className = "skeleton-row") {
  return Array.from({ length: total }, (_, index) => h("li", { className, "aria-hidden": "true", style: { "--i": index } }, h("span", { className: "skeleton" }), h("span", { className: "skeleton" })));
}
