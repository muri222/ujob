export const CATEGORIES = {
  tecnologia: "Tecnologia",
  dados: "Dados e IA",
  design: "Design",
  produto: "Produto",
  marketing: "Marketing",
  vendas: "Vendas",
  atendimento: "Atendimento",
  administrativo: "Administrativo",
  financeiro: "Financeiro",
  rh: "RH e Pessoas",
  juridico: "Jurídico",
  saude: "Saúde",
  educacao: "Educação",
  engenharia: "Engenharia",
  industria: "Indústria",
  logistica: "Logística",
  varejo: "Varejo",
  alimentacao: "Alimentação",
  construcao: "Construção",
  agro: "Agro",
  seguranca: "Segurança",
  servicos: "Serviços",
  outros: "Outras áreas",
};

export const WORKPLACES = { remoto: "Remoto", hibrido: "Híbrido", presencial: "Presencial" };

export const CONTRACTS = {
  clt: "CLT",
  pj: "PJ",
  estagio: "Estágio",
  aprendiz: "Jovem aprendiz",
  trainee: "Trainee",
  temporario: "Temporário",
  freelancer: "Freela",
  talentos: "Banco de talentos",
  outro: "Outro",
};

export const SENIORITY = {
  estagio: "Estágio",
  junior: "Júnior",
  pleno: "Pleno",
  senior: "Sênior",
  especialista: "Especialista",
  lideranca: "Liderança",
};

export const STATES = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

export const GROUPS = {
  portal: ["Portais", "Grandes sites de emprego, com busca por cargo e região"],
  empresa: ["Empresas", "Páginas de carreira oficiais, direto da fonte"],
  agencia: ["Agências e RH", "Consultorias e agências de recrutamento"],
  comunidade: ["Comunidades", "Grupos abertos onde as próprias empresas anunciam"],
  remoto: ["Remoto", "Quadros internacionais de vagas 100% remotas"],
};

export const KINDS = {
  gupy: "Carreiras Gupy",
  gupy_search: "Busca Gupy",
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  github: "GitHub",
  remotive: "API pública",
  arbeitnow: "API pública",
  remoteok: "API pública",
  himalayas: "API pública",
  jobicy: "API pública",
  wwr: "Feed RSS",
  trampos: "API pública",
  programathor: "Página pública",
  jsonld: "Dados estruturados",
  card_listing: "Cartões do portal",
  adzuna: "API com chave",
  jooble: "API com chave",
};

export const STAGES = [
  ["salva", "Salvas", "Pra olhar com calma"],
  ["aplicada", "Candidatei", "Agora é com eles"],
  ["entrevista", "Entrevista", "Hora de brilhar"],
  ["teste", "Teste", "Mostrando serviço"],
  ["proposta", "Proposta", "Quase lá"],
  ["contratado", "Contratado", "Deu bom"],
  ["encerrada", "Encerrada", "Fica pra próxima"],
];

export const label = (map, key, fallback = "") => map[key] ?? fallback;
