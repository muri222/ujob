/// <reference path="../pb_data/types.d.ts" />

// Apify: token da própria pessoa, cifrado igual à senha do e-mail; verificado na hora pela API da Apify
routerAdd(
  "POST",
  "/api/radar/integrations/apify",
  (e) => {
    const token = String(e.requestInfo().body.token ?? "").trim();
    if (!/^apify_api_[A-Za-z0-9]{20,}$/.test(token)) return e.json(400, { message: "Token da Apify inválido (começa com apify_api_)." });
    const res = $http.send({ url: `https://api.apify.com/v2/users/me?token=${token}`, method: "GET", timeout: 15 });
    if (res.statusCode !== 200) return e.json(400, { message: "A Apify recusou esse token." });
    const user = JSON.parse(toString(res.body)).data || {};
    let record;
    try {
      record = $app.findFirstRecordByFilter("integrations", "kind = 'apify'", {});
    } catch {
      record = new Record($app.findCollectionByNameOrId("integrations"));
      record.set("kind", "apify");
    }
    record.load({ secret: require(`${__hooks}/mail.js`).encrypt(token), verifiedAt: new Date().toISOString().replace("T", " ") });
    $app.save(record);
    return e.json(200, { username: user.username || "", plan: user.plan?.id || "" });
  },
  $apis.requireSuperuserAuth(),
);

routerAdd(
  "GET",
  "/api/radar/integrations",
  (e) => {
    const { integration, apifyBudget, APIFY_KINDS } = require(`${__hooks}/feeds.js`);
    const status = (kind) => {
      const record = integration($app, kind);
      return record ? { connected: true, verifiedAt: record.getString("verifiedAt") } : { connected: false };
    };
    const budget = apifyBudget($app);
    const jobs = Object.fromEntries(
      APIFY_KINDS.map((kind) => {
        try {
          return [kind, $app.findFirstRecordByFilter("sources", "kind = {:kind}", { kind }).getBool("active")];
        } catch {
          return [kind, false];
        }
      }),
    );
    const discovered = $app.countRecords("sources", $dbx.exp("config LIKE '%\"discovered\":true%'"));
    return e.json(200, {
      apify: { ...status("apify"), jobs, dailyItems: budget?.config.dailyItems ?? 300, usedToday: budget?.config.used ?? 0 },
      adzuna: status("adzuna"),
      jooble: status("jooble"),
      discovered,
    });
  },
  $apis.requireSuperuserAuth(),
);

// Adzuna e Jooble: chave grátis da própria pessoa, testada na hora
routerAdd(
  "POST",
  "/api/radar/integrations/{kind}",
  (e) => {
    const kind = e.request.pathValue("kind");
    const body = e.requestInfo().body;
    let secret = "";
    let test;
    if (kind === "adzuna") {
      const id = String(body.appId ?? "").trim();
      const key = String(body.appKey ?? "").trim();
      if (!/^[a-z0-9]{4,40}$/i.test(id) || !/^[a-z0-9]{8,80}$/i.test(key)) return e.json(400, { message: "Confira o App ID e a App Key da Adzuna." });
      secret = `${id}:${key}`;
      test = { url: `https://api.adzuna.com/v1/api/jobs/br/search/1?app_id=${id}&app_key=${key}&results_per_page=1&what=designer`, method: "GET", timeout: 20 };
    } else if (kind === "jooble") {
      const key = String(body.key ?? "").trim();
      if (!/^[a-z0-9-]{8,80}$/i.test(key)) return e.json(400, { message: "Chave da Jooble inválida." });
      secret = key;
      test = { url: `https://br.jooble.org/api/${key}`, method: "POST", body: JSON.stringify({ keywords: "designer", location: "Brasil" }), headers: { "content-type": "application/json" }, timeout: 20 };
    } else {
      return e.json(404, { message: "Integração desconhecida." });
    }
    const res = $http.send(test);
    if (res.statusCode !== 200) return e.json(400, { message: `A ${kind === "adzuna" ? "Adzuna" : "Jooble"} recusou essa chave (${res.statusCode}).` });
    let record;
    try {
      record = $app.findFirstRecordByFilter("integrations", "kind = {:kind}", { kind });
    } catch {
      record = new Record($app.findCollectionByNameOrId("integrations"));
      record.set("kind", kind);
    }
    record.load({ secret: require(`${__hooks}/mail.js`).encrypt(secret), verifiedAt: new Date().toISOString().replace("T", " ") });
    $app.save(record);
    // a fonte roda já na próxima rodada
    $app.db().newQuery("UPDATE sources SET runRequested = 1, active = 1 WHERE kind = {:kind}").bind({ kind }).execute();
    return e.json(200, { ok: true });
  },
  $apis.requireSuperuserAuth(),
);

// LinkedIn / Indeed / Google Vagas via Apify: liga cada uma e define o teto diário de vagas (controla o gasto)
routerAdd(
  "POST",
  "/api/radar/integrations/apify/jobs",
  (e) => {
    const { apifyBudget, APIFY_KINDS } = require(`${__hooks}/feeds.js`);
    const budget = apifyBudget($app);
    if (!budget) return e.json(400, { message: "Conecte a Apify primeiro." });
    const body = e.requestInfo().body;
    for (const kind of APIFY_KINDS) {
      if (typeof body[kind] !== "boolean") continue;
      $app.db().newQuery("UPDATE sources SET active = {:on} WHERE kind = {:kind}").bind({ on: body[kind], kind }).execute();
    }
    if (body.dailyItems !== undefined) budget.config.dailyItems = Math.max(0, Math.min(5000, parseInt(body.dailyItems, 10) || 0));
    budget.record.set("config", budget.config);
    $app.save(budget.record);
    return e.json(200, { ok: true });
  },
  $apis.requireSuperuserAuth(),
);

// campanha: escolhe pacote, região e fonte; a busca roda no brain
routerAdd(
  "POST",
  "/api/radar/campaigns",
  (e) => {
    const body = e.requestInfo().body;
    const profile = $app.findRecordById("profile", String(body.profile ?? ""));
    const pack = $app.findRecordById("segment_packs", String(body.pack ?? ""));
    const source = ["osm", "apify", "claude", "instagram", "tiktok"].includes(body.source) ? body.source : "osm";
    // mundo todo: país (ISO) + região/estado + cidade; no Brasil o estado é a sigla
    const { COUNTRIES } = require(`${__hooks}/countries.js`);
    const country = COUNTRIES[String(body.country ?? "BR").toUpperCase()] && body.country !== "WW" ? String(body.country ?? "BR").toUpperCase() : "BR";
    const state = country === "BR" && /^[A-Z]{2}$/.test(body.state) ? body.state : "";
    const region = country === "BR" ? "" : String(body.region ?? "").trim().slice(0, 80);
    const city = String(body.city ?? "").trim().slice(0, 80);
    const limit = Math.min(source === "claude" ? 30 : 200, Math.max(1, parseInt(body.limit, 10) || 30));
    if (source === "osm" && !state && !region && !city) return e.json(400, { message: country === "BR" ? "No OpenStreetMap, escolha pelo menos o estado." : "No OpenStreetMap, diga a cidade ou a região (o país inteiro é grande demais pro mapa)." });
    if (["apify", "instagram", "tiktok"].includes(source)) {
      try {
        $app.findFirstRecordByFilter("integrations", "kind = 'apify'", {});
      } catch {
        return e.json(400, { message: "Conecte sua conta da Apify em Configurações." });
      }
    }
    const campaign = new Record($app.findCollectionByNameOrId("campaigns"));
    campaign.load({ profile: profile.id, pack: pack.id, name: `${pack.getString("name")} · ${[city, state || region, COUNTRIES[country].pt].filter(Boolean).join(", ")}`, state, region, country, city, source, limit, status: "buscando", found: 0 });
    $app.save(campaign);
    const task = new Record($app.findCollectionByNameOrId("ai_tasks"));
    task.load({
      type: source === "claude" ? "leads_discover_claude" : "leads_discover",
      profile: profile.id,
      ref: campaign.id,
      status: "queued",
      payload: { source, state, region, country, countryName: COUNTRIES[country].en, city, limit, pack: pack.getString("name"), description: pack.getString("description"), osm: JSON.parse(pack.getString("osm") || "[]"), searches: JSON.parse(pack.getString("searches") || "[]") },
      attempts: 0,
    });
    $app.save(task);
    return e.json(200, { campaign: campaign.id });
  },
  $apis.requireSuperuserAuth(),
);

onRecordAfterUpdateSuccess((e) => {
  e.next();
  const task = e.record;
  const type = task.getString("type");
  const status = task.getString("status");
  if (!["leads_discover", "leads_discover_claude", "lead_enrich"].includes(type) || !["done", "failed"].includes(status)) return;
  const result = JSON.parse(task.getString("result") || "null") || {};

  if (type === "lead_enrich") {
    const lead = $app.findRecordById("leads", task.getString("ref"));
    if (status === "done") {
      const first = (list) => (Array.isArray(list) && list[0]) || "";
      if (!lead.getString("email")) lead.set("email", String(first(result.emails)).slice(0, 160));
      if (!lead.getString("phone")) lead.set("phone", String(first(result.phones)).slice(0, 30));
      if (!lead.getString("instagram")) lead.set("instagram", String(result.socials?.instagram ?? "").slice(0, 80));
      // junta com o que a rede social já tinha trazido (bio, seguidores)
      const before = JSON.parse(lead.getString("signals") || "{}") || {};
      lead.load({ signals: { ...before, ...result, description: result.description || before.description, socials: { ...(before.socials || {}), ...(result.socials || {}) } }, status: "enriquecido" });
    } else {
      lead.load({ signals: { error: task.getString("error").slice(0, 300) }, status: "sem_site" });
    }
    $app.save(lead);
    const campaignId = lead.getString("campaign");
    if (campaignId && !$app.countRecords("leads", $dbx.exp("campaign = {:c} AND status = 'enriquecendo'", { c: campaignId }))) {
      const campaign = $app.findRecordById("campaigns", campaignId);
      campaign.set("status", "pronta");
      $app.save(campaign);
    }
    return;
  }

  const campaign = $app.findRecordById("campaigns", task.getString("ref"));
  if (status === "failed") {
    campaign.load({ status: "erro", error: task.getString("error").slice(0, 500) });
    $app.save(campaign);
    return;
  }

  // grava os lugares achados, sem repetir domínio, telefone ou Instagram do mesmo perfil
  const profileId = campaign.getString("profile");
  const leads = $app.findCollectionByNameOrId("leads");
  const tasks = $app.findCollectionByNameOrId("ai_tasks");
  const domainOf = (url) => String(url || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0].slice(0, 120);
  const brazil = (campaign.getString("country") || "BR") === "BR";
  const digits = (phone) => (brazil ? String(phone || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "") : String(phone || "").replace(/[^\d+]/g, "")).slice(0, 30);
  const handle = (value) => String(value || "").toLowerCase().replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/^@/, "").split(/[/?#]/)[0].slice(0, 80);
  const seen = (field, value) => value && $app.countRecords("leads", $dbx.exp(`profile = {:p} AND ${field} = {:v}`, { p: profileId, v: value })) > 0;
  let created = 0;
  for (const place of (result.places || []).slice(0, campaign.getInt("limit") || 200)) {
    const name = String(place.name ?? "").trim().slice(0, 160);
    const website = /^https?:\/\/[^\s"<>]+$/i.test(place.website || "") ? place.website : "";
    const domain = domainOf(website);
    const phone = digits(place.phone);
    const instagram = handle(place.instagram);
    const externalId = String(place.externalId ?? "").slice(0, 120);
    if (!name || seen("domain", domain) || seen("phone", phone) || seen("instagram", instagram) || seen("externalId", externalId)) continue;
    const lead = new Record(leads);
    lead.load({
      profile: profileId,
      campaign: campaign.id,
      name,
      domain,
      website,
      phone,
      instagram,
      email: String(place.email ?? "").slice(0, 160),
      city: String(place.city ?? "").slice(0, 80),
      state: campaign.getString("country") === "BR" && /^[A-Z]{2}$/.test(place.state) ? place.state : campaign.getString("state"),
      region: String(place.region || campaign.getString("region")).slice(0, 80),
      country: campaign.getString("country") || "BR",
      address: String(place.address ?? "").slice(0, 240),
      origin: String(place.origin ?? campaign.getString("source")).slice(0, 160),
      externalId,
      status: website ? "enriquecendo" : "sem_site",
      // perfil de rede social: bio, seguidores e TikTok já vêm da busca (o site, se houver, completa depois)
      signals: place.bio || place.followers || place.tiktok ? { description: String(place.bio ?? "").slice(0, 600), followers: Number(place.followers) || 0, socials: place.tiktok ? { tiktok: String(place.tiktok).slice(0, 80) } : {} } : null,
    });
    try {
      $app.save(lead);
    } catch {
      continue;
    }
    created++;
    if (website) {
      const enrich = new Record(tasks);
      enrich.load({ type: "lead_enrich", profile: profileId, ref: lead.id, status: "queued", payload: { website }, attempts: 0 });
      $app.save(enrich);
    }
  }
  const pending = $app.countRecords("leads", $dbx.exp("campaign = {:c} AND status = 'enriquecendo'", { c: campaign.id }));
  campaign.load({ found: created, status: pending ? "enriquecendo" : "pronta", error: created ? "" : "Nenhuma empresa nova encontrada nessa região." });
  $app.save(campaign);
}, "ai_tasks");

// dossiê (Opus) e depois abordagem (Sonnet): o Claude só lê o que o PC já raspou do site
routerAdd(
  "POST",
  "/api/radar/leads/{id}/dossier",
  (e) => {
    const { cvOf, menteOf } = require(`${__hooks}/payload.js`);
    const lead = $app.findRecordById("leads", e.request.pathValue("id"));
    const profile = $app.findRecordById("profile", lead.getString("profile"));
    const signals = JSON.parse(lead.getString("signals") || "{}") || {};
    const info = { name: lead.getString("name"), website: lead.getString("website"), city: lead.getString("city"), state: lead.getString("state"), instagram: lead.getString("instagram"), origin: lead.getString("origin") };
    for (const key of ["title", "description", "text", "socials", "careers", "organization"]) if (signals[key]) info[key] = signals[key];
    lead.load({ aiStatus: "gerando", dossier: null, outreach: null });
    $app.save(lead);
    const task = new Record($app.findCollectionByNameOrId("ai_tasks"));
    task.load({ type: "lead_dossier", profile: profile.id, ref: lead.id, status: "queued", payload: { lead: info, perfil: cvOf(profile), mente: menteOf($app, profile.id) }, attempts: 0 });
    $app.save(task);
    return e.json(200, { task: task.id });
  },
  $apis.requireSuperuserAuth(),
);

// e-mail frio vai pra fila "Prontas para enviar": revisão, teto diário e audit iguais aos da candidatura
routerAdd(
  "POST",
  "/api/radar/leads/{id}/email",
  (e) => {
    const lead = $app.findRecordById("leads", e.request.pathValue("id"));
    if (!lead.getString("email")) return e.json(400, { message: "Esse lead não tem e-mail." });
    const outreach = JSON.parse(lead.getString("outreach") || "{}") || {};
    const variant = (outreach.emails || [])[Math.max(0, parseInt(e.requestInfo().body.variant, 10) || 0)];
    if (!variant) return e.json(400, { message: "Gere a abordagem primeiro." });
    const message = new Record($app.findCollectionByNameOrId("messages"));
    message.load({ profile: lead.getString("profile"), lead: lead.id, channel: "email", to: lead.getString("email"), subject: String(variant.assunto ?? "").slice(0, 200), body: String(variant.corpo ?? "").slice(0, 8000), lang: String(outreach.idioma ?? "pt").slice(0, 10), status: "pronta" });
    $app.save(message);
    return e.json(200, { message: message.id });
  },
  $apis.requireSuperuserAuth(),
);

onRecordAfterUpdateSuccess((e) => {
  e.next();
  const task = e.record;
  const type = task.getString("type");
  const status = task.getString("status");
  if (!["lead_dossier", "outreach"].includes(type) || !["done", "failed"].includes(status)) return;
  const lead = $app.findRecordById("leads", task.getString("ref"));
  if (status === "failed") {
    lead.load({ aiStatus: "erro", [type === "lead_dossier" ? "dossier" : "outreach"]: { error: task.getString("error").slice(0, 300) } });
    $app.save(lead);
    return;
  }
  const result = JSON.parse(task.getString("result") || "{}") || {};
  if (type === "outreach") {
    lead.load({ outreach: result, aiStatus: "pronto" });
    $app.save(lead);
    return;
  }
  lead.set("dossier", result);
  $app.save(lead);
  const payload = JSON.parse(task.getString("payload") || "{}") || {};
  const next = new Record($app.findCollectionByNameOrId("ai_tasks"));
  next.load({ type: "outreach", profile: task.getString("profile"), ref: lead.id, status: "queued", payload: { ...payload, dossie: result }, attempts: 0 });
  $app.save(next);
}, "ai_tasks");

// varre o acervo atrás de empresas em sistemas de vagas abertos (roda uma vez; a ingestão já faz pras vagas novas)
routerAdd(
  "POST",
  "/api/radar/feeds/backfill",
  (e) => {
    const { findAts } = require(`${__hooks}/feeds.js`);
    const rows = arrayOf(new DynamicModel({ url: "", applyUrl: "", company: "" }));
    $app.db().newQuery("SELECT url, applyUrl, company FROM jobs WHERE url LIKE '%greenhouse%' OR url LIKE '%lever.co%' OR url LIKE '%ashbyhq%' OR url LIKE '%workable%' OR url LIKE '%smartrecruiters%' OR url LIKE '%recruitee%' OR url LIKE '%personio%' OR applyUrl LIKE '%greenhouse%' OR applyUrl LIKE '%lever.co%' OR applyUrl LIKE '%ashbyhq%' OR applyUrl LIKE '%workable%' OR applyUrl LIKE '%smartrecruiters%' OR applyUrl LIKE '%recruitee%' OR applyUrl LIKE '%personio%'").all(rows);
    const { discover } = require(`${__hooks}/feeds.js`);
    let created = 0;
    for (let i = 0; i < rows.length; i += 200) created += discover($app, rows.slice(i, i + 200));
    return e.json(200, { scanned: rows.length, created });
  },
  $apis.requireSuperuserAuth(),
);
