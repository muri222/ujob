import { quote } from "./api.js";
import { CATEGORIES, CONTRACTS, SENIORITY, STATES, WORKPLACES } from "./catalog.js";
import { since } from "./format.js";
import { COUNTRY, countryFilter, excluded, notCountryFilter } from "./countries.js";

export const FIELDS = ["term", "category", "state", "city", "workplace", "contract", "seniority", "company", "period", "salary", "contact", "group", "status", "abroad", "terms", "q", "country", "not", "notUf"];

export function fromParams(params) {
  const query = {};
  for (const field of FIELDS) {
    const value = params.get(field);
    if (value) query[field] = value.slice(0, field === "terms" || field === "q" ? 500 : 80);
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
  if (STATES[query.state]) parts.push(`state = ${quote(query.state)}`);
  if (query.city) parts.push(`city ~ ${quote(query.city)}`);
  if (WORKPLACES[query.workplace]) parts.push(`workplace = ${quote(query.workplace)}`);
  if (CONTRACTS[query.contract]) parts.push(`contract = ${quote(query.contract)}`);
  if (SENIORITY[query.seniority]) parts.push(`seniority = ${quote(query.seniority)}`);
  if (query.company) parts.push(`company = ${quote(query.company)}`);
  if (PERIODS[query.period]) parts.push(`firstSeenAt >= ${since(PERIODS[query.period])}`);
  if (query.salary) parts.push("salaryMin > 0");
  if (query.contact) parts.push("(contactEmail != '' || contactWhatsapp != '' || contactPhone != '')");
  // vaga gringa: sem estado brasileiro e com país que não é o Brasil (inclui remoto "worldwide")
  if (COUNTRY[query.country] && !query.state) parts.push(countryFilter(query.country, quote));
  else if (Array.isArray(query.countries) && query.countries.length && !query.state) parts.push(countriesFilter(query.countries));
  if (!query.state) for (const code of excluded(query.not)) parts.push(notCountryFilter(code, quote));
  for (const code of String(query.notUf ?? "").split(",")) if (STATES[code]) parts.push(`state != ${quote(code)}`);
  if (query.abroad) parts.push("state = '' && country != '' && country !~ 'brasil' && country !~ 'brazil'");
  if (query.group) parts.push(`source.group = ${quote(query.group)}`);
  return parts.join(" && ");
}

// vários países (busca da função): qualquer um deles, menos os marcados com "-" (ex.: "-BR")
export function countriesFilter(codes) {
  const wanted = codes.filter((code) => COUNTRY[code]).map((code) => countryFilter(code, quote));
  const out = codes.filter((code) => COUNTRY[code.slice(1)] && code[0] === "-").map((code) => notCountryFilter(code.slice(1), quote));
  // "-BR-SP": fora São Paulo
  for (const code of codes) if (code.startsWith("-BR-") && STATES[code.slice(4)]) out.push(`state != ${quote(code.slice(4))}`);
  return `(${[wanted.length ? `(${wanted.join(" || ")})` : "", ...out].filter(Boolean).join(" && ") || "id != ''"})`;
}

export function describe(query) {
  const area = CATEGORIES[query.category] ?? "qualquer área";
  const out = [...excluded(query.not).map((code) => COUNTRY[code].pt), ...String(query.notUf ?? "").split(",").filter((code) => STATES[code]).map((code) => STATES[code])];
  const place = (query.city ? `${query.city}${query.state ? `/${query.state}` : ""}` : STATES[query.state] ?? COUNTRY[query.country]?.pt ?? "qualquer lugar") + (out.length ? `, menos ${out.join(", ")}` : "");
  return [query.term ? `“${query.term}”` : area, place, WORKPLACES[query.workplace]?.toLowerCase(), CONTRACTS[query.contract]].filter(Boolean).join(" · ");
}
