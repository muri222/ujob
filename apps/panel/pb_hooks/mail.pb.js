/// <reference path="../pb_data/types.d.ts" />

// e-mail de envio: detectar servidor, salvar conta (senha cifrada) e testar conexão

routerAdd(
  "GET",
  "/api/radar/mail/detect",
  (e) => {
    const found = require(`${__hooks}/mail.js`).detect(String(e.request.url.query().get("email") ?? ""));
    return found ? e.json(200, found) : e.json(400, { message: "E-mail inválido." });
  },
  $apis.requireSuperuserAuth(),
);

routerAdd(
  "POST",
  "/api/radar/mail/account",
  (e) => {
    const { encrypt } = require(`${__hooks}/mail.js`);
    const body = e.requestInfo().body;
    const profile = $app.findRecordById("profile", String(body.profile ?? ""));
    let account;
    try {
      account = $app.findFirstRecordByFilter("mail_accounts", "profile = {:profile}", { profile: profile.id });
    } catch {
      account = new Record($app.findCollectionByNameOrId("mail_accounts"));
      account.set("profile", profile.id);
    }
    const host = (value) => String(value ?? "").trim().toLowerCase().slice(0, 120);
    const port = (value, fallback) => Math.min(65535, Math.max(1, parseInt(value, 10) || fallback));
    account.load({
      email: String(body.email ?? "").trim().toLowerCase(),
      name: String(body.name ?? "").trim().slice(0, 80),
      smtpHost: host(body.smtpHost),
      smtpPort: port(body.smtpPort, 587),
      imapHost: host(body.imapHost),
      imapPort: port(body.imapPort, 993),
      verifiedAt: "",
      lastError: "",
    });
    const password = String(body.password ?? "").replace(/\s+/g, "");
    if (password) account.set("secret", encrypt(password));
    if (!account.getString("secret")) return e.json(400, { message: "Falta a senha de app." });
    $app.save(account);

    const task = new Record($app.findCollectionByNameOrId("ai_tasks"));
    task.load({ type: "mail_test", profile: profile.id, ref: account.id, status: "queued", payload: {}, attempts: 0 });
    $app.save(task);
    return e.json(200, { account: { id: account.id, email: account.getString("email") }, task: task.id });
  },
  $apis.requireSuperuserAuth(),
);

// candidatura: uma chamada ao Claude gera carta + CV adaptado; vira mensagem pra revisar
routerAdd(
  "POST",
  "/api/radar/apply/prepare",
  (e) => {
    const { cvOf, vagaOf, menteOf } = require(`${__hooks}/payload.js`);
    const body = e.requestInfo().body;
    const profile = $app.findRecordById("profile", String(body.profile ?? ""));
    const job = $app.findRecordById("jobs", String(body.job ?? ""));
    try {
      const open = $app.findFirstRecordByFilter("messages", "profile = {:p} && job = {:j} && (status = 'gerando' || status = 'pronta' || status = 'enviando')", { p: profile.id, j: job.id });
      return e.json(200, { message: open.id, reused: true });
    } catch {}

    const to = job.getString("contactEmail");
    const message = new Record($app.findCollectionByNameOrId("messages"));
    message.load({ profile: profile.id, job: job.id, channel: to ? "email" : "manual", to, status: "gerando" });
    $app.save(message);
    const task = new Record($app.findCollectionByNameOrId("ai_tasks"));
    task.load({ type: "apply_kit", profile: profile.id, ref: message.id, status: "queued", payload: { vaga: vagaOf(job), cv: cvOf(profile), mente: menteOf($app, profile.id) }, attempts: 0 });
    $app.save(task);
    return e.json(200, { message: message.id, reused: false });
  },
  $apis.requireSuperuserAuth(),
);

// envio: só por clique (modo Revisão), respeitando o teto diário do perfil
routerAdd(
  "POST",
  "/api/radar/messages/{id}/send",
  (e) => {
    const message = $app.findRecordById("messages", e.request.pathValue("id"));
    if (message.getString("status") !== "pronta" || message.getString("channel") !== "email") return e.json(409, { message: "Essa mensagem não está pronta pra envio." });
    const profile = $app.findRecordById("profile", message.getString("profile"));
    let account;
    try {
      account = $app.findFirstRecordByFilter("mail_accounts", "profile = {:p}", { p: profile.id });
    } catch {
      return e.json(400, { message: "Configure o e-mail de envio primeiro." });
    }
    if (!account.getString("verifiedAt")) return e.json(400, { message: "Teste a conexão do e-mail antes de enviar." });

    const cap = profile.getInt("dailyCap") || 10;
    const since = new Date(Date.now() - 864e5).toISOString().replace("T", " ");
    const sent = $app.countRecords("messages", $dbx.exp("profile = {:p} AND status = 'enviada' AND sentAt >= {:since}", { p: profile.id, since }));
    if (sent >= cap) return e.json(429, { message: `Teto de ${cap} envios em 24h atingido. Ajuste no perfil se quiser mais.` });

    const body = e.requestInfo().body;
    message.load({
      subject: String(body.subject ?? message.getString("subject")).slice(0, 200),
      body: String(body.body ?? message.getString("body")).slice(0, 8000),
      status: "enviando",
      error: "",
    });
    $app.save(message);
    const job = message.getString("job") ? $app.findRecordById("jobs", message.getString("job")) : null;
    const task = new Record($app.findCollectionByNameOrId("ai_tasks"));
    task.load({
      type: "mail_send",
      profile: profile.id,
      ref: message.id,
      status: "queued",
      payload: { to: message.getString("to"), subject: message.getString("subject"), body: message.getString("body"), cv: message.get("cv"), lang: message.getString("lang"), company: job ? job.getString("company") : "" },
      attempts: 0,
    });
    $app.save(task);
    require(`${__hooks}/mail_audit.js`)($app, profile.id, "envio_pedido", message.getString("to"), { message: message.id, sentToday: sent + 1, cap });
    return e.json(200, { ok: true, sentToday: sent + 1, cap });
  },
  $apis.requireSuperuserAuth(),
);

// resultados das tarefas de e-mail/candidatura
onRecordAfterUpdateSuccess((e) => {
  e.next();
  const task = e.record;
  const type = task.getString("type");
  const status = task.getString("status");
  if (!["apply_kit", "mail_send", "mail_test"].includes(type) || !["done", "failed"].includes(status)) return;
  const result = JSON.parse(task.getString("result") || "null") || {};
  const error = task.getString("error");
  const now = new Date().toISOString().replace("T", " ");
  const audit = require(`${__hooks}/mail_audit.js`);

  if (type === "mail_test") {
    const account = $app.findRecordById("mail_accounts", task.getString("ref"));
    account.load(status === "done" ? { verifiedAt: now, lastError: "" } : { verifiedAt: "", lastError: error.slice(0, 500) });
    $app.save(account);
    return;
  }

  const message = $app.findRecordById("messages", task.getString("ref"));
  if (type === "apply_kit") {
    message.load(status === "done" ? { subject: String(result.assunto ?? "").slice(0, 200), body: String(result.carta ?? "").slice(0, 8000), lang: String(result.idioma ?? "").slice(0, 10), cv: result.cv ?? null, status: "pronta" } : { status: "erro", error: error.slice(0, 1000) });
    $app.save(message);
    return;
  }

  // mail_send
  const profileId = message.getString("profile");
  if (status === "failed") {
    message.load({ status: "erro", error: error.slice(0, 1000) });
    $app.save(message);
    audit($app, profileId, "email_falhou", message.getString("to"), { message: message.id, error: error.slice(0, 300) });
    return;
  }
  message.load({ status: "enviada", sentAt: now, error: "" });
  $app.save(message);
  audit($app, profileId, "email_enviado", message.getString("to"), { message: message.id, subject: message.getString("subject") });

  // funil: a vaga vai pra "Candidatei" com a carta guardada
  const jobId = message.getString("job");
  if (!jobId) return;
  const job = $app.findRecordById("jobs", jobId);
  let application;
  try {
    application = $app.findFirstRecordByFilter("applications", "profile = {:p} && job = {:j}", { p: profileId, j: jobId });
  } catch {
    application = new Record($app.findCollectionByNameOrId("applications"));
    application.load({ profile: profileId, job: jobId, title: job.getString("title"), company: job.getString("company"), companyLogo: job.getString("companyLogo"), url: job.getString("applyUrl") || job.getString("url"), position: Date.now() / 1000, contactEmail: message.getString("to") });
  }
  application.load({ stage: "aplicada", appliedAt: now, letter: message.getString("body").slice(0, 4000) });
  $app.save(application);
}, "ai_tasks");

// a senha cifrada nunca sai na API, nem pro próprio app (superusuário enxerga campo oculto,
// então zera só na cópia da resposta; o registro salvo não muda)
onRecordEnrich((e) => {
  e.record.set("secret", "");
  e.record.hide("secret");
  e.next();
}, "mail_accounts");
