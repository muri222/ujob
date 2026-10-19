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
    try {
      const apify = $app.findFirstRecordByFilter("integrations", "kind = 'apify'", {});
      return e.json(200, { apify: { connected: true, verifiedAt: apify.getString("verifiedAt") } });
    } catch {
      return e.json(200, { apify: { connected: false } });
    }
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
    const source = ["osm", "apify", "claude"].includes(body.source) ? body.source : "osm";
    const state = /^[A-Z]{2}$/.test(body.state) ? body.state : "";
    const city = String(body.city ?? "").trim().slice(0, 80);
    const limit = Math.min(source === "claude" ? 30 : 200, Math.max(1, parseInt(body.limit, 10) || 30));
    if (source === "osm" && !state) return e.json(400, { message: "No OpenStreetMap, escolha pelo menos o estado." });
    if (source === "apify") {
      try {
        $app.findFirstRecordByFilter("integrations", "kind = 'apify'", {});
      } catch {
        return e.json(400, { message: "Conecte sua conta da Apify em Configurações." });
      }
    }
    const campaign = new Record($app.findCollectionByNameOrId("campaigns"));
    campaign.load({ profile: profile.id, pack: pack.id, name: `${pack.getString("name")} · ${city || state || "Brasil"}`, state, city, source, limit, status: "buscando", found: 0 });
    $app.save(campaign);
    const task = new Record($app.findCollectionByNameOrId("ai_tasks"));
    task.load({
      type: source === "claude" ? "leads_discover_claude" : "leads_discover",
      profile: profile.id,
      ref: campaign.id,
      status: "queued",
      payload: { source, state, city, limit, pack: pack.getString("name"), description: pack.getString("description"), osm: JSON.parse(pack.getString("osm") || "[]"), searches: JSON.parse(pack.getString("searches") || "[]") },
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
      lead.load({ signals: result, status: "enriquecido" });
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
  const digits = (phone) => String(phone || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").slice(0, 30);
  const handle = (value) => String(value || "").toLowerCase().replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/^@/, "").split(/[/?#]/)[0].slice(0, 80);
  const seen = (field, value) => value && $app.countRecords("leads", $dbx.exp(`profile = {:p} AND ${field} = {:v}`, { p: profileId, v: value })) > 0;
  let created = 0;
  for (const place of (result.places || []).slice(0, campaign.getInt("limit") || 200)) {
    const name = String(place.name ?? "").trim().slice(0, 160);
    const website = /^https?:\/\/[^\s"<>]+$/i.test(place.website || "") ? place.website : "";
    const domain = domainOf(website);
    const phone = digits(place.phone);
    const instagram = handle(place.instagram);
    if (!name || seen("domain", domain) || seen("phone", phone) || seen("instagram", instagram)) continue;
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
      state: /^[A-Z]{2}$/.test(place.state) ? place.state : campaign.getString("state"),
      address: String(place.address ?? "").slice(0, 240),
      origin: String(place.origin ?? campaign.getString("source")).slice(0, 160),
      externalId: String(place.externalId ?? "").slice(0, 120),
      status: website ? "enriquecendo" : "sem_site",
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
