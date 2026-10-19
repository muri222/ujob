/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const searches = app.findCollectionByNameOrId("searches");
    const status = searches.fields.getByName("status");
    status.values = [...status.values, "canceled"];
    app.save(searches);
  },
  (app) => {
    app.db().newQuery("UPDATE searches SET status = 'error' WHERE status = 'canceled'").execute();
    const searches = app.findCollectionByNameOrId("searches");
    const status = searches.fields.getByName("status");
    status.values = status.values.filter((value) => value !== "canceled");
    app.save(searches);
  },
);
