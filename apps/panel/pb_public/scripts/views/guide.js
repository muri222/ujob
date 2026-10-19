import { h, header, icon } from "../core/dom.js";

// fluxos do app em passos curtos, cada passo leva pra tela certa
const FLOWS = [
  {
    title: "Achar vaga e se candidatar",
    lead: "Do radar até o e-mail enviado, com o Claude escrevendo por você.",
    steps: [
      ["Complete o currículo", "Importe seu PDF ou site. Quanto mais completo, melhor a nota e a carta.", "#curriculo"],
      ["Busque do seu jeito", "Use a frase pronta ou descreva a vaga com suas palavras (ex.: \"character artist pra games, remoto\").", "#buscar"],
      ["Deixe o Claude dar nota", "Em Vagas, clique em Avaliar com Claude: ele lê a vaga e diz se vale aplicar.", "#vagas"],
      ["Prepare a candidatura", "Na vaga, Preparar candidatura: carta no idioma da vaga e CV adaptado, sem inventar nada.", "#vagas"],
      ["Revise e envie", "Em Prontas para enviar você edita e manda do seu e-mail, com teto por dia.", "#envios"],
      ["Acompanhe no funil", "Arraste entre Salvas, Candidatei, Entrevista... Follow-up vencido aparece no Hoje.", "#funil"],
    ],
  },
  {
    title: "Ensinar a Mente",
    lead: "O Radar aprende o que você quer e o que não aceita.",
    steps: [
      ["Recuse dizendo o porquê", "Na vaga, Não quero (tecla N): os chips viram regras na hora; o texto livre vira sugestão.", "#vagas"],
      ["Aprove ou corrija", "Na Mente você confirma, corrige ou apaga. Tudo que está lá entra na nota das vagas.", "#mente"],
    ],
  },
  {
    title: "Prospectar clientes",
    lead: "Mapa grátis primeiro, sites lidos no seu PC, Claude só no que vale.",
    steps: [
      ["Escolha ou crie um segmento", "Use os prontos ou descreva quem você quer atingir: o Claude monta as buscas.", "#leads"],
      ["Escolha a fonte", "OpenStreetMap é grátis; Apify usa seus créditos; Claude na web gasta mais da assinatura.", "#leads"],
      ["Faça a triagem", "Triagem rápida: ← descarta, → gera dossiê e mensagens.", "#leads"],
      ["Aborde", "Copie a DM e abra o Instagram/WhatsApp, ou mande o e-mail frio pela fila de envio.", "#leads"],
    ],
  },
  {
    title: "Configurar uma vez",
    lead: "Tudo fica só neste PC.",
    steps: [
      ["E-mail de envio", "Seu e-mail + senha de app. O servidor é detectado sozinho.", "#config"],
      ["Apify (opcional)", "Cole o token pra buscar leads no Google Maps.", "#config"],
      ["Tema", "Claro, escuro e 6 paletas de cor.", "#config"],
    ],
  },
];

export default async function guide(root) {
  root.append(
    header("Como usar o Radar", "Os caminhos principais, em poucos passos. A IA usa o Claude Code logado neste PC, na sua assinatura."),
    h(
      "div",
      { className: "guide" },
      FLOWS.map((flow) =>
        h(
          "section",
          { className: "panel guide__flow" },
          h("header", { className: "section__head" }, h("h2", {}, flow.title), h("small", {}, flow.lead)),
          h(
            "ol",
            { className: "guide__steps" },
            flow.steps.map(([title, text, href]) => h("li", {}, h("a", { href }, h("strong", {}, title, " ", icon("arrow")), h("span", {}, text)))),
          ),
        ),
      ),
    ),
  );
}
