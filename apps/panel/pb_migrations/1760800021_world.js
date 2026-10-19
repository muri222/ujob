/// <reference path="../pb_data/types.d.ts" />

// Radar no mundo todo: busca e campanha de leads escolhem países (código ISO; "WW" = remoto de qualquer lugar)
migrate(
  (app) => {
    const searches = app.findCollectionByNameOrId("searches");
    searches.fields.add(new Field({ name: "countries", type: "json", maxSize: 400 }));
    app.save(searches);
    for (const name of ["campaigns", "leads"]) {
      const collection = app.findCollectionByNameOrId(name);
      collection.fields.add(new Field({ name: "country", type: "text", max: 2 }));
      collection.fields.add(new Field({ name: "region", type: "text", max: 80 }));
      app.save(collection);
    }
  },
  (app) => {
    const searches = app.findCollectionByNameOrId("searches");
    searches.fields.removeByName("countries");
    app.save(searches);
    for (const name of ["campaigns", "leads"]) {
      const collection = app.findCollectionByNameOrId(name);
      collection.fields.removeByName("country");
      collection.fields.removeByName("region");
      app.save(collection);
    }
  },
);
