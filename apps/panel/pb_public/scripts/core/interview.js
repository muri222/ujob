import { h, icon } from "./dom.js";

const CHECKLIST = [
  ["empresa", "Pesquisei a empresa: o que faz, valores e notícias recentes"],
  ["vaga", "Reli a vaga e separei 3 exemplos meus que batem com ela"],
  ["historia", "Treinei minha apresentação em 1 minuto"],
  ["perguntas", "Separei 2 perguntas pra fazer no final"],
  ["salario", "Sei minha pretensão salarial e o mínimo que aceito"],
  ["logistica", "Confirmei horário, local ou link, e testei câmera e áudio"],
  ["documentos", "Deixei currículo, documentos e portfólio à mão"],
];

const QUESTIONS = [
  ["Fale um pouco sobre você.", "Passado, presente e futuro em 1 minuto: onde trabalhou, o que faz hoje e por que essa vaga faz sentido."],
  ["Por que você quer trabalhar aqui?", "Cite algo concreto da empresa e ligue com o que você gosta de fazer."],
  ["Conte uma situação difícil e como resolveu.", "Use o formato situação, ação e resultado. Termine com o que aprendeu."],
  ["Qual seu ponto forte?", "Escolha um que a vaga pede e prove com um exemplo curto."],
  ["E um ponto a melhorar?", "Algo real, que não seja central pra vaga, e o que você já faz pra melhorar."],
  ["Onde você se vê em alguns anos?", "Mostre vontade de crescer na área, sem prometer sair da empresa."],
  ["Qual sua pretensão salarial?", "Dê uma faixa baseada no mercado e diga que está aberto a conversar o pacote todo."],
  ["Tem alguma pergunta pra gente?", "Sempre tenha: como é o dia a dia, como medem sucesso, próximos passos do processo."],
];

export function interviewPrep(prep = {}) {
  const done = new Set(prep.done ?? []);
  const meter = h("i");
  const label = h("span", { className: "prep__count num" });
  const paint = () => {
    meter.style.setProperty("--p", `${(done.size / CHECKLIST.length) * 100}%`);
    label.textContent = `${done.size}/${CHECKLIST.length}`;
  };
  const node = h(
    "details",
    { className: "prep", open: done.size > 0 && done.size < CHECKLIST.length },
    h("summary", {}, icon("chat"), h("strong", {}, "Preparar entrevista"), label, h("span", { className: "prep__meter" }, meter)),
    h(
      "ul",
      { className: "prep__list" },
      CHECKLIST.map(([key, text]) => {
        const box = h("input", { type: "checkbox", checked: done.has(key) });
        box.addEventListener("change", () => {
          box.checked ? done.add(key) : done.delete(key);
          paint();
        });
        return h("li", {}, h("label", {}, box, h("span", {}, text)));
      }),
    ),
    h("p", { className: "popover__title" }, "Perguntas que quase sempre aparecem"),
    h(
      "div",
      { className: "prep__questions" },
      QUESTIONS.map(([question, tip]) => h("details", { className: "prep__q" }, h("summary", {}, question), h("p", {}, tip))),
    ),
  );
  paint();
  node.value = () => ({ done: [...done] });
  return node;
}
