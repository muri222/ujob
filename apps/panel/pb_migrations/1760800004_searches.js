/// <reference path="../pb_data/types.d.ts" />

const CATEGORIES = [
  "tecnologia", "dados", "design", "produto", "marketing", "vendas", "atendimento", "administrativo",
  "financeiro", "rh", "juridico", "saude", "educacao", "engenharia", "industria", "logistica",
  "varejo", "alimentacao", "construcao", "agro", "seguranca", "servicos", "outros",
];

migrate(
  (app) => {
    const searches = new Collection({
      type: "base",
      name: "searches",
      fields: [
        { name: "key", type: "text", required: true, max: 200 },
        { name: "name", type: "text", max: 80 },
        { name: "term", type: "text", max: 80 },
        { name: "category", type: "select", maxSelect: 1, values: CATEGORIES },
        { name: "state", type: "text", max: 2 },
        { name: "city", type: "text", max: 80 },
        { name: "workplace", type: "select", maxSelect: 1, values: ["remoto", "hibrido", "presencial"] },
        { name: "contract", type: "select", maxSelect: 1, values: ["clt", "pj", "estagio", "aprendiz", "trainee", "temporario", "freelancer"] },
        { name: "status", type: "select", maxSelect: 1, required: true, values: ["queued", "running", "done", "error"] },
        { name: "progress", type: "json", maxSize: 20000 },
        { name: "found", type: "number", onlyInt: true },
        { name: "created", type: "number", onlyInt: true },
        { name: "saved", type: "bool" },
        { name: "everyMinutes", type: "number", onlyInt: true, min: 30, max: 1440 },
        { name: "requestedAt", type: "date" },
        { name: "startedAt", type: "date" },
        { name: "finishedAt", type: "date" },
        { name: "seenAt", type: "date" },
        { name: "createdAt", type: "autodate", onCreate: true },
        { name: "updatedAt", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE INDEX idx_searches_key ON searches (key, finishedAt)",
        "CREATE INDEX idx_searches_queue ON searches (status, requestedAt)",
        "CREATE INDEX idx_searches_saved ON searches (saved, finishedAt)",
      ],
    });
    app.save(searches);

    const profile = new Collection({
      type: "base",
      name: "profile",
      fields: [
        { name: "name", type: "text", max: 80 },
        { name: "categories", type: "select", maxSelect: 23, values: CATEGORIES },
        { name: "state", type: "text", max: 2 },
        { name: "city", type: "text", max: 80 },
        { name: "workplace", type: "select", maxSelect: 1, values: ["remoto", "hibrido", "presencial"] },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(profile);

    const runs = app.findCollectionByNameOrId("runs");
    runs.fields.add(new RelationField({ name: "search", collectionId: searches.id, maxSelect: 1, cascadeDelete: true }));
    app.save(runs);
  },
  (app) => {
    const runs = app.findCollectionByNameOrId("runs");
    runs.fields.removeByName("search");
    app.save(runs);
    app.delete(app.findCollectionByNameOrId("profile"));
    app.delete(app.findCollectionByNameOrId("searches"));
  },
);
