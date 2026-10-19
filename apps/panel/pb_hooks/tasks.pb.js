/// <reference path="../pb_data/types.d.ts" />

// fila de IA: o brain pega a próxima tarefa e devolve o resultado

routerAdd(
  "GET",
  "/api/radar/tasks/next",
  (e) => {
    const { now } = require(`${__hooks}/jobs.js`);
    $app
      .db()
      .newQuery("UPDATE ai_tasks SET status = 'queued' WHERE status = 'running' AND startedAt <= strftime('%Y-%m-%d %H:%M:%fZ', 'now', '-15 minutes') AND attempts < 3")
      .execute();
    $app
      .db()
      .newQuery("UPDATE ai_tasks SET status = 'failed', error = 'travou 3 vezes' WHERE status = 'running' AND startedAt <= strftime('%Y-%m-%d %H:%M:%fZ', 'now', '-15 minutes')")
      .execute();

    for (let attempt = 0; attempt < 5; attempt++) {
      let candidate;
      try {
        candidate = $app.findFirstRecordByFilter("ai_tasks", "status = 'queued'", {});
      } catch {
        break;
      }
      const claimed = $app
        .db()
        .newQuery("UPDATE ai_tasks SET status = 'running', startedAt = {:now}, attempts = attempts + 1 WHERE id = {:id} AND status = 'queued'")
        .bind({ id: candidate.id, now: now() })
        .execute()
        .rowsAffected();
      if (!claimed) continue;
      // salva pelo app (não SQL cru) para o realtime avisar a tela
      const task = $app.findRecordById("ai_tasks", candidate.id);
      $app.save(task);
      return e.json(200, {
        task: { id: task.id, type: task.getString("type"), profile: task.getString("profile"), ref: task.getString("ref"), payload: task.get("payload") || {}, attempts: task.getInt("attempts") },
      });
    }
    return e.json(200, { task: null });
  },
  $apis.requireAuth("bots"),
);

routerAdd(
  "POST",
  "/api/radar/tasks/{id}/result",
  (e) => {
    const { now } = require(`${__hooks}/jobs.js`);
    const body = e.requestInfo().body;
    const task = $app.findRecordById("ai_tasks", e.request.pathValue("id"));
    if (task.getString("status") !== "running") return e.json(409, { message: "Tarefa não está rodando." });

    const error = String(body.error ?? "").slice(0, 2000);
    task.load({ status: error ? "failed" : "done", result: error ? null : body.result ?? null, error, finishedAt: now() });
    $app.save(task);

    for (const entry of (Array.isArray(body.log) ? body.log : []).slice(0, 5)) {
      const row = new Record($app.findCollectionByNameOrId("ai_log"));
      row.load({
        task: task.id,
        provider: String(entry.provider ?? "").slice(0, 40),
        model: String(entry.model ?? "").slice(0, 80),
        tokensIn: Math.max(0, entry.tokensIn | 0),
        tokensOut: Math.max(0, entry.tokensOut | 0),
        cost: Math.max(0, Number(entry.cost) || 0),
        latencyMs: Math.max(0, entry.latencyMs | 0),
        ok: Boolean(entry.ok),
        error: String(entry.error ?? "").slice(0, 2000),
      });
      $app.save(row);
    }
    return e.json(200, { status: task.getString("status") });
  },
  $apis.requireAuth("bots"),
);

// brain avisa quais provedores estão prontos; a tela lê pra mostrar aviso
routerAdd(
  "POST",
  "/api/radar/brain/status",
  (e) => {
    const providers = {};
    for (const [name, problem] of Object.entries(e.requestInfo().body.providers || {}).slice(0, 10)) {
      if (/^[a-z]{1,20}$/.test(name)) providers[name] = problem ? String(problem).slice(0, 200) : null;
    }
    $app.store().set("radar:brain", { providers, at: new Date().toISOString() });
    return e.json(200, { ok: true });
  },
  $apis.requireAuth("bots"),
);

routerAdd(
  "GET",
  "/api/radar/brain",
  (e) => e.json(200, $app.store().get("radar:brain") || { providers: {}, at: null }),
  $apis.requireSuperuserAuth(),
);

// pede a nota da IA para vagas de um perfil; monta o payload aqui e não repete vaga já avaliada
routerAdd(
  "POST",
  "/api/radar/fit",
  (e) => {
    const body = e.requestInfo().body;
    const profile = $app.findRecordById("profile", String(body.profile ?? ""));
    const ids = (Array.isArray(body.jobs) ? body.jobs : []).filter((id) => /^[a-z0-9]{15}$/.test(id)).slice(0, 50);
    const plain = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const cv = {};
    for (const field of ["name", "headline", "about", "skills", "experiences", "education", "languages", "seniority", "city", "state", "workplace", "salary", "categories", "countries", "portfolio"]) {
      cv[field] = profile.get(field);
    }
    const collection = $app.findCollectionByNameOrId("ai_tasks");
    let created = 0;
    for (const id of ids) {
      try {
        // nota feita antes da última edição do perfil não vale mais
        $app.findFirstRecordByFilter("ai_tasks", "type = 'job_fit' && ref = {:id} && profile = {:profile} && status != 'failed' && createdAt >= {:since}", {
          id,
          profile: profile.id,
          since: profile.getString("updated"),
        });
        continue;
      } catch {}
      let job;
      try {
        job = $app.findRecordById("jobs", id);
      } catch {
        continue;
      }
      const vaga = {};
      for (const field of ["title", "company", "city", "state", "country", "workplace", "contract", "seniority", "category", "salaryMin", "salaryMax", "tags"]) vaga[field] = job.get(field);
      vaga.description = plain(job.getString("description") || job.getString("summary")).slice(0, 8000);
      const task = new Record(collection);
      task.load({ type: "job_fit", ref: id, profile: profile.id, status: "queued", payload: { vaga, cv }, attempts: 0 });
      $app.save(task);
      created++;
    }
    return e.json(200, { created });
  },
  $apis.requireSuperuserAuth(),
);
