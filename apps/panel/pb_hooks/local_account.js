/// <reference path="../pb_data/types.d.ts" />

// dono local do uJob: superusuário criado sozinho, com senha aleatória que ninguém precisa saber
module.exports = function ensureOwner(app) {
  const EMAIL = "dono@radar.local";
  try {
    return app.findAuthRecordByEmail("_superusers", EMAIL);
  } catch {}
  const owner = new Record(app.findCollectionByNameOrId("_superusers"));
  owner.setEmail(EMAIL);
  owner.setPassword($security.randomString(40));
  app.save(owner);
  return owner;
};
