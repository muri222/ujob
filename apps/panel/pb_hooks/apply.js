/// <reference path="../pb_data/types.d.ts" />

// preparar e enviar candidatura: usado pelo clique (modo Revisão) e pelo Auto Apply (Híbrido/Automático)

function prepare(app, profile, job, { auto = false } = {}) {
  const { cvOf, vagaOf, menteOf } = require(`${__hooks}/payload.js`);
  try {
    const open = app.findFirstRecordByFilter("messages", "profile = {:p} && job = {:j} && (status = 'gerando' || status = 'pronta' || status = 'enviando' || status = 'enviada')", { p: profile.id, j: job.id });
    return { message: open, reused: true };
  } catch {}
  const to = job.getString("contactEmail");
  const message = new Record(app.findCollectionByNameOrId("messages"));
  message.load({ profile: profile.id, job: job.id, channel: to ? "email" : "manual", to, status: "gerando" });
  app.save(message);
  const task = new Record(app.findCollectionByNameOrId("ai_tasks"));
  task.load({ type: "apply_kit", profile: profile.id, ref: message.id, status: "queued", payload: { vaga: vagaOf(job), cv: cvOf(profile), mente: menteOf(app, profile.id), auto }, attempts: 0 });
  app.save(task);
  return { message, reused: false };
}

// devolve { ok, status, error, sentToday, cap }
function send(app, message, { subject, body, auto = false } = {}) {
  if (message.getString("status") !== "pronta" || message.getString("channel") !== "email") return { ok: false, status: 409, error: "Essa mensagem não está pronta pra envio." };
  const profile = app.findRecordById("profile", message.getString("profile"));
  let account;
  try {
    account = app.findFirstRecordByFilter("mail_accounts", "profile = {:p}", { p: profile.id });
  } catch {
    return { ok: false, status: 400, error: "Configure o e-mail de envio primeiro." };
  }
  if (!account.getString("verifiedAt")) return { ok: false, status: 400, error: "Teste a conexão do e-mail antes de enviar." };

  const cap = profile.getInt("dailyCap") || 10;
  const since = new Date(Date.now() - 864e5).toISOString().replace("T", " ");
  const sent = app.countRecords("messages", $dbx.exp("profile = {:p} AND (status = 'enviada' OR status = 'enviando') AND sentAt >= {:since}", { p: profile.id, since }));
  if (sent >= cap) return { ok: false, status: 429, error: `Teto de ${cap} envios em 24h atingido. Ajuste em Configurações se quiser mais.` };

  message.load({
    subject: String(subject ?? message.getString("subject")).slice(0, 200),
    body: String(body ?? message.getString("body")).slice(0, 8000),
    status: "enviando",
    sentAt: new Date().toISOString().replace("T", " "),
    error: "",
  });
  app.save(message);
  const job = message.getString("job") ? app.findRecordById("jobs", message.getString("job")) : null;
  const task = new Record(app.findCollectionByNameOrId("ai_tasks"));
  task.load({
    type: "mail_send",
    profile: profile.id,
    ref: message.id,
    status: "queued",
    payload: { to: message.getString("to"), subject: message.getString("subject"), body: message.getString("body"), cv: message.get("cv"), lang: message.getString("lang"), company: job ? job.getString("company") : "" },
    attempts: 0,
  });
  app.save(task);
  require(`${__hooks}/mail_audit.js`)(app, profile.id, auto ? "envio_automatico" : "envio_pedido", message.getString("to"), { message: message.id, sentToday: sent + 1, cap });
  return { ok: true, sentToday: sent + 1, cap };
}

module.exports = { prepare, send };
