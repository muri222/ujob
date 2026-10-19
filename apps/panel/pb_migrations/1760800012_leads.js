/// <reference path="../pb_data/types.d.ts" />

// pacotes de fábrica: o que buscar no OpenStreetMap (grátis), no Google Maps via Apify e na web via Claude
const PACKS = [
  {
    slug: "cosmeticos",
    name: "Marcas de cosméticos",
    description: "Marcas e fábricas de cosméticos, perfumaria e cuidados pessoais",
    osm: ['["craft"="cosmetics"]', '["industrial"="cosmetics"]', '["shop"="cosmetics"]["brand"!~"."]', '["office"="company"]["name"~"cosm[eé]tic|beauty|beleza",i]'],
    searches: ["fábrica de cosméticos", "marca de cosméticos", "indústria de cosméticos"],
  },
  {
    slug: "bebidas",
    name: "Bebidas",
    description: "Cervejarias, destilarias, vinícolas e marcas de bebidas",
    osm: ['["craft"="brewery"]', '["craft"="distillery"]', '["craft"="winery"]', '["industrial"="brewery"]', '["microbrewery"="yes"]'],
    searches: ["cervejaria artesanal", "destilaria", "marca de bebidas"],
  },
  {
    slug: "games",
    name: "Estúdios de games",
    description: "Estúdios e desenvolvedoras de jogos",
    osm: ['["office"~"company|it"]["name"~"game|games|jogos|studio|estúdio",i]', '["craft"="video_game_developer"]'],
    searches: ["estúdio de games", "desenvolvedora de jogos", "game studio"],
  },
];

migrate(
  (app) => {
    const profile = app.findCollectionByNameOrId("profile");
    const autodates = [
      { name: "createdAt", type: "autodate", onCreate: true },
      { name: "updatedAt", type: "autodate", onCreate: true, onUpdate: true },
    ];

    const packs = new Collection({
      type: "base",
      name: "segment_packs",
      fields: [
        { name: "slug", type: "text", required: true, max: 40, pattern: "^[a-z0-9-]+$" },
        { name: "name", type: "text", required: true, max: 80 },
        { name: "description", type: "text", max: 300 },
        { name: "osm", type: "json", maxSize: 4000 },
        { name: "searches", type: "json", maxSize: 2000 },
        ...autodates,
      ],
      indexes: ["CREATE UNIQUE INDEX idx_segment_packs_slug ON segment_packs (slug)"],
    });
    app.save(packs);
    for (const pack of PACKS) {
      const record = new Record(packs);
      record.load(pack);
      app.save(record);
    }

    const campaigns = new Collection({
      type: "base",
      name: "campaigns",
      fields: [
        { name: "profile", type: "relation", required: true, collectionId: profile.id, maxSelect: 1, cascadeDelete: true },
        { name: "pack", type: "relation", required: true, collectionId: packs.id, maxSelect: 1 },
        { name: "name", type: "text", max: 120 },
        { name: "state", type: "text", max: 2 },
        { name: "city", type: "text", max: 80 },
        { name: "source", type: "select", required: true, maxSelect: 1, values: ["osm", "apify", "claude"] },
        { name: "limit", type: "number", onlyInt: true, min: 1, max: 500 },
        { name: "status", type: "select", required: true, maxSelect: 1, values: ["buscando", "enriquecendo", "pronta", "erro"] },
        { name: "found", type: "number", onlyInt: true },
        { name: "error", type: "text", max: 500 },
        ...autodates,
      ],
      indexes: ["CREATE INDEX idx_campaigns_profile ON campaigns (profile, createdAt)"],
    });
    app.save(campaigns);

    const leads = new Collection({
      type: "base",
      name: "leads",
      fields: [
        { name: "profile", type: "relation", required: true, collectionId: profile.id, maxSelect: 1, cascadeDelete: true },
        { name: "campaign", type: "relation", collectionId: campaigns.id, maxSelect: 1 },
        { name: "name", type: "text", required: true, max: 160 },
        { name: "domain", type: "text", max: 120 },
        { name: "website", type: "url" },
        { name: "phone", type: "text", max: 30 },
        { name: "email", type: "text", max: 160 },
        { name: "instagram", type: "text", max: 80 },
        { name: "city", type: "text", max: 80 },
        { name: "state", type: "text", max: 2 },
        { name: "address", type: "text", max: 240 },
        { name: "origin", type: "text", required: true, max: 160 },
        { name: "externalId", type: "text", max: 120 },
        { name: "signals", type: "json", maxSize: 20000 },
        { name: "status", type: "select", required: true, maxSelect: 1, values: ["novo", "enriquecendo", "enriquecido", "sem_site", "contatado", "descartado"] },
        ...autodates,
      ],
      indexes: [
        "CREATE INDEX idx_leads_campaign ON leads (campaign)",
        "CREATE UNIQUE INDEX idx_leads_domain ON leads (profile, domain) WHERE domain != ''",
        "CREATE INDEX idx_leads_phone ON leads (profile, phone)",
      ],
    });
    app.save(leads);

    const integrations = new Collection({
      type: "base",
      name: "integrations",
      fields: [
        { name: "kind", type: "text", required: true, max: 40, pattern: "^[a-z]+$" },
        { name: "secret", type: "text", max: 2000, hidden: true },
        { name: "verifiedAt", type: "date" },
        ...autodates,
      ],
      indexes: ["CREATE UNIQUE INDEX idx_integrations_kind ON integrations (kind)"],
    });
    app.save(integrations);
  },
  (app) => {
    for (const name of ["integrations", "leads", "campaigns", "segment_packs"]) app.delete(app.findCollectionByNameOrId(name));
  },
);
