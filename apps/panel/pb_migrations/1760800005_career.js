/// <reference path="../pb_data/types.d.ts" />

const PROFILE_FIELDS = [
  { name: "headline", type: "text", max: 120 },
  { name: "email", type: "email" },
  { name: "phone", type: "text", max: 30 },
  { name: "links", type: "json", maxSize: 4000 },
  { name: "about", type: "text", max: 2000 },
  { name: "skills", type: "json", maxSize: 6000 },
  { name: "experiences", type: "json", maxSize: 40000 },
  { name: "education", type: "json", maxSize: 12000 },
  { name: "languages", type: "json", maxSize: 2000 },
  { name: "seniority", type: "select", maxSelect: 1, values: ["estagio", "junior", "pleno", "senior", "especialista", "lideranca"] },
  { name: "salary", type: "number", min: 0 },
  { name: "letter", type: "text", max: 4000 },
  { name: "template", type: "select", maxSelect: 1, values: ["classico", "moderno", "compacto"] },
  { name: "resume", type: "file", maxSelect: 1, maxSize: 5242880, mimeTypes: ["application/pdf"], protected: true },
];

migrate(
  (app) => {
    const sources = app.findCollectionByNameOrId("sources");
    const kind = sources.fields.getByName("kind");
    kind.values = [...kind.values, "card_listing"];
    app.save(sources);

    const hits = new Collection({
      type: "base",
      name: "search_hits",
      fields: [
        { name: "search", type: "relation", required: true, maxSelect: 1, cascadeDelete: true, collectionId: app.findCollectionByNameOrId("searches").id },
        { name: "job", type: "relation", required: true, maxSelect: 1, cascadeDelete: true, collectionId: app.findCollectionByNameOrId("jobs").id },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_search_hits ON search_hits (search, job)", "CREATE INDEX idx_search_hits_job ON search_hits (job)"],
    });
    app.save(hits);

    const profile = app.findCollectionByNameOrId("profile");
    for (const field of PROFILE_FIELDS) profile.fields.add(new Field(field));
    app.save(profile);

    const applications = app.findCollectionByNameOrId("applications");
    applications.fields.add(new Field({ name: "letter", type: "text", max: 4000 }));
    applications.fields.add(new Field({ name: "prep", type: "json", maxSize: 8000 }));
    app.save(applications);
  },
  (app) => {
    const applications = app.findCollectionByNameOrId("applications");
    applications.fields.removeByName("letter");
    applications.fields.removeByName("prep");
    app.save(applications);
    const profile = app.findCollectionByNameOrId("profile");
    for (const field of PROFILE_FIELDS) profile.fields.removeByName(field.name);
    app.save(profile);
    app.delete(app.findCollectionByNameOrId("search_hits"));
    const sources = app.findCollectionByNameOrId("sources");
    const kind = sources.fields.getByName("kind");
    kind.values = kind.values.filter((value) => value !== "card_listing");
    app.save(sources);
  },
);
