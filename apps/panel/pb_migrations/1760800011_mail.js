/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const profile = app.findCollectionByNameOrId("profile");
    const autodates = [
      { name: "createdAt", type: "autodate", onCreate: true },
      { name: "updatedAt", type: "autodate", onCreate: true, onUpdate: true },
    ];

    const accounts = new Collection({
      type: "base",
      name: "mail_accounts",
      fields: [
        { name: "profile", type: "relation", required: true, collectionId: profile.id, maxSelect: 1, cascadeDelete: true },
        { name: "email", type: "email", required: true },
        { name: "name", type: "text", max: 80 },
        { name: "smtpHost", type: "text", required: true, max: 120 },
        { name: "smtpPort", type: "number", onlyInt: true, min: 1, max: 65535 },
        { name: "imapHost", type: "text", max: 120 },
        { name: "imapPort", type: "number", onlyInt: true, min: 1, max: 65535 },
        { name: "secret", type: "text", max: 2000, hidden: true },
        { name: "verifiedAt", type: "date" },
        { name: "lastError", type: "text", max: 500 },
        ...autodates,
      ],
      indexes: ["CREATE UNIQUE INDEX idx_mail_accounts_profile ON mail_accounts (profile)"],
    });
    app.save(accounts);

    const messages = new Collection({
      type: "base",
      name: "messages",
      fields: [
        { name: "profile", type: "relation", required: true, collectionId: profile.id, maxSelect: 1, cascadeDelete: true },
        { name: "job", type: "relation", collectionId: app.findCollectionByNameOrId("jobs").id, maxSelect: 1 },
        { name: "channel", type: "select", required: true, maxSelect: 1, values: ["email", "manual"] },
        { name: "to", type: "text", max: 160 },
        { name: "subject", type: "text", max: 200 },
        { name: "body", type: "text", max: 8000 },
        { name: "lang", type: "text", max: 10 },
        { name: "cv", type: "json", maxSize: 60000 },
        { name: "status", type: "select", required: true, maxSelect: 1, values: ["gerando", "pronta", "enviando", "enviada", "erro", "descartada"] },
        { name: "error", type: "text", max: 1000 },
        { name: "sentAt", type: "date" },
        ...autodates,
      ],
      indexes: ["CREATE INDEX idx_messages_profile ON messages (profile, status)", "CREATE INDEX idx_messages_sent ON messages (profile, sentAt)"],
    });
    app.save(messages);

    const audit = new Collection({
      type: "base",
      name: "audit",
      fields: [
        { name: "profile", type: "relation", collectionId: profile.id, maxSelect: 1, cascadeDelete: true },
        { name: "action", type: "text", required: true, max: 60 },
        { name: "target", type: "text", max: 200 },
        { name: "detail", type: "json", maxSize: 4000 },
        { name: "createdAt", type: "autodate", onCreate: true },
      ],
      indexes: ["CREATE INDEX idx_audit_recent ON audit (profile, createdAt)"],
    });
    app.save(audit);
  },
  (app) => {
    for (const name of ["audit", "messages", "mail_accounts"]) app.delete(app.findCollectionByNameOrId(name));
  },
);
