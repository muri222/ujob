/// <reference path="../pb_data/types.d.ts" />

// leads em perfis do Instagram e do TikTok (via Apify, créditos da pessoa)
migrate(
  (app) => {
    const campaigns = app.findCollectionByNameOrId("campaigns");
    const source = campaigns.fields.getByName("source");
    source.values = [...source.values, ...["instagram", "tiktok"].filter((value) => !source.values.includes(value))];
    app.save(campaigns);
  },
  (app) => {
    const campaigns = app.findCollectionByNameOrId("campaigns");
    const source = campaigns.fields.getByName("source");
    source.values = source.values.filter((value) => !["instagram", "tiktok"].includes(value));
    app.save(campaigns);
  },
);
