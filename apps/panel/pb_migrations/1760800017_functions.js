/// <reference path="../pb_data/types.d.ts" />

// cada perfil vira uma "função" do AiApply (3D Generalista, Editor de Vídeo...): preferências de vaga,
// biblioteca de respostas e painel próprios
const FIELDS = [
  { name: "label", type: "text", max: 60 },
  { name: "prefs", type: "json", maxSize: 20000 },
  { name: "answers", type: "json", maxSize: 40000 },
  { name: "dashboard", type: "json", maxSize: 2000 },
];

migrate(
  (app) => {
    const profile = app.findCollectionByNameOrId("profile");
    for (const field of FIELDS) profile.fields.add(new Field(field));
    app.save(profile);
    // o nome da função começa igual ao título do CV (ou "Principal"); "name" continua sendo o nome da pessoa
    for (const record of app.findRecordsByFilter("profile", "", "", 50, 0)) {
      record.set("label", record.getString("headline").split(/[·|,]/)[0].trim().slice(0, 40) || "Principal");
      app.save(record);
    }
  },
  (app) => {
    const profile = app.findCollectionByNameOrId("profile");
    for (const field of FIELDS) profile.fields.removeByName(field.name);
    app.save(profile);
  },
);
