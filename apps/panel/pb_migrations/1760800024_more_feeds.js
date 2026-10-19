/// <reference path="../pb_data/types.d.ts" />

// mais agregadores: Get on Board (América Latina), Working Nomads, Landing.jobs (Europa), vagas do Dribbble
const KINDS = ["getonbrd", "workingnomads", "landingjobs", "rss_dribbble"];

migrate(
  (app) => {
    const sources = app.findCollectionByNameOrId("sources");
    const kind = sources.fields.getByName("kind");
    kind.values = [...kind.values, ...KINDS.filter((value) => !kind.values.includes(value))];
    app.save(sources);
  },
  (app) => {
    const sources = app.findCollectionByNameOrId("sources");
    const kind = sources.fields.getByName("kind");
    kind.values = kind.values.filter((value) => !KINDS.includes(value));
    app.save(sources);
  },
);
