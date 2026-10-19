/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "GET",
  "/api/ujob/stats",
  (e) => {
    const count = (sql, params = {}) => {
      const row = new DynamicModel({ n: 0 });
      $app.db().newQuery(sql).bind(params).one(row);
      return row.n;
    };
    const groups = (sql, params = {}) => {
      const rows = arrayOf(new DynamicModel({ k: "", n: 0 }));
      $app.db().newQuery(sql).bind(params).all(rows);
      return rows.map(({ k, n }) => ({ key: k, total: n }));
    };
    const since = (days) => new Date(Date.now() - days * 864e5).toISOString().replace("T", " ");
    const open = "FROM jobs WHERE status = 'open'";

    const companies = arrayOf(new DynamicModel({ name: "", logo: "", n: 0 }));
    $app
      .db()
      .newQuery(`SELECT company AS name, MAX(companyLogo) AS logo, COUNT(*) AS n ${open} AND company != '' GROUP BY company ORDER BY n DESC LIMIT 12`)
      .all(companies);

    return e.json(200, {
      open: count(`SELECT COUNT(*) AS n ${open}`),
      fresh: count("SELECT COUNT(*) AS n FROM jobs WHERE firstSeenAt >= {:since}", { since: since(1) }),
      closedWeek: count("SELECT COUNT(*) AS n FROM jobs WHERE status = 'closed' AND closedAt >= {:since}", { since: since(7) }),
      withSalary: count(`SELECT COUNT(*) AS n ${open} AND salaryMin > 0`),
      remote: count(`SELECT COUNT(*) AS n ${open} AND workplace = 'remoto'`),
      companies: count(`SELECT COUNT(DISTINCT company) AS n ${open} AND company != ''`),
      sources: count("SELECT COUNT(*) AS n FROM sources WHERE active = 1"),
      failing: count("SELECT COUNT(*) AS n FROM sources WHERE active = 1 AND lastStatus = 'error'"),
      honeypot: count("SELECT COUNT(*) AS n FROM honeypot_hits WHERE created >= {:since}", { since: since(1) }),
      opened: groups("SELECT substr(firstSeenAt, 1, 10) AS k, COUNT(*) AS n FROM jobs WHERE firstSeenAt >= {:since} GROUP BY k ORDER BY k", { since: since(14) }),
      closed: groups("SELECT substr(closedAt, 1, 10) AS k, COUNT(*) AS n FROM jobs WHERE closedAt >= {:since} GROUP BY k ORDER BY k", { since: since(14) }),
      category: groups(`SELECT category AS k, COUNT(*) AS n ${open} GROUP BY category ORDER BY n DESC`),
      workplace: groups(`SELECT workplace AS k, COUNT(*) AS n ${open} GROUP BY workplace ORDER BY n DESC`),
      contract: groups(`SELECT contract AS k, COUNT(*) AS n ${open} GROUP BY contract ORDER BY n DESC`),
      seniority: groups(`SELECT seniority AS k, COUNT(*) AS n ${open} GROUP BY seniority ORDER BY n DESC`),
      state: groups(`SELECT state AS k, COUNT(*) AS n ${open} AND state != '' GROUP BY state ORDER BY n DESC`),
      group: groups(`SELECT s."group" AS k, COUNT(*) AS n FROM jobs j JOIN sources s ON s.id = j.source WHERE j.status = 'open' GROUP BY s."group" ORDER BY n DESC`),
      stage: groups("SELECT stage AS k, COUNT(*) AS n FROM applications WHERE profile = {:profile} GROUP BY stage", { profile: String(e.request.url.query().get("profile") ?? "") }),
      topCompanies: companies.map(({ name, logo, n }) => ({ name, logo, total: n })),
    });
  },
  $apis.requireSuperuserAuth(),
);

routerAdd(
  "GET",
  "/api/ujob/companies",
  (e) => {
    const query = String(e.request.url.query().get("q") ?? "").trim().slice(0, 60);
    const page = Math.max(1, parseInt(e.request.url.query().get("page") ?? "1", 10) || 1);
    const perPage = 48;
    const rows = arrayOf(new DynamicModel({ name: "", logo: "", n: 0, remote: 0, latest: "", sources: 0 }));
    $app
      .db()
      .newQuery(
        `SELECT company AS name, MAX(companyLogo) AS logo, COUNT(*) AS n,
                SUM(workplace = 'remoto') AS remote, MAX(firstSeenAt) AS latest, COUNT(DISTINCT source) AS sources
         FROM jobs WHERE status = 'open' AND company != '' AND company LIKE {:like} ESCAPE '\\'
         GROUP BY company ORDER BY n DESC, name LIMIT {:limit} OFFSET {:offset}`,
      )
      .bind({ like: `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`, limit: perPage + 1, offset: (page - 1) * perPage })
      .all(rows);
    return e.json(200, {
      page,
      more: rows.length > perPage,
      items: rows.slice(0, perPage).map(({ name, logo, n, remote, latest, sources }) => ({ name, logo, total: n, remote, latest, sources })),
    });
  },
  $apis.requireSuperuserAuth(),
);

routerAdd(
  "POST",
  "/api/ujob/jobs/{id}/enrich",
  (e) => {
    const { enrich } = require(`${__hooks}/detail.js`);
    const record = $app.findRecordById("jobs", e.request.pathValue("id"));
    try {
      const structured = enrich(record);
      return e.json(200, { structured, job: record });
    } catch (error) {
      return e.json(502, { message: String(error?.message ?? error).slice(0, 200) });
    }
  },
  $apis.requireSuperuserAuth(),
);

routerAdd(
  "GET",
  "/api/ujob/cities",
  (e) => {
    const state = String(e.request.url.query().get("state") ?? "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(state)) return e.json(400, { message: "Estado inválido." });
    const rows = arrayOf(new DynamicModel({ k: "", n: 0 }));
    $app
      .db()
      .newQuery("SELECT city AS k, COUNT(*) AS n FROM jobs WHERE status = 'open' AND state = {:state} AND city != '' GROUP BY city ORDER BY n DESC LIMIT 60")
      .bind({ state })
      .all(rows);
    return e.json(200, rows.map(({ k, n }) => ({ key: k, total: n })));
  },
  $apis.requireSuperuserAuth(),
);
