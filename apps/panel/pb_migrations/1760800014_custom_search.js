/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // busca descrita em texto livre: o Claude devolve vários termos (PT e EN) pra uma função específica
    const searches = app.findCollectionByNameOrId("searches");
    searches.fields.add(new Field({ name: "terms", type: "json", maxSize: 2000 }));
    searches.fields.add(new Field({ name: "prompt", type: "text", max: 500 }));
    app.save(searches);

    // pacote de leads criado pelo usuário (os de fábrica não têm perfil)
    const packs = app.findCollectionByNameOrId("segment_packs");
    packs.fields.add(new RelationField({ name: "profile", collectionId: app.findCollectionByNameOrId("profile").id, maxSelect: 1, cascadeDelete: true }));
    packs.indexes = packs.indexes.filter((index) => !index.includes("idx_segment_packs_slug"));
    packs.indexes.push("CREATE UNIQUE INDEX idx_segment_packs_slug ON segment_packs (slug, profile)");
    app.save(packs);
  },
  (app) => {
    const packs = app.findCollectionByNameOrId("segment_packs");
    packs.fields.removeByName("profile");
    packs.indexes = packs.indexes.filter((index) => !index.includes("idx_segment_packs_slug"));
    packs.indexes.push("CREATE UNIQUE INDEX idx_segment_packs_slug ON segment_packs (slug)");
    app.save(packs);
    const searches = app.findCollectionByNameOrId("searches");
    searches.fields.removeByName("terms");
    searches.fields.removeByName("prompt");
    app.save(searches);
  },
);
