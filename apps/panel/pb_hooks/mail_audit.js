/// <reference path="../pb_data/types.d.ts" />

// registro de tudo que sai do app (regra 4: nada sai sem o usuário saber)
module.exports = function audit(app, profileId, action, target, detail) {
  const row = new Record(app.findCollectionByNameOrId("audit"));
  row.load({ profile: profileId, action, target: String(target ?? "").slice(0, 200), detail: detail ?? {} });
  app.save(row);
};
