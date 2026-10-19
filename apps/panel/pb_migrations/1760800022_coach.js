/// <reference path="../pb_data/types.d.ts" />

// Preparar entrevista com o Claude: só as partes que a pessoa escolher, guardadas na candidatura (não gera de novo)
migrate(
  (app) => {
    const applications = app.findCollectionByNameOrId("applications");
    applications.fields.add(new Field({ name: "coach", type: "json", maxSize: 80000 }));
    app.save(applications);
  },
  (app) => {
    const applications = app.findCollectionByNameOrId("applications");
    applications.fields.removeByName("coach");
    app.save(applications);
  },
);
