/// <reference path="../pb_data/types.d.ts" />

// contas de serviço: scout (só manda vagas) e brain (só fila de IA)
const ACCOUNTS = [
  ["SCOUT", "scout"],
  ["BRAIN", "brain"],
];

module.exports = function ensureBots(app) {
  const hasRole = app.findCollectionByNameOrId("bots").fields.getByName("role");
  for (const [prefix, role] of ACCOUNTS) {
    const email = $os.getenv(`${prefix}_EMAIL`);
    const password = $os.getenv(`${prefix}_PASSWORD`);
    if (!email || !password || password.length < 12) continue;

    let bot;
    try {
      bot = app.findAuthRecordByEmail("bots", email);
    } catch {
      bot = new Record(app.findCollectionByNameOrId("bots"));
      bot.setEmail(email);
      bot.setVerified(true);
    }
    const stale = hasRole && bot.getString("role") !== role;
    if (stale) bot.set("role", role);
    if (bot.isNew() || stale || !bot.validatePassword(password)) {
      bot.setPassword(password);
      app.save(bot);
    }
  }
};
