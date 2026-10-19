/// <reference path="../pb_data/types.d.ts" />

// Kits de candidatura (igual AiApply): carta + CV adaptado + follow-up, com ou sem vaga do radar
const FIELDS = [
  { name: "title", type: "text", max: 200 },
  { name: "company", type: "text", max: 160 },
  { name: "followup", type: "text", max: 4000 },
  { name: "kit", type: "bool" },
];

migrate(
  (app) => {
    const messages = app.findCollectionByNameOrId("messages");
    for (const field of FIELDS) messages.fields.add(new Field(field));
    app.save(messages);
  },
  (app) => {
    const messages = app.findCollectionByNameOrId("messages");
    for (const field of FIELDS) messages.fields.removeByName(field.name);
    app.save(messages);
  },
);
