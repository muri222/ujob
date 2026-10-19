// markdown mínimo e seguro pras respostas do Claude: escapa tudo primeiro, depois só insere as nossas tags
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(text) {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
}

export function markdown(source) {
  const out = [];
  const blocks = escape(String(source ?? "")).split(/```/);
  blocks.forEach((block, index) => {
    if (index % 2 === 1) {
      const code = block.replace(/^[\w+-]*\n/, "");
      out.push(`<pre><code>${code.replace(/\n$/, "")}</code></pre>`);
      return;
    }
    let list = null;
    let paragraph = [];
    const flush = () => {
      if (paragraph.length) out.push(`<p>${inline(paragraph.join("<br>"))}</p>`);
      paragraph = [];
      if (list) out.push(`</${list}>`);
      list = null;
    };
    for (const line of block.split("\n")) {
      const heading = line.match(/^(#{1,4})\s+(.*)/);
      const bullet = line.match(/^\s*[-*•]\s+(.*)/);
      const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)/);
      const quote = line.match(/^&gt;\s?(.*)/);
      if (!line.trim()) flush();
      else if (heading) (flush(), out.push(`<h${heading[1].length + 2}>${inline(heading[2])}</h${heading[1].length + 2}>`));
      else if (bullet || numbered) {
        const kind = bullet ? "ul" : "ol";
        if (paragraph.length) (out.push(`<p>${inline(paragraph.join("<br>"))}</p>`), (paragraph = []));
        if (list !== kind) {
          if (list) out.push(`</${list}>`);
          // lista numerada que continua depois de um parágrafo mantém o número do texto
          out.push(numbered && numbered[1] !== "1" ? `<ol start="${Number(numbered[1])}">` : `<${kind}>`);
          list = kind;
        }
        out.push(`<li>${inline(bullet ? bullet[1] : numbered[2])}</li>`);
      } else if (quote) (flush(), out.push(`<blockquote>${inline(quote[1])}</blockquote>`));
      else if (/^(-{3,}|\*{3,})$/.test(line.trim())) (flush(), out.push("<hr>"));
      else {
        if (list) (out.push(`</${list}>`), (list = null));
        paragraph.push(line);
      }
    }
    flush();
  });
  return out.join("");
}
