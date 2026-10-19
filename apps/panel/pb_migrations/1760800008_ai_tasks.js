/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const bots = app.findCollectionByNameOrId("bots");
    bots.fields.add(new Field({ name: "role", type: "select", maxSelect: 1, values: ["scout", "brain"] }));
    app.save(bots);
    app.db().newQuery("UPDATE bots SET role = 'scout' WHERE role = ''").execute();

    const tasks = new Collection({
      type: "base",
      name: "ai_tasks",
      fields: [
        { name: "type", type: "text", required: true, max: 40, pattern: "^[a-z_]+$" },
        { name: "profile", type: "relation", collectionId: app.findCollectionByNameOrId("profile").id, maxSelect: 1, cascadeDelete: true },
        { name: "ref", type: "text", max: 200 },
        { name: "payload", type: "json", maxSize: 200000 },
        { name: "status", type: "select", required: true, maxSelect: 1, values: ["queued", "running", "done", "failed"] },
        { name: "result", type: "json", maxSize: 200000 },
        { name: "error", type: "text", max: 2000 },
        { name: "attempts", type: "number", onlyInt: true, min: 0 },
        { name: "startedAt", type: "date" },
        { name: "finishedAt", type: "date" },
        { name: "createdAt", type: "autodate", onCreate: true },
        { name: "updatedAt", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_ai_tasks_queue ON ai_tasks (status, createdAt)", "CREATE INDEX idx_ai_tasks_ref ON ai_tasks (type, ref)"],
    });
    app.save(tasks);

    const log = new Collection({
      type: "base",
      name: "ai_log",
      fields: [
        { name: "task", type: "relation", collectionId: tasks.id, maxSelect: 1, cascadeDelete: true },
        { name: "provider", type: "text", max: 40 },
        { name: "model", type: "text", max: 80 },
        { name: "tokensIn", type: "number", onlyInt: true, min: 0 },
        { name: "tokensOut", type: "number", onlyInt: true, min: 0 },
        { name: "cost", type: "number", min: 0 },
        { name: "latencyMs", type: "number", onlyInt: true, min: 0 },
        { name: "ok", type: "bool" },
        { name: "error", type: "text", max: 2000 },
        { name: "createdAt", type: "autodate", onCreate: true },
      ],
      indexes: ["CREATE INDEX idx_ai_log_recent ON ai_log (createdAt)"],
    });
    app.save(log);

    require(`${__hooks}/scout_account.js`)(app);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("ai_log"));
    app.delete(app.findCollectionByNameOrId("ai_tasks"));
    const bots = app.findCollectionByNameOrId("bots");
    bots.fields.removeByName("role");
    app.save(bots);
  },
);
