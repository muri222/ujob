/// <reference path="../pb_data/types.d.ts" />

// mais fontes: sistemas de vaga com API pública (Workable, SmartRecruiters, Recruitee, Personio) e
// LinkedIn / Indeed / Google Vagas via Apify (créditos da própria pessoa, desligados por padrão)
const KINDS = ["workable", "workable_search", "smartrecruiters", "recruitee", "personio", "apify_linkedin", "apify_indeed", "apify_google"];

migrate(
  (app) => {
    const sources = app.findCollectionByNameOrId("sources");
    const kind = sources.fields.getByName("kind");
    kind.values = [...kind.values, ...KINDS.filter((value) => !kind.values.includes(value))];
    app.save(sources);

    // config da integração (ex.: Apify: quais fontes de vaga e teto diário de vagas)
    const integrations = app.findCollectionByNameOrId("integrations");
    integrations.fields.add(new Field({ name: "config", type: "json", maxSize: 4000 }));
    app.save(integrations);
  },
  (app) => {
    const sources = app.findCollectionByNameOrId("sources");
    const kind = sources.fields.getByName("kind");
    kind.values = kind.values.filter((value) => !KINDS.includes(value));
    app.save(sources);
    const integrations = app.findCollectionByNameOrId("integrations");
    integrations.fields.removeByName("config");
    app.save(integrations);
  },
);
