/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/scout/sources/sync",
  (e) => {
    const CATALOG_FIELDS = ["name", "kind", "group", "target", "config", "site", "logoUrl", "intervalMinutes"];
    const { sources = [] } = e.requestInfo().body;
    const result = { created: 0, updated: 0 };

    $app.runInTransaction((app) => {
      const collection = app.findCollectionByNameOrId("sources");
      for (const entry of sources.slice(0, 5000)) {
        if (!/^[a-z0-9-]{1,80}$/.test(entry.slug ?? "")) continue;
        let record;
        try {
          record = app.findFirstRecordByData("sources", "slug", entry.slug);
          result.updated++;
        } catch {
          record = new Record(collection);
          record.load({ slug: entry.slug, active: entry.active !== false });
          result.created++;
        }
        for (const field of CATALOG_FIELDS) if (entry[field] !== undefined) record.set(field, entry[field]);
        app.save(record);
      }
    });
    return e.json(200, result);
  },
  $apis.requireAuth("bots"),
);

routerAdd(
  "GET",
  "/api/scout/sources/due",
  (e) => {
    const rows = arrayOf(new DynamicModel({ id: "", slug: "", name: "", kind: "", group: "", target: "", config: "", site: "", logoUrl: "" }));
    const slugs = String(e.request.url.query().get("slugs") ?? "")
      .split(",")
      .filter((slug) => /^[a-z0-9-]{1,80}$/.test(slug))
      .slice(0, 200);
    const columns = 'SELECT id, slug, name, kind, "group", target, config, site, logoUrl FROM sources';

    if (slugs.length) {
      const params = Object.fromEntries(slugs.map((slug, i) => [`s${i}`, slug]));
      $app
        .db()
        .newQuery(`${columns} WHERE slug IN (${slugs.map((_, i) => `{:s${i}}`).join(",")})`)
        .bind(params)
        .all(rows);
    } else {
      $app
        .db()
        .newQuery(
          `${columns}
           WHERE active = 1 AND kind NOT LIKE 'apify_%' AND (runRequested = 1 OR lastRunAt = ''
             OR lastRunAt <= strftime('%Y-%m-%d %H:%M:%fZ', 'now', '-' || COALESCE(NULLIF(intervalMinutes, 0), 360) || ' minutes'))
           ORDER BY runRequested DESC, lastRunAt ASC`,
        )
        .all(rows);
    }
    const { now } = require(`${__hooks}/jobs.js`);
    const { inject } = require(`${__hooks}/feeds.js`);
    return e.json(200, { now: now(), sources: inject($app, rows.map((row) => ({ ...row, config: row.config ? JSON.parse(row.config) : {} }))) });
  },
  $apis.requireAuth("bots"),
);

routerAdd(
  "POST",
  "/api/scout/known",
  (e) => {
    const { knownHashes, searchFor } = require(`${__hooks}/jobs.js`);
    const { hashes = [], search = "" } = e.requestInfo().body;
    return e.json(200, { known: knownHashes(hashes, searchFor(search)) });
  },
  $apis.requireAuth("bots"),
);

routerAdd(
  "POST",
  "/api/scout/ingest",
  (e) => {
    const { ingest, searchFor } = require(`${__hooks}/jobs.js`);
    const { source, jobs = [], search = "" } = e.requestInfo().body;
    $app.findRecordById("sources", source);
    return e.json(200, ingest(source, jobs.slice(0, 500), searchFor(search)));
  },
  $apis.requireAuth("bots"),
);

routerAdd(
  "POST",
  "/api/scout/runs",
  (e) => {
    const { now } = require(`${__hooks}/jobs.js`);
    const body = e.requestInfo().body;
    const source = $app.findRecordById("sources", body.source);
    const status = ["ok", "empty", "error"].includes(body.status) ? body.status : "error";
    const startedAt = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.startedAt ?? "") ? body.startedAt : now();
    const finishedAt = now();
    let closed = 0;

    if (!body.search && body.complete && status === "ok" && body.found > 0) {
      closed = $app
        .db()
        .newQuery("UPDATE jobs SET status = 'closed', closedAt = {:now} WHERE source = {:source} AND status = 'open' AND lastSeenAt < {:started}")
        .bind({ now: finishedAt, source: source.id, started: startedAt })
        .execute()
        .rowsAffected();
    }

    const run = new Record($app.findCollectionByNameOrId("runs"));
    run.load({
      source: source.id,
      startedAt,
      finishedAt,
      status,
      found: Math.max(0, body.found | 0),
      created: Math.max(0, body.created | 0),
      updated: Math.max(0, body.updated | 0),
      closed,
      error: String(body.error ?? "").slice(0, 500),
      search: /^[a-z0-9]{15}$/.test(body.search ?? "") ? body.search : "",
    });
    $app.save(run);
    if (body.search) return e.json(200, { closed });

    source.load({ lastRunAt: finishedAt, lastStatus: status, lastError: run.getString("error"), lastFound: run.getInt("found"), runRequested: false });
    $app.save(source);
    return e.json(200, { closed });
  },
  $apis.requireAuth("bots"),
);
