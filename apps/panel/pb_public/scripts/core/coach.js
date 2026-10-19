import { api, get } from "./api.js";
import { brainProblem, ctx } from "./context.js";
import { h, icon, toast } from "./dom.js";
import { listen } from "./realtime.js";

// Preparar entrevista com o Claude: a pessoa marca só o que quer (não gasta com o que já tem).
// Empresa e salário pesquisam na web (gasta mais); o resto usa só a vaga e o CV.
const PARTS = [
  ["empresa", "Pesquisa da empresa", "o que faz, cultura, notícias e o que citar", true],
  ["salario", "Pretensão salarial recomendada", "faixa de mercado pro país e nível da vaga", true],
  ["roteiro", "Roteiro da entrevista", "perguntas prováveis com respostas no formato STAR", false],
  ["pitch", "Apresentação de 1 minuto", "seu \"fale sobre você\" pra essa vaga", false],
  ["perguntas", "Perguntas pra fazer no final", "específicas dessa empresa", false],
];
const MONEY = { mes: "por mês", ano: "por ano" };

const copyButton = (text) => h("button", { type: "button", className: "btn btn--ghost btn--sm", onclick: () => navigator.clipboard.writeText(text).then(() => toast("Copiado.")) }, icon("copy"), "Copiar");
const sources = (links = []) => (links.length ? h("p", { className: "coach__sources" }, "Fontes: ", links.slice(0, 5).map((link) => h("a", { href: link, target: "_blank", rel: "noopener noreferrer" }, new URL(link, "https://x").hostname.replace(/^www\./, ""), " "))) : null);

function renderPart(key, value) {
  if (key === "empresa")
    return [
      h("p", {}, value.resumo),
      value.cultura ? h("p", {}, h("strong", {}, "Cultura: "), value.cultura) : null,
      value.noticias?.length ? [h("strong", {}, "Notícias"), h("ul", {}, value.noticias.map((item) => h("li", {}, item)))] : null,
      value.dicas?.length ? [h("strong", {}, "Pra citar na entrevista"), h("ul", {}, value.dicas.map((item) => h("li", {}, item)))] : null,
      sources(value.fontes),
    ];
  if (key === "salario") {
    const fmt = (n) => (n ? Number(n).toLocaleString("pt-BR") : "?");
    return [
      h("p", { className: "coach__salary" }, h("strong", {}, `${value.moeda} ${fmt(value.recomendado)}`), ` ${MONEY[value.periodo] ?? ""} · faixa ${fmt(value.faixa_min)} a ${fmt(value.faixa_max)}`),
      h("p", {}, value.justificativa),
      sources(value.fontes),
    ];
  }
  if (key === "roteiro")
    return h(
      "div",
      { className: "coach__qa" },
      value.map((item) => h("details", { className: "prep__q" }, h("summary", {}, item.pergunta), item.porque ? h("p", { className: "settings__help" }, item.porque) : null, h("p", {}, item.resposta), copyButton(item.resposta))),
    );
  if (key === "pitch") return [h("pre", { className: "auto__pre" }, value), copyButton(value)];
  if (key === "perguntas") return [h("ul", {}, value.map((item) => h("li", {}, item))), copyButton(value.join("\n"))];
  return null;
}

export function coachBox(item) {
  let coach = item.coach ?? {};
  const picked = new Set();
  const notes = h("textarea", { rows: 2, maxLength: 2000, placeholder: "Opcional: o que você já tem ou quer que o Claude saiba (ex.: já sei minha pretensão, a entrevista é com o diretor de arte)" });
  const results = h("div", { className: "coach__results" });
  const status = h("p", { className: "fit__ai" });
  const go = h("button", { type: "button", className: "btn btn--primary" }, icon("sparkle"), "Fazer com o Claude");
  const paintGo = () => {
    go.disabled = !picked.size;
    const web = [...picked].some((key) => PARTS.find(([part]) => part === key)?.[3]);
    go.replaceChildren(icon("sparkle"), picked.size ? `Fazer ${picked.size} ${picked.size === 1 ? "parte" : "partes"} com o Claude` : "Marque o que o Claude deve fazer");
    status.textContent = web ? "Pesquisa na web gasta mais da sua assinatura (umas 3 a 5 notas de vaga)." : "";
  };
  const options = h(
    "div",
    { className: "coach__options" },
    PARTS.map(([key, title, hint, web]) => {
      const box = h("input", { type: "checkbox" });
      box.addEventListener("change", () => (box.checked ? picked.add(key) : picked.delete(key), paintGo()));
      return h("label", { className: "check coach__option" }, box, h("span", {}, h("strong", {}, title), h("small", {}, ` ${hint}${web ? " · busca na web" : ""}`), coach[key] ? h("span", { className: "tag tag--ok" }, " pronto") : null));
    }),
  );

  const paintResults = () =>
    results.replaceChildren(...PARTS.filter(([key]) => coach[key]).map(([key, title]) => h("details", { className: "coach__part", open: true }, h("summary", {}, h("strong", {}, title)), renderPart(key, coach[key]))));

  go.addEventListener("click", async () => {
    const problem = await brainProblem(true);
    if (problem) return toast(problem);
    go.disabled = true;
    try {
      const { task } = await api("radar/coach", { method: "POST", body: { application: item.id, sections: [...picked], notes: notes.value.trim() } });
      status.replaceChildren(h("span", { className: "spinner" }), " Claude preparando… pode fechar, o resultado fica salvo nesta candidatura.");
      const stop = new AbortController();
      listen(
        "ai_tasks",
        async ({ record }) => {
          if (record.id !== task || !["done", "failed"].includes(record.status)) return;
          stop.abort();
          if (record.status === "failed") {
            status.replaceChildren(h("span", { className: "fit__err" }, record.error || "O Claude não conseguiu."));
            return paintGo();
          }
          // o gancho junta o resultado na candidatura; relê pra pegar a versão salva
          setTimeout(async () => {
            const fresh = await get("applications", item.id).catch(() => null);
            coach = fresh?.coach ?? { ...coach, ...record.result };
            item.coach = coach;
            status.textContent = "Pronto.";
            paintResults();
          }, 600);
        },
        stop.signal,
      );
    } catch (error) {
      toast(error.message);
      paintGo();
    }
  });

  paintGo();
  paintResults();
  const extras = h(
    "div",
    { className: "import__row" },
    item.job ? h("button", { type: "button", className: "btn btn--soft", onclick: () => api("radar/apply/prepare", { method: "POST", body: { profile: ctx.profile.id, job: item.job } }).then(() => toast("Claude fazendo carta, CV adaptado e follow-up. Fica em Kits.", { label: "Ver", run: () => (location.hash = "#kits") }), (error) => toast(error.message)) }, icon("letter"), "Carta + CV adaptado") : h("a", { className: "btn btn--soft", href: "#kits" }, icon("letter"), "Carta + CV (cole a vaga em Kits)"),
    item.job ? h("a", { className: "btn btn--soft", href: `#claude?entrevista=${item.job}` }, icon("live"), "Simular entrevista") : null,
  );
  return h("section", { className: "coach" }, h("h3", {}, icon("sparkle"), " Preparar com o Claude"), h("p", { className: "settings__help" }, "Marque só o que você quer. O que já está pronto não precisa refazer."), options, notes, h("div", { className: "import__row" }, go), status, extras, results);
}
