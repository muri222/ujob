/// <reference path="../pb_data/types.d.ts" />

// Entrada: e-mails de candidatura lidos do IMAP (só os relevantes), com etiqueta e ligação ao funil
migrate(
  (app) => {
    const inbox = new Collection({
      type: "base",
      name: "inbox",
      fields: [
        { name: "account", type: "relation", required: true, collectionId: app.findCollectionByNameOrId("mail_accounts").id, maxSelect: 1, cascadeDelete: true },
        { name: "uid", type: "number", onlyInt: true, min: 0 },
        { name: "messageId", type: "text", max: 300 },
        { name: "fromEmail", type: "text", max: 160 },
        { name: "fromName", type: "text", max: 160 },
        { name: "subject", type: "text", max: 300 },
        { name: "date", type: "date" },
        { name: "snippet", type: "text", max: 300 },
        { name: "body", type: "text", max: 20000 },
        { name: "label", type: "select", maxSelect: 1, values: ["confirmacao", "entrevista", "teste", "rejeicao", "proposta", "acompanhamento", "outro"] },
        { name: "application", type: "relation", collectionId: app.findCollectionByNameOrId("applications").id, maxSelect: 1 },
        { name: "read", type: "bool" },
        { name: "archived", type: "bool" },
        { name: "ai", type: "json", maxSize: 8000 },
        { name: "createdAt", type: "autodate", onCreate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_inbox_uid ON inbox (account, uid)", "CREATE INDEX idx_inbox_date ON inbox (date)"],
    });
    app.save(inbox);

    const accounts = app.findCollectionByNameOrId("mail_accounts");
    accounts.fields.add(new Field({ name: "lastUid", type: "number", onlyInt: true, min: 0 }));
    accounts.fields.add(new Field({ name: "syncedAt", type: "date" }));
    accounts.fields.add(new Field({ name: "syncError", type: "text", max: 500 }));
    app.save(accounts);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("inbox"));
    const accounts = app.findCollectionByNameOrId("mail_accounts");
    for (const name of ["lastUid", "syncedAt", "syncError"]) accounts.fields.removeByName(name);
    app.save(accounts);
  },
);
