/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const profile = app.findCollectionByNameOrId("profile");
    const autodates = [
      { name: "createdAt", type: "autodate", onCreate: true },
      { name: "updatedAt", type: "autodate", onCreate: true, onUpdate: true },
    ];

    const conversations = new Collection({
      type: "base",
      name: "conversations",
      fields: [
        { name: "profile", type: "relation", required: true, collectionId: profile.id, maxSelect: 1, cascadeDelete: true },
        { name: "title", type: "text", max: 120 },
        { name: "archived", type: "bool" },
        { name: "pinned", type: "bool" },
        { name: "lastAt", type: "date" },
        ...autodates,
      ],
      indexes: ["CREATE INDEX idx_conversations_profile ON conversations (profile, archived, lastAt)"],
    });
    app.save(conversations);

    const messages = new Collection({
      type: "base",
      name: "chat_messages",
      fields: [
        { name: "conversation", type: "relation", required: true, collectionId: conversations.id, maxSelect: 1, cascadeDelete: true },
        { name: "role", type: "select", required: true, maxSelect: 1, values: ["user", "assistant"] },
        { name: "text", type: "text", max: 100000 },
        { name: "files", type: "file", maxSelect: 10, maxSize: 26214400, protected: true },
        { name: "status", type: "select", required: true, maxSelect: 1, values: ["pronta", "transcrevendo", "pensando", "escrevendo", "erro"] },
        { name: "error", type: "text", max: 1000 },
        { name: "meta", type: "json", maxSize: 4000 },
        ...autodates,
      ],
      indexes: ["CREATE INDEX idx_chat_messages_conversation ON chat_messages (conversation, createdAt)"],
    });
    app.save(messages);

    // chat na frente da fila: resposta de conversa não espera campanha de leads
    const tasks = app.findCollectionByNameOrId("ai_tasks");
    tasks.fields.add(new Field({ name: "priority", type: "number", onlyInt: true }));
    app.save(tasks);
  },
  (app) => {
    const tasks = app.findCollectionByNameOrId("ai_tasks");
    tasks.fields.removeByName("priority");
    app.save(tasks);
    app.delete(app.findCollectionByNameOrId("chat_messages"));
    app.delete(app.findCollectionByNameOrId("conversations"));
  },
);
