/// <reference path="../pb_data/types.d.ts" />

const fold = (text) => String(text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// empresas pra onde a pessoa se candidatou: o leitor do IMAP usa pra separar e-mail de candidatura do resto
function hints(app) {
  const names = new Set();
  for (const record of app.findRecordsByFilter("applications", "company != ''", "-updated", 300, 0)) names.add(record.getString("company"));
  for (const record of app.findRecordsByFilter("messages", "company != ''", "-createdAt", 300, 0)) names.add(record.getString("company"));
  return [...names].filter((name) => name.length > 2).slice(0, 300);
}

function queueSync(app, account) {
  const busy = app.countRecords("ai_tasks", $dbx.exp("type = 'mail_sync' AND ref = {:ref} AND (status = 'queued' OR status = 'running')", { ref: account.id }));
  if (busy) return false;
  const task = new Record(app.findCollectionByNameOrId("ai_tasks"));
  task.load({ type: "mail_sync", profile: account.getString("profile"), ref: account.id, status: "queued", payload: { lastUid: account.getInt("lastUid"), days: 45, hints: hints(app) }, attempts: 0 });
  app.save(task);
  return true;
}

// liga o e-mail a uma candidatura: nome da empresa no remetente, no domínio ou no assunto
function matchApplication(app, item) {
  const where = fold(`${item.fromName} ${item.fromEmail} ${item.subject} ${String(item.body ?? "").slice(0, 1500)}`);
  for (const record of app.findRecordsByFilter("applications", "company != '' && stage != 'encerrada'", "-updated", 300, 0)) {
    const company = fold(record.getString("company"));
    const words = company.split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !["studio", "studios", "games", "group", "brasil", "ltda", "company", "digital"].includes(word));
    if ((company.length > 2 && where.includes(company)) || words.some((word) => where.includes(word))) return record.id;
  }
  return "";
}

function store(app, account, result) {
  const collection = app.findCollectionByNameOrId("inbox");
  let created = 0;
  for (const item of result.items || []) {
    try {
      app.findFirstRecordByFilter("inbox", "account = {:a} && uid = {:u}", { a: account.id, u: item.uid });
      continue;
    } catch {}
    const record = new Record(collection);
    record.load({ ...item, account: account.id, application: matchApplication(app, item), read: false, archived: false });
    try {
      app.save(record);
      created++;
    } catch (error) {
      console.log("inbox: não salvou e-mail", item.uid, error);
    }
  }
  account.load({ lastUid: Math.max(account.getInt("lastUid"), result.lastUid | 0), syncedAt: new Date().toISOString().replace("T", " "), syncError: "" });
  app.save(account);
  return created;
}

module.exports = { queueSync, store };
