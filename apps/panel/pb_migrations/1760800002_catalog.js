/// <reference path="../pb_data/types.d.ts" />

const CATEGORIES = [
  "tecnologia", "dados", "design", "produto", "marketing", "vendas", "atendimento", "administrativo",
  "financeiro", "rh", "juridico", "saude", "educacao", "engenharia", "industria", "logistica",
  "varejo", "alimentacao", "construcao", "agro", "seguranca", "servicos", "outros",
];
const SENIORITY = ["estagio", "junior", "pleno", "senior", "especialista", "lideranca"];
const CONTRACTS = ["clt", "pj", "estagio", "aprendiz", "trainee", "temporario", "freelancer", "talentos", "outro"];
const WORKPLACES = ["remoto", "hibrido", "presencial"];
const KINDS = [
  "gupy", "gupy_search", "greenhouse", "lever", "ashby", "github", "remotive", "arbeitnow", "remoteok",
  "himalayas", "jobicy", "wwr", "trampos", "programathor", "jsonld", "adzuna", "jooble",
];
const GROUPS = ["portal", "empresa", "agencia", "comunidade", "remoto"];

const select = (name, values, extra = {}) => ({ name, type: "select", maxSelect: 1, values, ...extra });
const autodates = [
  { name: "created", type: "autodate", onCreate: true },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
];

migrate(
  (app) => {
    const bots = new Collection({
      type: "auth",
      name: "bots",
      passwordAuth: { enabled: true, identityFields: ["email"] },
      authToken: { duration: 3600 },
    });
    app.save(bots);

    const sources = new Collection({
      type: "base",
      name: "sources",
      fields: [
        { name: "slug", type: "text", required: true, max: 80, pattern: "^[a-z0-9-]+$" },
        { name: "name", type: "text", required: true, max: 120 },
        select("kind", KINDS, { required: true }),
        select("group", GROUPS, { required: true }),
        { name: "target", type: "text", max: 500 },
        { name: "config", type: "json", maxSize: 20000 },
        { name: "site", type: "url" },
        { name: "logoUrl", type: "url" },
        { name: "active", type: "bool" },
        { name: "intervalMinutes", type: "number", onlyInt: true, min: 15, max: 10080 },
        { name: "runRequested", type: "bool" },
        { name: "lastRunAt", type: "date" },
        select("lastStatus", ["ok", "empty", "error"]),
        { name: "lastError", type: "text", max: 500 },
        { name: "lastFound", type: "number", onlyInt: true },
        ...autodates,
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_sources_slug ON sources (slug)",
        "CREATE INDEX idx_sources_due ON sources (active, lastRunAt)",
        "CREATE INDEX idx_sources_group ON sources (`group`, name)",
      ],
    });
    app.save(sources);

    const jobs = new Collection({
      type: "base",
      name: "jobs",
      fields: [
        { name: "hash", type: "text", required: true, min: 40, max: 40 },
        { name: "source", type: "relation", required: true, collectionId: sources.id, maxSelect: 1, cascadeDelete: true },
        { name: "title", type: "text", required: true, max: 300 },
        { name: "company", type: "text", max: 160 },
        { name: "companyLogo", type: "url" },
        { name: "url", type: "url", required: true },
        { name: "applyUrl", type: "url" },
        select("category", CATEGORIES),
        select("seniority", SENIORITY),
        select("contract", CONTRACTS),
        select("workplace", WORKPLACES),
        { name: "city", type: "text", max: 80 },
        { name: "state", type: "text", max: 2 },
        { name: "country", type: "text", max: 60 },
        { name: "salaryMin", type: "number" },
        { name: "salaryMax", type: "number" },
        { name: "salaryCurrency", type: "text", max: 3 },
        select("salaryPeriod", ["hora", "mes", "ano"]),
        { name: "summary", type: "text", max: 600 },
        { name: "description", type: "text", max: 40000 },
        { name: "tags", type: "json", maxSize: 4000 },
        { name: "contactEmail", type: "text", max: 160 },
        { name: "contactPhone", type: "text", max: 30 },
        { name: "contactWhatsapp", type: "text", max: 20 },
        { name: "publishedAt", type: "date" },
        { name: "expiresAt", type: "date" },
        { name: "firstSeenAt", type: "date", required: true },
        { name: "lastSeenAt", type: "date", required: true },
        { name: "closedAt", type: "date" },
        select("status", ["open", "closed"], { required: true }),
        { name: "enriched", type: "bool" },
        ...autodates,
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_jobs_hash ON jobs (hash)",
        "CREATE INDEX idx_jobs_feed ON jobs (status, firstSeenAt)",
        "CREATE INDEX idx_jobs_published ON jobs (status, publishedAt)",
        "CREATE INDEX idx_jobs_source ON jobs (source, status, lastSeenAt)",
        "CREATE INDEX idx_jobs_category ON jobs (category, status)",
        "CREATE INDEX idx_jobs_company ON jobs (company, status)",
        "CREATE INDEX idx_jobs_place ON jobs (state, workplace, status)",
      ],
    });
    app.save(jobs);

    const runs = new Collection({
      type: "base",
      name: "runs",
      fields: [
        { name: "source", type: "relation", required: true, collectionId: sources.id, maxSelect: 1, cascadeDelete: true },
        { name: "startedAt", type: "date", required: true },
        { name: "finishedAt", type: "date", required: true },
        select("status", ["ok", "empty", "error"], { required: true }),
        { name: "found", type: "number", onlyInt: true },
        { name: "created", type: "number", onlyInt: true },
        { name: "updated", type: "number", onlyInt: true },
        { name: "closed", type: "number", onlyInt: true },
        { name: "error", type: "text", max: 500 },
      ],
      indexes: ["CREATE INDEX idx_runs_recent ON runs (finishedAt)", "CREATE INDEX idx_runs_source ON runs (source, finishedAt)"],
    });
    app.save(runs);

    const applications = new Collection({
      type: "base",
      name: "applications",
      fields: [
        { name: "job", type: "relation", collectionId: jobs.id, maxSelect: 1 },
        { name: "title", type: "text", required: true, max: 300 },
        { name: "company", type: "text", max: 160 },
        { name: "companyLogo", type: "url" },
        { name: "url", type: "url" },
        select("stage", ["salva", "aplicada", "entrevista", "teste", "proposta", "contratado", "encerrada"], { required: true }),
        { name: "position", type: "number" },
        { name: "notes", type: "text", max: 5000 },
        { name: "contactName", type: "text", max: 120 },
        { name: "contactEmail", type: "text", max: 160 },
        { name: "contactPhone", type: "text", max: 30 },
        { name: "salary", type: "text", max: 80 },
        { name: "appliedAt", type: "date" },
        { name: "nextAt", type: "date" },
        ...autodates,
      ],
      indexes: ["CREATE UNIQUE INDEX idx_applications_job ON applications (job) WHERE job != ''", "CREATE INDEX idx_applications_stage ON applications (stage, position)"],
    });
    app.save(applications);

    const hits = new Collection({
      type: "base",
      name: "honeypot_hits",
      fields: [
        { name: "ip", type: "text", required: true, max: 64 },
        { name: "method", type: "text", max: 8 },
        { name: "path", type: "text", max: 200 },
        { name: "userAgent", type: "text", max: 300 },
        { name: "created", type: "autodate", onCreate: true },
      ],
      indexes: ["CREATE INDEX idx_honeypot_ip ON honeypot_hits (ip, created)"],
    });
    app.save(hits);
  },
  (app) => {
    for (const name of ["honeypot_hits", "applications", "runs", "jobs", "sources", "bots"]) {
      app.delete(app.findCollectionByNameOrId(name));
    }
  },
);
