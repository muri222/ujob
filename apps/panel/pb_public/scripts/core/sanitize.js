const ALLOWED = new Set(["P", "BR", "UL", "OL", "LI", "STRONG", "B", "EM", "I", "H1", "H2", "H3", "H4", "H5", "BLOCKQUOTE", "A", "SPAN", "DIV"]);
const HEADINGS = new Set(["H1", "H2", "H3", "H4", "H5"]);

function copy(node, out) {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      out.append(child.textContent);
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE || !ALLOWED.has(child.tagName)) {
      if (child.nodeType === Node.ELEMENT_NODE && !["SCRIPT", "STYLE", "IFRAME", "OBJECT", "svg"].includes(child.tagName)) copy(child, out);
      continue;
    }
    const tag = HEADINGS.has(child.tagName) ? "h3" : ["SPAN", "DIV"].includes(child.tagName) ? null : child.tagName.toLowerCase();
    if (!tag) {
      copy(child, out);
      if (child.tagName === "DIV") out.append(document.createElement("br"));
      continue;
    }
    const clean = document.createElement(tag);
    if (tag === "a") {
      const href = child.getAttribute("href") ?? "";
      if (/^(https?:|mailto:|tel:)/i.test(href)) {
        clean.href = href;
        clean.target = "_blank";
        clean.rel = "noopener noreferrer";
      }
    }
    copy(child, clean);
    out.append(clean);
  }
}

export function richText(html) {
  const decoded = /&lt;\w/.test(html) ? new DOMParser().parseFromString(html, "text/html").documentElement.textContent : html;
  const out = document.createElement("div");
  out.className = "prose";
  if (!/<\w/.test(decoded)) {
    for (const block of decoded.split(/\n{2,}|\r\n\r\n/)) {
      const paragraph = document.createElement("p");
      paragraph.textContent = block.trim();
      if (paragraph.textContent) out.append(paragraph);
    }
    return out;
  }
  const doc = new DOMParser().parseFromString(decoded.replace(/\s(style|on\w+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ""), "text/html");
  copy(doc.body, out);
  for (const empty of out.querySelectorAll("p, li")) if (!empty.textContent.trim()) empty.remove();
  return out;
}
