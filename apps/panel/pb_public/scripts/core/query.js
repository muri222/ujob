import { quote } from "./api.js";
import { CATEGORIES, CONTRACTS, SENIORITY, STATES, WORKPLACES } from "./catalog.js";
import { since } from "./format.js";

export const FIELDS = ["term", "category", "state", "city", "workplace", "contract", "seniority", "company", "period", "salary", "contact", "group", "status"];

export function fromParams(params) {
  const query = {};
  for (const field of FIELDS) {
    const value = params.get(field);
    if (value) query[field] = value.slice(0, 80);
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
  if (query.group) parts.push(`source.group = ${quote(query.group)}`);
  return parts.join(" && ");
}

export function describe(query) {
  const area = CATEGORIES[query.category] ?? "qualquer área";
  const place = query.city ? `${query.city}${query.state ? `/${query.state}` : ""}` : STATES[query.state] ?? "todo o Brasil";
  return [query.term ? `“${query.term}”` : area, place, WORKPLACES[query.workplace]?.toLowerCase(), CONTRACTS[query.contract]].filter(Boolean).join(" · ");
}
