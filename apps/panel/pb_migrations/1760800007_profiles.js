/// <reference path="../pb_data/types.d.ts" />

// ponytail: a coleção "profile" do ujob vira a lista de perfis (um registro por perfil), sem renomear
const PROFILE_FIELDS = [
  { name: "kind", type: "select", maxSelect: 1, values: ["pessoa", "estudio", "cliente"] },
  { name: "portfolio", type: "json", maxSize: 4000 },
  { name: "countries", type: "json", maxSize: 2000 },
  { name: "sendMode", type: "select", maxSelect: 1, values: ["revisao", "hibrido", "auto"] },
  { name: "threshold", type: "number", min: 0, max: 100, onlyInt: true },
  { name: "dailyCap", type: "number", min: 0, max: 500, onlyInt: true },
];

migrate(
  (app) => {
    const profile = app.findCollectionByNameOrId("profile");
    for (const field of PROFILE_FIELDS) profile.fields.add(new Field(field));
    app.save(profile);

    for (const name of ["applications", "searches"]) {
      const collection = app.findCollectionByNameOrId(name);
      collection.fields.add(new RelationField({ name: "profile", collectionId: profile.id, maxSelect: 1, cascadeDelete: true }));
      if (name === "applications") {
        collection.indexes = collection.indexes.filter((index) => !index.includes("idx_applications_job"));
        collection.indexes.push("CREATE UNIQUE INDEX idx_applications_job ON applications (profile, job) WHERE job != ''");
      }
      collection.indexes.push(`CREATE INDEX idx_${name}_profile ON ${name} (profile)`);
      app.save(collection);
    }

    const first = app.findRecordsByFilter("profile", "", "", 1, 0)[0];
    if (!first) return;
    first.load({ kind: "pessoa", sendMode: "revisao", threshold: 70, dailyCap: 10 });
    app.save(first);
    for (const name of ["applications", "searches"]) {
      app.db().newQuery(`UPDATE ${name} SET profile = {:id} WHERE profile = ''`).bind({ id: first.id }).execute();
    }
  },
  (app) => {
    for (const name of ["applications", "searches"]) {
      const collection = app.findCollectionByNameOrId(name);
      collection.fields.removeByName("profile");
      collection.indexes = collection.indexes.filter((index) => !index.includes(`idx_${name}_profile`) && !index.includes("idx_applications_job"));
      if (name === "applications") collection.indexes.push("CREATE UNIQUE INDEX idx_applications_job ON applications (job) WHERE job != ''");
      app.save(collection);
    }
    const profile = app.findCollectionByNameOrId("profile");
    for (const field of PROFILE_FIELDS) profile.fields.removeByName(field.name);
    app.save(profile);
  },
);
