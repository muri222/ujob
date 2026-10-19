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
    const { encrypt, accountFor } = require(`${__hooks}/mail.js`);
    const body = e.requestInfo().body;
    const profile = $app.findRecordById("profile", String(body.profile ?? ""));
    let account = accountFor($app, profile.id);
    if (!account) {
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
    const body = e.requestInfo().body;
    const profile = $app.findRecordById("profile", String(body.profile ?? ""));
    const job = $app.findRecordById("jobs", String(body.job ?? ""));
    const { message, reused } = require(`${__hooks}/apply.js`).prepare($app, profile, job);
    return e.json(200, { message: message.id, reused });
  },
  $apis.requireSuperuserAuth(),
);

// envio por clique (Revisão/Híbrido), respeitando o teto diário do perfil
routerAdd(
  "POST",
  "/api/radar/messages/{id}/send",
  (e) => {
    const message = $app.findRecordById("messages", e.request.pathValue("id"));
    const body = e.requestInfo().body;
    const result = require(`${__hooks}/apply.js`).send($app, message, { subject: body.subject, body: body.body });
    return result.ok ? e.json(200, result) : e.json(result.status, { message: result.error });
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
    message.load(status === "done" ? { subject: String(result.assunto ?? "").slice(0, 200), body: String(result.carta ?? "").slice(0, 8000), followup: String(result.followup ?? "").slice(0, 4000), lang: String(result.idioma ?? "").slice(0, 10), cv: result.cv ?? null, status: "pronta" } : { status: "erro", error: error.slice(0, 1000) });
    $app.save(message);
    // Auto Apply no modo Automático: carta pronta sai sozinha, dentro do teto e com audit
    const payload = JSON.parse(task.getString("payload") || "{}") || {};
    if (status === "done" && payload.auto && message.getString("channel") === "email" && $app.findRecordById("profile", message.getString("profile")).getString("sendMode") === "auto") {
      const sent = require(`${__hooks}/apply.js`).send($app, message, { auto: true });
      if (!sent.ok) {
        message.set("error", `Envio automático não saiu: ${sent.error}`);
        $app.save(message);
      }
    }
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

  // e-mail frio: o lead vira "contatado"
  const leadId = message.getString("lead");
  if (leadId) {
    const lead = $app.findRecordById("leads", leadId);
    lead.set("status", "contatado");
    $app.save(lead);
    return;
  }

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

// Kit avulso: cola a descrição de qualquer vaga (LinkedIn, site...) e o Claude faz carta, CV adaptado e follow-up
routerAdd(
  "POST",
  "/api/radar/kit",
  (e) => {
    const { cvOf, menteOf } = require(`${__hooks}/payload.js`);
    const body = e.requestInfo().body;
    const profile = $app.findRecordById("profile", String(body.profile ?? ""));
    const text = String(body.text ?? "").trim().slice(0, 12000);
    if (text.length < 80) return e.json(400, { message: "Cole a descrição da vaga (pelo menos umas linhas)." });
    const to = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.to ?? "").trim()) ? String(body.to).trim().toLowerCase() : "";
    const message = new Record($app.findCollectionByNameOrId("messages"));
    message.load({ profile: profile.id, channel: to ? "email" : "manual", to, status: "gerando", kit: true, title: String(body.title ?? "").slice(0, 200), company: String(body.company ?? "").slice(0, 160) });
    $app.save(message);
    const task = new Record($app.findCollectionByNameOrId("ai_tasks"));
    task.load({ type: "apply_kit", profile: profile.id, ref: message.id, status: "queued", payload: { vaga: { title: message.getString("title"), company: message.getString("company"), description: text }, cv: cvOf(profile), mente: menteOf($app, profile.id) }, attempts: 0 });
    $app.save(task);
    return e.json(200, { message: message.id });
  },
  $apis.requireSuperuserAuth(),
);
