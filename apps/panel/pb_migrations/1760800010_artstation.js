/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const sources = app.findCollectionByNameOrId("sources");
    const kind = sources.fields.getByName("kind");
    kind.values = [...kind.values, "artstation"];
    app.save(sources);
  },
  (app) => {
    const sources = app.findCollectionByNameOrId("sources");
    const kind = sources.fields.getByName("kind");
    kind.values = kind.values.filter((value) => value !== "artstation");
    app.save(sources);
  },
);
