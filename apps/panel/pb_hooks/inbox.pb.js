/// <reference path="../pb_data/types.d.ts" />

// Entrada: lê o IMAP a cada 20 min (só contas com e-mail testado e IMAP)
cronAdd("radar-inbox", "*/20 * * * *", () => {
  const { queueSync } = require(`${__hooks}/inbox.js`);
  for (const account of $app.findRecordsByFilter("mail_accounts", "verifiedAt != '' && imapHost != ''", "", 10, 0)) queueSync($app, account);
});

routerAdd(
  "POST",
  "/api/radar/inbox/sync",
  (e) => {
    const { queueSync } = require(`${__hooks}/inbox.js`);
    const accounts = $app.findRecordsByFilter("mail_accounts", "verifiedAt != '' && imapHost != ''", "", 10, 0);
    if (!accounts.length) return e.json(400, { message: "Configure e teste o e-mail (com IMAP) em Config. da conta." });
    let queued = 0;
    for (const account of accounts) if (queueSync($app, account)) queued++;
    return e.json(200, { queued });
  },
  $apis.requireSuperuserAuth(),
);

onRecordAfterUpdateSuccess((e) => {
  e.next();
  const task = e.record;
  if (task.getString("type") !== "mail_sync" || !["done", "failed"].includes(task.getString("status"))) return;
  let account;
  try {
    account = $app.findRecordById("mail_accounts", task.getString("ref"));
  } catch {
    return;
  }
  if (task.getString("status") === "failed") {
    account.set("syncError", task.getString("error").slice(0, 500));
    $app.save(account);
    return;
  }
  require(`${__hooks}/inbox.js`).store($app, account, JSON.parse(task.getString("result") || "{}") || {});
}, "ai_tasks");
