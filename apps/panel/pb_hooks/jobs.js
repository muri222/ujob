/// <reference path="../pb_data/types.d.ts" />

const ENUMS = {
  category: ["tecnologia", "dados", "design", "produto", "marketing", "vendas", "atendimento", "administrativo", "financeiro", "rh", "juridico", "saude", "educacao", "engenharia", "industria", "logistica", "varejo", "alimentacao", "construcao", "agro", "seguranca", "servicos", "outros"],
  seniority: ["estagio", "junior", "pleno", "senior", "especialista", "lideranca"],
  contract: ["clt", "pj", "estagio", "aprendiz", "trainee", "temporario", "freelancer", "talentos", "outro"],
  workplace: ["remoto", "hibrido", "presencial"],
  salaryPeriod: ["hora", "mes", "ano"],
};

const TEXT = { title: 300, company: 160, city: 80, country: 60, summary: 600, description: 40000, contactEmail: 160, contactPhone: 30, contactWhatsapp: 20 };
const MUTABLE = ["title", "category", "seniority", "contract", "workplace", "company", "companyLogo", "applyUrl", "salaryMin", "salaryMax", "expiresAt", "description", "contactEmail", "contactPhone", "contactWhatsapp"];

const now = () => new Date().toISOString().replace("T", " ");

const text = (value, max) => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);

const link = (value) => {
  const url = String(value ?? "").trim();
  return /^https?:\/\/[^\s"<>]+$/i.test(url) && url.length <= 2000 ? url : "";
};

const date = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) || parsed.getFullYear() < 2000 ? "" : parsed.toISOString().replace("T", " ");
};

const amount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed < 1e9 ? Math.round(parsed * 100) / 100 : 0;
};

function normalize(raw) {
  const job = {
    hash: /^[a-f0-9]{40}$/.test(raw.hash) ? raw.hash : "",
    url: link(raw.url),
    applyUrl: link(raw.applyUrl),
    companyLogo: link(raw.companyLogo).startsWith("https://") ? link(raw.companyLogo) : "",
    state: /^[A-Z]{2}$/.test(raw.state) ? raw.state : "",
    salaryMin: amount(raw.salaryMin),
    salaryMax: amount(raw.salaryMax),
    salaryCurrency: /^[A-Z]{3}$/.test(raw.salaryCurrency) ? raw.salaryCurrency : "",
    publishedAt: date(raw.publishedAt),
    expiresAt: date(raw.expiresAt),
    tags: Array.isArray(raw.tags) ? raw.tags.map((tag) => text(tag, 40)).filter(Boolean).slice(0, 12) : [],
  };
  for (const [field, max] of Object.entries(TEXT)) job[field] = text(raw[field], max);
  for (const [field, values] of Object.entries(ENUMS)) job[field] = values.includes(raw[field]) ? raw[field] : "";
  if (job.publishedAt > now()) job.publishedAt = now();
  return job;
}

function existing(app, hashes) {
  if (!hashes.length) return new Map();
  const params = Object.fromEntries(hashes.map((hash, i) => [`h${i}`, hash]));
  const filter = hashes.map((_, i) => `hash = {:h${i}}`).join(" || ");
  return new Map(app.findRecordsByFilter("jobs", filter, "", 0, 0, params).map((record) => [record.getString("hash"), record]));
}

function touch(app, ids, stamp) {
  if (!ids.length) return;
  const params = Object.fromEntries(ids.map((id, i) => [`i${i}`, id]));
  app
    .db()
    .newQuery(`UPDATE jobs SET lastSeenAt = {:stamp}, status = 'open', closedAt = '' WHERE id IN (${ids.map((_, i) => `{:i${i}}`).join(",")})`)
    .bind({ ...params, stamp })
    .execute();
}

function remember(app, searchId, ids) {
  if (!searchId || !ids.length) return;
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const params = { search: searchId };
  const rows = ids.map((id, i) => {
    params[`j${i}`] = id;
    params[`k${i}`] = $security.randomStringWithAlphabet(15, alphabet);
    return `({:k${i}}, {:search}, {:j${i}})`;
  });
  app.db().newQuery(`INSERT OR IGNORE INTO search_hits (id, search, job) VALUES ${rows.join(",")}`).bind(params).execute();
}

function changed(record, job) {
  return MUTABLE.some((field) => {
    const value = job[field];
    if (!value) return false;
    const current = record.get(field);
    return field.endsWith("At") ? record.getString(field).slice(0, 10) !== value.slice(0, 10) : String(current) !== String(value);
  });
}

function ingest(sourceId, rawJobs, searchId) {
  const stamp = now();
  const unique = new Map();
  for (const raw of rawJobs) {
    const job = normalize(raw ?? {});
    if (job.hash && job.url && job.title) unique.set(job.hash, job);
  }

  const result = { created: 0, updated: 0, seen: 0 };
  $app.runInTransaction((app) => {
    const collection = app.findCollectionByNameOrId("jobs");
    const known = existing(app, [...unique.keys()]);
    const untouched = [];
    const ids = [];

    for (const [hash, job] of unique) {
      const record = known.get(hash);
      if (!record) {
        const fresh = new Record(collection);
        fresh.load({ ...job, source: sourceId, publishedAt: job.publishedAt || stamp, firstSeenAt: stamp, lastSeenAt: stamp, status: "open" });
        app.save(fresh);
        ids.push(fresh.id);
        result.created++;
      } else if (changed(record, job) || record.getString("status") !== "open") {
        for (const field of MUTABLE) if (job[field]) record.set(field, job[field]);
        record.load({ lastSeenAt: stamp, status: "open", closedAt: "" });
        app.save(record);
        ids.push(record.id);
        result.updated++;
      } else {
        untouched.push(record.id);
        result.seen++;
      }
    }
    touch(app, untouched, stamp);
    remember(app, searchId, [...ids, ...untouched]);
  });
  // vaga nova que aponta pra sistema de vagas aberto vira fonte daquela empresa
  try {
    result.discovered = require(`${__hooks}/feeds.js`).discover($app, [...unique.values()]);
  } catch (error) {
    console.log("descoberta de fontes falhou:", error);
  }
  return result;
}

function searchFor(id) {
  if (!/^[a-z0-9]{15}$/.test(id ?? "")) return "";
  try {
    return $app.findRecordById("searches", id).id;
  } catch {
    return "";
  }
}

function knownHashes(hashes, searchId) {
  const valid = hashes.filter((hash) => /^[a-f0-9]{40}$/.test(hash)).slice(0, 500);
  const found = existing($app, valid);
  const ids = [...found.values()].map((record) => record.id);
  touch($app, ids, now());
  remember($app, searchId, ids);
  return [...found.keys()];
}

module.exports = { ingest, knownHashes, normalize, now, searchFor };
