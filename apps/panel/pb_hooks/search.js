/// <reference path="../pb_data/types.d.ts" />

const SEARCHABLE = ["gupy_search", "jsonld", "card_listing", "adzuna", "jooble", "workable_search", "getonbrd", "apify_linkedin", "apify_indeed", "apify_google"];
// portais só do Brasil: ficam de fora quando a busca não inclui o Brasil
const BR_ONLY = ["gupy_search", "jsonld", "card_listing", "jooble", "trampos", "programathor", "github"];
const FILTERABLE = ["workingnomads", "rss_dribbble", "workable", "recruitee", "personio", "artstation", "greenhouse", "lever", "ashby", "github", "remoteok", "himalayas", "jobicy", "arbeitnow", "wwr", "trampos", "programathor"];

const AREA_TERMS = {
  tecnologia: ["desenvolvedor", "analista de sistemas", "suporte tecnico", "infraestrutura"],
  dados: ["analista de dados", "cientista de dados", "engenheiro de dados", "business intelligence"],
  design: ["designer", "ux designer", "designer grafico"],
  produto: ["product manager", "product owner", "analista de produto"],
  marketing: ["analista de marketing", "social media", "marketing digital", "redator"],
  vendas: ["vendedor", "consultor de vendas", "representante comercial", "executivo de vendas"],
  atendimento: ["atendente", "recepcionista", "operador de telemarketing", "atendimento ao cliente"],
  administrativo: ["assistente administrativo", "auxiliar administrativo", "secretaria", "faturamento"],
  financeiro: ["analista financeiro", "auxiliar contabil", "contador", "assistente fiscal"],
  rh: ["analista de rh", "recrutador", "departamento pessoal", "assistente de rh"],
  juridico: ["advogado", "assistente juridico", "analista juridico", "paralegal"],
  saude: ["enfermeiro", "tecnico de enfermagem", "farmaceutico", "fisioterapeuta"],
  educacao: ["professor", "pedagogo", "monitor", "coordenador pedagogico"],
  engenharia: ["engenheiro", "engenheiro civil", "engenheiro de producao", "projetista"],
  industria: ["auxiliar de producao", "operador de maquina", "mecanico", "eletricista"],
  logistica: ["motorista", "auxiliar de logistica", "estoquista", "conferente"],
  varejo: ["operador de caixa", "repositor", "assistente de loja", "gerente de loja"],
  alimentacao: ["cozinheiro", "auxiliar de cozinha", "atendente de restaurante", "garcom"],
  construcao: ["pedreiro", "servente", "mestre de obras", "eletricista predial"],
  agro: ["agronomo", "tecnico agricola", "operador de maquinas agricolas", "veterinario"],
  seguranca: ["vigilante", "porteiro", "tecnico de seguranca do trabalho", "controlador de acesso"],
  servicos: ["auxiliar de limpeza", "zelador", "camareira", "cabeleireiro"],
  outros: ["auxiliar", "assistente", "jovem aprendiz", "estagio"],
};

const clip = (value, max) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const pick = (value, allowed) => (allowed.includes(value) ? value : "");

function normalizeQuery(body) {
  const { cleanCountries } = require(`${__hooks}/countries.js`);
  const terms = (Array.isArray(body.terms) ? body.terms : []).map((term) => clip(term, 60)).filter(Boolean).slice(0, 8);
  return {
    term: clip(body.term, 80),
    terms,
    category: pick(body.category, Object.keys(AREA_TERMS)),
    state: /^[A-Z]{2}$/.test(body.state ?? "") ? body.state : "",
    city: clip(body.city, 80),
    workplace: pick(body.workplace, ["remoto", "hibrido", "presencial"]),
    contract: pick(body.contract, ["clt", "pj", "estagio", "aprendiz", "trainee", "temporario", "freelancer"]),
    countries: cleanCountries(body.countries),
  };
}

const searchKey = (query) =>
  [query.term.toLowerCase(), query.terms.join(",").toLowerCase(), query.category, query.state, query.city.toLowerCase(), query.workplace, query.contract, query.countries.join(",")].join("|");

function searchTerms(search) {
  const custom = JSON.parse(search.getString("terms") || "[]") || [];
  if (custom.length) return custom;
  const term = search.getString("term");
  const area = AREA_TERMS[search.getString("category")] ?? [];
  const contract = { estagio: "estagio", aprendiz: "jovem aprendiz", trainee: "trainee", temporario: "temporario" }[search.getString("contract")];
  const terms = term ? [term] : area.length ? area : ["vagas"];
  return contract && !term ? [...terms.slice(0, 2), contract] : terms;
}

// países da busca com o nome em inglês pro scout; sem país = Brasil (comportamento antigo)
function searchCountries(search) {
  const { COUNTRIES } = require(`${__hooks}/countries.js`);
  const codes = (JSON.parse(search.getString("countries") || "[]") || []).filter((code) => COUNTRIES[code]);
  return (codes.length ? codes : ["BR"]).map((code) => ({ code, name: COUNTRIES[code].en }));
}

module.exports = { AREA_TERMS, BR_ONLY, FILTERABLE, SEARCHABLE, searchCountries, normalizeQuery, searchKey, searchTerms };
