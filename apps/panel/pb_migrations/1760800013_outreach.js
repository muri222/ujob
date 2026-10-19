/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const leads = app.findCollectionByNameOrId("leads");
    leads.fields.add(new Field({ name: "dossier", type: "json", maxSize: 20000 }));
    leads.fields.add(new Field({ name: "outreach", type: "json", maxSize: 20000 }));
    leads.fields.add(new Field({ name: "aiStatus", type: "select", maxSelect: 1, values: ["", "gerando", "pronto", "erro"] }));
    app.save(leads);

    // e-mail frio pra lead usa a mesma fila de envio das candidaturas
    const messages = app.findCollectionByNameOrId("messages");
    messages.fields.add(new RelationField({ name: "lead", collectionId: leads.id, maxSelect: 1, cascadeDelete: true }));
    app.save(messages);
  },
  (app) => {
    const messages = app.findCollectionByNameOrId("messages");
    messages.fields.removeByName("lead");
    app.save(messages);
    const leads = app.findCollectionByNameOrId("leads");
    for (const name of ["dossier", "outreach", "aiStatus"]) leads.fields.removeByName(name);
    app.save(leads);
  },
);
