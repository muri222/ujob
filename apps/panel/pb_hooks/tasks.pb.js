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

    // o worker diz quais tipos sabe fazer agora (sem Claude, só os de e-mail)
    const types = String(e.request.url.query().get("types") ?? "")
      .split(",")
      .filter((type) => /^[a-z_]{1,40}$/.test(type))
      .slice(0, 20);
    if (!types.length) return e.json(200, { task: null });
    const params = Object.fromEntries(types.map((type, i) => [`t${i}`, type]));
    const filter = `status = 'queued' && (${types.map((_, i) => `type = {:t${i}}`).join(" || ")})`;

    for (let attempt = 0; attempt < 5; attempt++) {
      let candidate;
      try {
        candidate = $app.findFirstRecordByFilter("ai_tasks", filter, params);
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
      const out = { id: task.id, type: task.getString("type"), profile: task.getString("profile"), ref: task.getString("ref"), payload: JSON.parse(task.getString("payload") || "{}") || {}, attempts: task.getInt("attempts") };
      // senha do e-mail: descriptografada só na resposta, nunca gravada na tarefa
      if (out.type.startsWith("mail_")) {
        try {
          out.mail = require(`${__hooks}/mail.js`).credentials($app, out.profile);
        } catch (error) {
          task.load({ status: "failed", error: "Configure o e-mail de envio primeiro." });
          $app.save(task);
          continue;
        }
      }
      if (out.type === "leads_discover" && out.payload.source === "apify") {
        try {
          const apify = $app.findFirstRecordByFilter("integrations", "kind = 'apify'", {});
          out.apifyToken = $security.decrypt(apify.getString("secret"), $os.getenv("RADAR_SECRET"));
        } catch {
          task.load({ status: "failed", error: "Conecte sua conta da Apify em Configurações." });
          $app.save(task);
          continue;
        }
      }
      return e.json(200, { task: out });
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

// brain avisa se o Claude Code do PC está pronto; a tela lê pra mostrar aviso
routerAdd(
  "POST",
  "/api/radar/brain/status",
  (e) => {
    const problem = e.requestInfo().body.problem;
    $app.store().set("radar:brain", { problem: problem ? String(problem).slice(0, 200) : null, at: new Date().toISOString() });
    return e.json(200, { ok: true });
  },
  $apis.requireAuth("bots"),
);

routerAdd(
  "GET",
  "/api/radar/brain",
  (e) => e.json(200, $app.store().get("radar:brain") || { problem: null, at: null }),
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
    const { cvOf, vagaOf, menteOf } = require(`${__hooks}/payload.js`);
    const cv = cvOf(profile);
    const mente = menteOf($app, profile.id);
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
      const vaga = vagaOf(job);
      const task = new Record(collection);
      task.load({ type: "job_fit", ref: id, profile: profile.id, status: "queued", payload: { vaga, cv, mente }, attempts: 0 });
      $app.save(task);
      created++;
    }
    return e.json(200, { created });
  },
  $apis.requireSuperuserAuth(),
);
