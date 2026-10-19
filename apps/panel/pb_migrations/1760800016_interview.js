/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // conversa pode ser chat normal ou simulação de entrevista (Claude vira o entrevistador da vaga)
    const conversations = app.findCollectionByNameOrId("conversations");
    conversations.fields.add(new Field({ name: "mode", type: "select", maxSelect: 1, values: ["chat", "entrevista"] }));
    conversations.fields.add(new Field({ name: "setup", type: "json", maxSize: 20000 }));
    app.save(conversations);
  },
  (app) => {
    const conversations = app.findCollectionByNameOrId("conversations");
    conversations.fields.removeByName("mode");
    conversations.fields.removeByName("setup");
    app.save(conversations);
  },
);
