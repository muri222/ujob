import { initials } from "./format.js";

const SVG = "http://www.w3.org/2000/svg";

const READ_ONLY = new Set(["list", "form", "type"]);

export const $ = (selector, scope = document) => scope.querySelector(selector);

export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "style") for (const [name, rule] of Object.entries(value)) node.style.setProperty(name, rule);
    else if (key in node && !key.includes("-") && !READ_ONLY.has(key)) node[key] = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...children.flat(Infinity).filter((child) => child != null && child !== false));
  return node;
}

export function icon(name, prefix = "i") {
  const svg = document.createElementNS(SVG, "svg");
  const use = document.createElementNS(SVG, "use");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  use.setAttribute("href", `#${prefix}-${name}`);
  svg.append(use);
  return svg;
}

export const cat = (key, size) => h("span", { className: "cat", style: size ? { "--size": `${size}px` } : null }, icon(key || "outros", "c"));

export const safeUrl = (url) => (/^https:\/\/[^\s"<>]+$/.test(url ?? "") ? url : "");

export function logo(name, url, size = "") {
  const node = h("span", { className: `logo${size ? ` logo--${size}` : ""}`, "aria-hidden": "true" }, initials(name));
  const src = safeUrl(url);
  if (src) {
    const image = h("img", { src, alt: "", loading: "lazy", decoding: "async", referrerPolicy: "no-referrer" });
    image.addEventListener("error", () => image.remove());
    node.append(image);
  }
  return node;
}

export const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

export function header(title, lead, ...actions) {
  return h(
    "header",
    { className: "page-head" },
    h("div", {}, h("h1", {}, title), lead && h("p", { className: "lead" }, lead)),
    actions.length > 0 && h("div", { className: "page-head__actions" }, actions),
  );
}

export const stagger = (nodes) => nodes.map((node, index) => (node.style.setProperty("--i", index), node));

let toastTimer;

export function toast(message, action) {
  const box = $("[data-toast]");
  const [text, button] = box.children;
  text.textContent = message;
  button.hidden = !action;
  if (action) {
    button.textContent = action.label;
    button.onclick = () => {
      action.run();
      box.classList.remove("is-on");
    };
  }
  box.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove("is-on"), action ? 6000 : 2800);
}

export function modal(dialog, resolveWith) {
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      resolve(resolveWith(dialog.returnValue));
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

export function confirm(message, { confirmLabel = "Confirmar" } = {}) {
  const dialog = h(
    "dialog",
    { className: "confirm" },
    h("p", {}, message),
    h(
      "form",
      { method: "dialog", className: "confirm__actions" },
      h("button", { className: "btn btn--ghost", value: "no" }, "Cancelar"),
      h("button", { className: "btn btn--primary", value: "yes" }, confirmLabel),
    ),
  );
  return modal(dialog, (value) => value === "yes");
}

export function ask(message, { placeholder = "", type = "text", value = "" } = {}) {
  const input = h("input", { type, placeholder, value, required: true });
  const dialog = h(
    "dialog",
    { className: "confirm" },
    h(
      "form",
      { method: "dialog" },
      h("label", { className: "field" }, h("span", {}, message), input),
      h("div", { className: "confirm__actions" }, h("button", { className: "btn btn--ghost", value: "no", formNoValidate: true }, "Cancelar"), h("button", { className: "btn btn--primary", value: "yes" }, "Ok")),
    ),
  );
  return modal(dialog, (result) => (result === "yes" ? input.value.trim() : null));
}

export const isTyping = (event) =>
  event.target.closest("input, select, textarea, [contenteditable]") || event.metaKey || event.ctrlKey || event.altKey || document.querySelector("dialog[open], .popover");
