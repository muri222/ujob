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

// campo de etiquetas: Enter ou vírgula adiciona, clique remove; mexe direto no array e avisa onChange
export function tags(list, onChange, { placeholder = "Digite e aperte Enter", suggestions = [], max = 40 } = {}) {
  const fold = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const box = h("div", { className: "chips-input" });
  const entry = h("input", { placeholder, maxLength: 80 });
  const hints = h("div", { className: "chips-input__hints" });
  const add = (value) => {
    const clean = value.trim();
    if (!clean || list.some((item) => fold(item) === fold(clean)) || list.length >= max) return;
    list.push(clean);
    onChange(list);
  };
  function draw() {
    box.replaceChildren(...list.map((item, index) => h("button", { type: "button", className: "chip is-on", onclick: () => (list.splice(index, 1), onChange(list), draw()) }, item, " ×")), entry);
    const term = fold(entry.value);
    hints.replaceChildren(
      ...suggestions
        .filter((item) => !list.some((own) => fold(own) === fold(item)) && (!term || fold(item).includes(term)))
        .slice(0, 12)
        .map((item) => h("button", { type: "button", className: "chip", onclick: () => (add(item), draw(), entry.focus()) }, "+ ", item)),
    );
  }
  entry.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(entry.value);
      entry.value = "";
      draw();
    } else if (event.key === "Backspace" && !entry.value && list.length) {
      list.pop();
      onChange(list);
      draw();
    }
  });
  entry.addEventListener("input", draw);
  // ponytail: texto digitado e não confirmado entra ao sair do campo, senão a pessoa perde
  entry.addEventListener("blur", () => entry.value.trim() && (add(entry.value), (entry.value = ""), draw()));
  box.addEventListener("click", (event) => event.target === box && entry.focus());
  draw();
  return h("div", { className: "tags" }, box, hints);
}

// várias opções marcáveis (setor, tipo de contrato...): mexe direto no array
export function picks(entries, list, onChange) {
  return h(
    "div",
    { className: "quick" },
    entries.map(([value, text]) => {
      const chip = h("button", { type: "button", className: "chip", "aria-pressed": String(list.includes(value)) }, text);
      chip.addEventListener("click", () => {
        const at = list.indexOf(value);
        at >= 0 ? list.splice(at, 1) : list.push(value);
        chip.setAttribute("aria-pressed", String(at < 0));
        onChange(list);
      });
      return chip;
    }),
  );
}
