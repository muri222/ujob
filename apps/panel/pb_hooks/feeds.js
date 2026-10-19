/// <reference path="../pb_data/types.d.ts" />

// Descoberta automática: link de vaga que aponta pra um sistema de vagas com API pública
// (Greenhouse, Lever, Ashby, Workable, Recruitee, Personio) vira fonte nova
// (Gupy fica de fora: a busca do portal Gupy já cobre todas as empresas dela)
// daquela empresa. Agregadores (Himalayas, Google Vagas, LinkedIn...) alimentam e o acervo cresce sozinho.
const ATS = [
  ["greenhouse", /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]{2,60})/i],
  ["lever", /jobs\.lever\.co\/([a-z0-9_.-]{2,60})/i],
  ["ashby", /jobs\.ashbyhq\.com\/([a-z0-9_.%-]{2,60})/i],
  ["workable", /apply\.workable\.com\/([a-z0-9_-]{2,60})/i],
  ["recruitee", /\/\/([a-z0-9-]{2,60})\.recruitee\.com/i],
  ["personio", /\/\/([a-z0-9-]{2,60})\.jobs\.personio\.(?:de|com)/i],
];
const NOT_COMPANY = new Set(["embed", "api", "j", "jobs", "www", "portal", "login", "app", "careers", "static", "assets", "v1", "boards", "oauth", "help", "support", "employers"]);
const PER_BATCH = 15;

function findAts(text) {
  const found = [];
  for (const [kind, pattern] of ATS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const target = decodeURIComponent(match[1]).replace(/[.]+$/, "");
    if (!NOT_COMPANY.has(target.toLowerCase())) found.push([kind, target]);
  }
  return found;
}

function discover(app, jobs) {
  const fresh = new Map();
  for (const job of jobs) {
    const text = [job.url, job.applyUrl, ...(String(job.description ?? "").match(/https?:\/\/[^\s"'<>]+/g) ?? []).slice(0, 20)].join(" ");
    for (const [kind, target] of findAts(text)) {
      const slug = `${kind}-${target}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 80);
      if (!fresh.has(slug)) fresh.set(slug, { kind, target, company: job.company });
    }
  }
  let created = 0;
  const collection = app.findCollectionByNameOrId("sources");
  for (const [slug, found] of fresh) {
    if (created >= PER_BATCH) break;
    try {
      app.findFirstRecordByData("sources", "slug", slug);
      continue;
    } catch {}
    const record = new Record(collection);
    record.load({
      slug,
      name: String(found.company || found.target).slice(0, 120),
      kind: found.kind,
      group: "empresa",
      target: found.target,
      site: "",
      logoUrl: "",
      intervalMinutes: 720,
      active: true,
      config: { discovered: true },
    });
    try {
      app.save(record);
      created++;
    } catch {}
  }
  return created;
}

// segredos e limites que só o scout precisa ver (nunca ficam no catálogo)
const APIFY_KINDS = ["apify_linkedin", "apify_indeed", "apify_google"];
const APIFY_DEFAULTS = { dailyItems: 300, perSearch: 25 };

function integration(app, kind) {
  try {
    return app.findFirstRecordByFilter("integrations", "kind = {:kind}", { kind });
  } catch {
    return null;
  }
}

const secret = (record) => (record ? $security.decrypt(record.getString("secret"), $os.getenv("RADAR_SECRET")) : "");

function apifyBudget(app) {
  const record = integration(app, "apify");
  if (!record) return null;
  const config = { ...APIFY_DEFAULTS, ...(JSON.parse(record.getString("config") || "{}") || {}) };
  const today = new Date().toISOString().slice(0, 10);
  if (config.day !== today) Object.assign(config, { day: today, used: 0 });
  return { record, config, token: secret(record) };
}

// enfeita as fontes da rodada: chaves da Adzuna/Jooble e, em busca, token + limite da Apify (gasta do teto diário)
function inject(app, sources, { search = false, terms = 1 } = {}) {
  const adzuna = secret(integration(app, "adzuna"));
  const jooble = secret(integration(app, "jooble"));
  const apifySources = sources.filter((source) => APIFY_KINDS.includes(source.kind));
  const budget = search && apifySources.length ? apifyBudget(app) : null;
  let spent = 0;
  const out = [];
  for (const source of sources) {
    const config = { ...(source.config || {}) };
    if (source.kind === "adzuna" && adzuna) [config.app_id, config.app_key] = adzuna.split(":");
    if (source.kind === "jooble" && jooble) config.key = jooble;
    if (APIFY_KINDS.includes(source.kind)) {
      if (!budget) continue;
      const left = budget.config.dailyItems - budget.config.used - spent;
      const maxTerms = Math.min(3, terms);
      const limit = Math.min(budget.config.perSearch, Math.floor(left / Math.max(1, maxTerms)));
      if (limit < 5) continue;
      Object.assign(config, { token: budget.token, limit, max_terms: maxTerms });
      spent += limit * maxTerms;
    }
    out.push({ ...source, config });
  }
  if (budget && spent) {
    budget.config.used += spent;
    budget.record.set("config", budget.config);
    app.save(budget.record);
  }
  return out;
}

module.exports = { discover, findAts, inject, APIFY_KINDS, APIFY_DEFAULTS, apifyBudget, integration };
