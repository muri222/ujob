/// <reference path="../pb_data/types.d.ts" />

// Leads: segmento (até os prontos) e campanha podem ser arquivados ou excluídos.
// Campanha deixa de exigir o segmento: excluir o segmento não apaga as campanhas feitas com ele.
migrate(
  (app) => {
    const packs = app.findCollectionByNameOrId("segment_packs");
    packs.fields.add(new Field({ name: "archived", type: "bool" }));
    app.save(packs);
    const campaigns = app.findCollectionByNameOrId("campaigns");
    campaigns.fields.getByName("pack").required = false;
    campaigns.fields.add(new Field({ name: "archived", type: "bool" }));
    app.save(campaigns);
  },
  (app) => {
    const packs = app.findCollectionByNameOrId("segment_packs");
    packs.fields.removeByName("archived");
    app.save(packs);
    const campaigns = app.findCollectionByNameOrId("campaigns");
    campaigns.fields.getByName("pack").required = true;
    campaigns.fields.removeByName("archived");
    app.save(campaigns);
  },
);
