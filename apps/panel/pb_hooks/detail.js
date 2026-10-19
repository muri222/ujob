/// <reference path="../pb_data/types.d.ts" />

const LD_BLOCK = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE = /(?:\+?55[\s-]?)?\(?([1-9]\d)\)?[\s-]?(9?\d{4})[\s.-]?(\d{4})\b/g;
const IGNORED_EMAIL = /(noreply|no-reply|example|sentry|wixpress|\.png|\.jpg)/i;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (text) =>
  text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code) => {
    if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? match;
    const value = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(value) ? String.fromCodePoint(value) : match;
  });

const plain = (html) => decode(String(html ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (node && typeof node === "object") return [node, ...flatten(node["@graph"] ?? [])];
  return [];
}

function findPosting(html) {
  for (const [, block] of html.matchAll(LD_BLOCK)) {
    const raw = block.trim();
    for (const candidate of [raw, decode(raw)]) {
      try {
        const posting = flatten(JSON.parse(candidate)).find((node) => [].concat(node["@type"]).includes("JobPosting"));
        if (posting) return posting;
      } catch {}
    }
  }
  return null;
}

function contacts(text) {
  const body = plain(text);
  const email = (body.match(EMAIL) ?? []).find((address) => !IGNORED_EMAIL.test(address)) ?? "";
  const phones = [...body.matchAll(PHONE)].map(([, ddd, first, last]) => ({ digits: `${ddd}${first}${last}`, mobile: first.length === 5 }));
  const phone = phones[0];
  const whatsapp = /whats|zap/i.test(body) ? phones.find((item) => item.mobile) : null;
  return {
    contactEmail: email.toLowerCase(),
    contactPhone: phone ? phone.digits : "",
    contactWhatsapp: whatsapp ? `55${whatsapp.digits}` : "",
  };
}

const CONTRACT = { FULL_TIME: "clt", PART_TIME: "clt", CONTRACTOR: "pj", TEMPORARY: "temporario", INTERN: "estagio", PER_DIEM: "freelancer" };
const PERIOD = { HOUR: "hora", MONTH: "mes", YEAR: "ano" };

function fromPosting(posting) {
  const salary = posting.baseSalary?.value ?? {};
  const organization = posting.hiringOrganization ?? {};
  const types = [].concat(posting.employmentType ?? []).map((type) => String(type).toUpperCase());
  const address = [].concat(posting.jobLocation ?? [])[0]?.address ?? {};
  return {
    description: String(posting.description ?? "").slice(0, 40000),
    publishedAt: posting.datePosted ?? "",
    expiresAt: posting.validThrough ?? "",
    company: typeof organization === "string" ? organization : organization.name ?? "",
    companyLogo: typeof organization.logo === "string" ? organization.logo : organization.logo?.url ?? "",
    salaryMin: salary.minValue ?? salary.value ?? 0,
    salaryMax: salary.maxValue ?? 0,
    salaryCurrency: posting.baseSalary?.currency ?? "",
    salaryPeriod: PERIOD[String(salary.unitText ?? "").toUpperCase()] ?? "",
    contract: types.map((type) => CONTRACT[type]).find(Boolean) ?? "",
    workplace: posting.jobLocationType === "TELECOMMUTE" ? "remoto" : "",
    city: address.addressLocality ?? "",
    applyUrl: posting.directApply === false ? "" : posting.url ?? "",
  };
}

function enrich(record) {
  const { normalize } = require(`${__hooks}/jobs.js`);
  const response = $http.send({
    url: record.getString("url"),
    method: "GET",
    timeout: 15,
    headers: { "User-Agent": "Mozilla/5.0 (compatible; UjobBot/1.0)", Accept: "text/html" },
  });
  if (response.statusCode >= 400) throw new Error(`A página da vaga respondeu ${response.statusCode}.`);

  const html = toString(response.body, 4 * 1024 * 1024);
  const posting = findPosting(html);
  const found = posting ? fromPosting(posting) : {};
  const description = found.description || record.getString("description");
  const clean = normalize({ ...found, ...contacts(description), hash: record.getString("hash"), url: record.getString("url"), title: record.getString("title") });

  for (const [field, value] of Object.entries(clean)) {
    if (["hash", "url", "title", "tags"].includes(field) || !value) continue;
    if (!record.get(field) || ["description", "expiresAt"].includes(field)) record.set(field, value);
  }
  record.set("enriched", true);
  $app.save(record);
  return Boolean(posting);
}

module.exports = { contacts, enrich, findPosting, plain };
