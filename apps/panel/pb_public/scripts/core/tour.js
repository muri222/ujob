import { h, icon } from "./dom.js";

// tour da primeira vez: passa pelas telas com o que configurar em cada uma; reabre pelo Ctrl K ou em Como usar
const KEY = "ujob.tour";

const STEPS = [
  [null, "Bem-vindo ao uJob", "Seu painel já está buscando vagas. Em 1 minuto mostro onde fica cada coisa e o que vale configurar logo de cara."],
  ["config", "1. Escolha a IA", "Em Config. da conta, veja se a IA está pronta (Claude Code logado é o padrão) ou troque por ChatGPT, OpenRouter ou DeepSeek. Ali também entra o e-mail com senha de app, pra enviar candidaturas e ler respostas."],
  ["curriculo", "2. Confira o currículo", "Revise o que foi importado e adicione suas ferramentas e habilidades: é com isso que a IA dá nota pra cada vaga."],
  ["preferencias", "3. Preferências", "Salário mínimo, empresas a evitar, motivos de recusa e respostas prontas pros formulários. Quanto mais completo, melhores as notas e as candidaturas."],
  ["buscar", "4. Busque vagas", "Escreva o que procura com suas palavras e escolha os países. Salve a busca pra ela virar alerta e rodar sozinha."],
  ["vagas", "5. Vagas", "Todas as vagas coletadas, com a nota da IA. Filtre por país, abra uma e prepare a candidatura."],
  ["auto", "6. Candidatura automática", "Revise as melhores vagas uma a uma e escolha o modo: Revisão, Híbrido ou Automático, com limite por dia."],
  ["funil", "7. Candidaturas", "Acompanhe cada vaga por etapa. Na gaveta da vaga, a IA prepara a entrevista: empresa, salário, roteiro e pitch."],
  ["leads", "8. Leads", "Se você faz freela, ache clientes no mapa, no Google Maps, no Instagram e no TikTok, com mensagem de abordagem pronta."],
  ["claude", "9. Chat", "Converse com a IA já conhecendo seu currículo, vagas e funil. Peça carta, simulado de entrevista ou estratégia."],
  ["profiles", "10. Suas funções", "Trabalha com mais de uma coisa? Crie outra função aqui, cada uma com currículo, países e painel próprios."],
];

export const tourPending = () => {
  try {
    return localStorage.getItem(KEY) === "pending";
  } catch {
    return false;
  }
};

export const queueTour = () => {
  try {
    localStorage.setItem(KEY, "pending");
  } catch {}
};

export function startTour() {
  try {
    localStorage.setItem(KEY, "done");
  } catch {}
  let index = 0;
  const spot = h("div", { className: "tour__spot" });
  const card = h("div", { className: "tour__card", role: "dialog", "aria-modal": "true" });
  const layer = h("div", { className: "tour" }, spot, card);

  const target = (key) => {
    if (key === "profiles") return document.querySelector("[data-profiles]");
    return key && document.querySelector(`.side__nav [data-link="${key}"], .side__cta[data-link="${key}"]`);
  };

  function place() {
    const node = target(STEPS[index][0]);
    const box = node?.offsetParent ? node.getBoundingClientRect() : null;
    layer.classList.toggle("is-center", !box);
    if (!box) return;
    Object.assign(spot.style, { top: `${box.top - 4}px`, left: `${box.left - 4}px`, width: `${box.width + 8}px`, height: `${box.height + 8}px` });
    const top = Math.min(Math.max(12, box.top - 20), innerHeight - card.offsetHeight - 12);
    Object.assign(card.style, { top: `${top}px`, left: `${Math.min(box.right + 20, innerWidth - card.offsetWidth - 12)}px` });
  }

  function show() {
    const [key, title, text] = STEPS[index];
    const last = index === STEPS.length - 1;
    if (key && key !== "profiles") location.hash = `#${key}`;
    const node = target(key);
    node?.scrollIntoView({ block: "nearest" });
    card.replaceChildren(
      h("small", { className: "tour__count" }, `${index + 1} de ${STEPS.length}`),
      h("strong", {}, title),
      h("p", {}, text),
      h(
        "div",
        { className: "tour__actions" },
        h("button", { type: "button", className: "btn btn--ghost", onclick: close }, "Pular tour"),
        index > 0 && h("button", { type: "button", className: "btn", onclick: () => (index--, show()) }, "Voltar"),
        h("button", { type: "button", className: "btn btn--primary", onclick: () => (last ? close() : (index++, show())) }, last ? "Começar" : "Próximo", last ? icon("check") : icon("arrow")),
      ),
    );
    place();
    card.querySelector(".btn--primary").focus();
  }

  function close() {
    layer.remove();
    removeEventListener("resize", place);
    removeEventListener("keydown", keys);
    location.hash = "#inicio";
  }

  function keys(event) {
    if (event.key === "Escape") close();
    else if (event.key === "ArrowRight" && index < STEPS.length - 1) (index++, show());
    else if (event.key === "ArrowLeft" && index > 0) (index--, show());
  }

  addEventListener("resize", place);
  addEventListener("keydown", keys);
  document.body.append(layer);
  show();
}
