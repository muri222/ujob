import { quote } from "./api.js";
import { CATEGORIES, CONTRACTS, SENIORITY, STATES, WORKPLACES } from "./catalog.js";
import { since } from "./format.js";
import { COUNTRY, countryFilter, excluded, notCountryFilter } from "./countries.js";

export const FIELDS = ["term", "category", "state", "city", "workplace", "contract", "seniority", "company", "period", "salary", "contact", "group", "status", "abroad", "terms", "q", "country", "not", "notUf"];

export function fromParams(params) {
  const query = {};
  for (const field of FIELDS) {
    const value = params.get(field);
    if (value) query[field] = value.slice(0, field === "terms" || field === "q" ? 500 : ["country", "state", "not", "notUf"].includes(field) ? 300 : 80);
  }
  return query;
}

export function toParams(query) {
  const params = new URLSearchParams();
  for (const field of FIELDS) if (query[field]) params.set(field, query[field]);
  return params;
}

const PERIODS = { "24h": 24, "3d": 72, "7d": 168, "30d": 720 };

export function toFilter(query) {
  const parts = [query.status === "closed" ? "status = 'closed'" : "status = 'open'"];
  if (query.term) {
    const words = query.term.trim().split(/\s+/).slice(0, 4);
    parts.push(words.map((word) => `(title ~ ${quote(word)} || company ~ ${quote(word)})`).join(" && "));
  }
  // busca descrita: qualquer um dos termos que o Claude sugeriu (PT e EN)
  const terms = typeof query.terms === "string" ? query.terms.split("|").filter(Boolean) : query.terms;
  if (!query.term && Array.isArray(terms) && terms.length) parts.push(`(${terms.slice(0, 8).map((term) => `title ~ ${quote(term)}`).join(" || ")})`);
  if (CATEGORIES[query.category]) parts.push(`category = ${quote(query.category)}`);
  if (WORKPLACES[query.workplace]) parts.push(`workplace = ${quote(query.workplace)}`);
  if (CONTRACTS[query.contract]) parts.push(`contract = ${quote(query.contract)}`);
  if (SENIORITY[query.seniority]) parts.push(`seniority = ${quote(query.seniority)}`);
  if (query.company) parts.push(`company = ${quote(query.company)}`);
  if (PERIODS[query.period]) parts.push(`firstSeenAt >= ${since(PERIODS[query.period])}`);
  if (query.salary) parts.push("salaryMin > 0");
  if (query.contact) parts.push("(contactEmail != '' || contactWhatsapp != '' || contactPhone != '')");
  // vaga gringa: sem estado brasileiro e com país que não é o Brasil (inclui remoto "worldwide")
  const states = listOf(query.state, STATES);
  const codes = placeCodes(query);
  if (query.city && states.length === 1) parts.push(`state = ${quote(states[0])} && city ~ ${quote(query.city)}`);
  else if (codes.length) parts.push(countriesFilter(codes));
  else if (Array.isArray(query.countries) && query.countries.length) parts.push(countriesFilter(query.countries));
  if (!states.length) for (const code of excluded(query.not)) parts.push(notCountryFilter(code, quote));
  for (const code of String(query.notUf ?? "").split(",")) if (STATES[code]) parts.push(`state != ${quote(code)}`);
  if (query.abroad) parts.push("state = '' && country != '' && country !~ 'brasil' && country !~ 'brazil'");
  if (query.group) parts.push(`source.group = ${quote(query.group)}`);
  return parts.join(" && ");
}

// vários países (busca da função): qualquer um deles, menos os marcados com "-" (ex.: "-BR")
export function countriesFilter(codes) {
  const wanted = codes.filter((code) => COUNTRY[code]).map((code) => countryFilter(code, quote));
  // "BR-SP": só São Paulo
  for (const code of codes) if (code.startsWith("BR-") && STATES[code.slice(3)]) wanted.push(`state = ${quote(code.slice(3))}`);
  const out = codes.filter((code) => COUNTRY[code.slice(1)] && code[0] === "-").map((code) => notCountryFilter(code.slice(1), quote));
  // "-BR-SP": fora São Paulo
  for (const code of codes) if (code.startsWith("-BR-") && STATES[code.slice(4)]) out.push(`state != ${quote(code.slice(4))}`);
  return `(${[wanted.length ? `(${wanted.join(" || ")})` : "", ...out].filter(Boolean).join(" && ") || "id != ''"})`;
}

export const listOf = (value, table = COUNTRY) => String(value ?? "").split(",").filter((code, index, all) => table[code] && all.indexOf(code) === index);

// lugares da frase como códigos de busca: estados viram "BR-SP" (no lugar do Brasil inteiro)
export function placeCodes(query) {
  const countries = listOf(query.country);
  const states = listOf(query.state, STATES);
  return states.length ? [...countries.filter((code) => code !== "BR"), ...states.map((code) => `BR-${code}`)] : countries;
}

export function placeText(query) {
  const states = listOf(query.state, STATES);
  const names = [...listOf(query.country).filter((code) => !(states.length && code === "BR")).map((code) => COUNTRY[code].pt), ...states.map((code) => STATES[code])];
  const out = [...excluded(query.not).map((code) => COUNTRY[code].pt), ...listOf(query.notUf, STATES).map((code) => STATES[code])];
  const place = query.city && states.length === 1 ? `${query.city}/${states[0]}` : names.length > 3 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ") || "qualquer lugar";
  return place + (out.length ? `, menos ${out.length > 3 ? `${out.slice(0, 2).join(", ")} +${out.length - 2}` : out.join(", ")}` : "");
}

export function describe(query) {
  const area = CATEGORIES[query.category] ?? "qualquer área";
  return [query.term ? `“${query.term}”` : area, placeText(query), WORKPLACES[query.workplace]?.toLowerCase(), CONTRACTS[query.contract]].filter(Boolean).join(" · ");
}
