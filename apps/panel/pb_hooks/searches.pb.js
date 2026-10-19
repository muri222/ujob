/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/ujob/search",
  (e) => {
    const { normalizeQuery, searchKey } = require(`${__hooks}/search.js`);
    const { now } = require(`${__hooks}/jobs.js`);
    const body = e.requestInfo().body;
    const query = normalizeQuery(body);
    const key = searchKey(query);
    const profile = /^[a-z0-9]{15}$/.test(String(body.profile ?? "")) ? body.profile : "";
    const cacheMinutes = Math.max(15, parseInt($os.getenv("SEARCH_CACHE_MINUTES") || "180", 10));
    const fresh = new Date(Date.now() - cacheMinutes * 60000).toISOString().replace("T", " ");
    const cancelOthers = (keep) =>
      $app
        .db()
        .newQuery("UPDATE searches SET status = 'canceled', finishedAt = {:now} WHERE status IN ('queued', 'running') AND saved = 0 AND id != {:keep}")
        .bind({ now: now(), keep })
        .execute();

    let record;
    try {
      record = $app.findFirstRecordByFilter(
        "searches",
        "key = {:key} && profile = {:profile} && (status = 'queued' || status = 'running' || (status = 'done' && finishedAt >= {:fresh}))",
        { key, fresh, profile },
      );
      const stuck = record.getString("status") === "running" && record.getString("startedAt") < new Date(Date.now() - 6 * 60000).toISOString().replace("T", " ");
      if (stuck) record.load({ status: "queued", requestedAt: now(), progress: {} });
      if (body.saved) record.set("saved", true);
      if (stuck || body.saved) $app.save(record);
      cancelOthers(record.id);
      return e.json(200, { reused: true, search: record });
    } catch {}

    record = new Record($app.findCollectionByNameOrId("searches"));
    record.load({ ...query, key, profile, status: "queued", progress: {}, requestedAt: now(), saved: Boolean(body.saved), everyMinutes: 120, name: String(body.name ?? "").slice(0, 80), prompt: String(body.prompt ?? "").slice(0, 500) });
    $app.save(record);
    cancelOthers(record.id);
    return e.json(200, { reused: false, search: record });
  },
  $apis.requireSuperuserAuth(),
);

routerAdd(
  "GET",
  "/api/scout/searches/pending",
  (e) => {
    const row = new DynamicModel({ n: 0 });
    $app
      .db()
      .newQuery(
        `SELECT COUNT(*) AS n FROM searches WHERE status = 'queued' OR (saved = 1 AND status IN ('done', 'error')
           AND finishedAt <= strftime('%Y-%m-%d %H:%M:%fZ', 'now', '-' || COALESCE(NULLIF(everyMinutes, 0), 120) || ' minutes'))`,
      )
      .one(row);
    return e.json(200, { pending: row.n });
  },
  $apis.requireAuth("bots"),
);

routerAdd(
  "GET",
  "/api/scout/searches/next",
  (e) => {
    const { now } = require(`${__hooks}/jobs.js`);
    const { searchTerms, FILTERABLE, SEARCHABLE } = require(`${__hooks}/search.js`);

    $app
      .db()
      .newQuery(
        `UPDATE searches SET status = 'queued', requestedAt = strftime('%Y-%m-%d %H:%M:%fZ', 'now')
         WHERE saved = 1 AND status IN ('done', 'error')
           AND finishedAt <= strftime('%Y-%m-%d %H:%M:%fZ', 'now', '-' || COALESCE(NULLIF(everyMinutes, 0), 120) || ' minutes')`,
      )
      .execute();
    $app
      .db()
      .newQuery("UPDATE searches SET status = 'error' WHERE status = 'running' AND startedAt <= strftime('%Y-%m-%d %H:%M:%fZ', 'now', '-8 minutes')")
      .execute();

    let search = null;
    for (let attempt = 0; attempt < 5 && !search; attempt++) {
      let candidate;
      try {
        candidate = $app.findFirstRecordByFilter("searches", "status = 'queued'", {});
      } catch {
        break;
      }
      const claimed = $app
        .db()
        .newQuery("UPDATE searches SET status = 'running', startedAt = {:now}, progress = '{}', found = 0, created = 0 WHERE id = {:id} AND status = 'queued'")
        .bind({ id: candidate.id, now: now() })
        .execute()
        .rowsAffected();
      if (claimed) search = $app.findRecordById("searches", candidate.id);
    }
    if (!search) return e.json(200, { now: now(), search: null, sources: [] });

    const kinds = [...SEARCHABLE, ...FILTERABLE].map((kind) => `kind = '${kind}'`).join(" || ");
    const sources = $app
      .findRecordsByFilter("sources", `(${kinds}) && slug !~ 'gupy-estado-'`, "name", 0, 0)
      .filter((source) => ["gupy_search", "jsonld", "card_listing"].includes(source.getString("kind")) || source.getBool("active"));

    return e.json(200, {
      now: now(),
      search: { id: search.id, term: search.getString("term"), terms: searchTerms(search), state: search.getString("state"), city: search.getString("city"), category: search.getString("category") },
      sources: sources.map((source) => ({
        id: source.id,
        slug: source.getString("slug"),
        name: source.getString("name"),
        kind: source.getString("kind"),
        group: source.getString("group"),
        target: source.getString("target"),
        site: source.getString("site"),
        logoUrl: source.getString("logoUrl"),
        config: source.get("config") || {},
        filtered: FILTERABLE.includes(source.getString("kind")),
      })),
    });
  },
  $apis.requireAuth("bots"),
);

routerAdd(
  "POST",
  "/api/scout/searches/{id}/progress",
  (e) => {
    const body = e.requestInfo().body;
    const search = $app.findRecordById("searches", e.request.pathValue("id"));
    if (search.getString("status") === "canceled") return e.json(200, { canceled: true });
    const progress = JSON.parse(search.getString("progress") || "{}") || {};
    for (const [source, state] of Object.entries(body.sources || {})) {
      if (!/^[a-z0-9]{15}$/.test(source)) continue;
      progress[source] = { status: ["waiting", "running", "done", "error"].includes(state.status) ? state.status : "running", found: Math.max(0, state.found | 0) };
    }
    const found = Object.values(progress).reduce((sum, state) => sum + (Number(state.found) || 0), 0);
    search.load({ progress, found, created: Math.max(search.getInt("created"), body.created | 0) });
    if (body.finished) {
      const { now } = require(`${__hooks}/jobs.js`);
      search.load({ status: body.failed ? "error" : "done", finishedAt: now() });
    }
    $app.save(search);
    return e.json(200, { found });
  },
  $apis.requireAuth("bots"),
);
