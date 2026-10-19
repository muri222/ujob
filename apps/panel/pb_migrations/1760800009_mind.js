/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const facts = new Collection({
      type: "base",
      name: "mind_facts",
      fields: [
        { name: "profile", type: "relation", required: true, collectionId: app.findCollectionByNameOrId("profile").id, maxSelect: 1, cascadeDelete: true },
        { name: "text", type: "text", required: true, max: 300 },
        { name: "kind", type: "select", required: true, maxSelect: 1, values: ["preferencia", "restricao", "objetivo", "fato"] },
        { name: "origin", type: "text", max: 160 },
        { name: "confidence", type: "number", min: 0, max: 1 },
        { name: "validUntil", type: "date" },
        { name: "status", type: "select", required: true, maxSelect: 1, values: ["pendente", "aprovado", "rejeitado"] },
        { name: "createdAt", type: "autodate", onCreate: true },
        { name: "updatedAt", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_mind_facts_profile ON mind_facts (profile, status)"],
    });
    app.save(facts);

    // recusa de vaga: guarda o motivo junto do funil, sem sumir com a vaga do banco
    const applications = app.findCollectionByNameOrId("applications");
    const stage = applications.fields.getByName("stage");
    stage.values = [...stage.values, "recusada"];
    applications.fields.add(new Field({ name: "reason", type: "text", max: 1000 }));
    app.save(applications);
  },
  (app) => {
    const applications = app.findCollectionByNameOrId("applications");
    applications.fields.removeByName("reason");
    const stage = applications.fields.getByName("stage");
    stage.values = stage.values.filter((value) => value !== "recusada");
    app.save(applications);
    app.delete(app.findCollectionByNameOrId("mind_facts"));
  },
);
