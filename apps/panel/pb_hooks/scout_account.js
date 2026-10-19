/// <reference path="../pb_data/types.d.ts" />

module.exports = function ensureScout(app) {
  const email = $os.getenv("SCOUT_EMAIL");
  const password = $os.getenv("SCOUT_PASSWORD");
  if (!email || !password || password.length < 12) return;

  let bot;
  try {
    bot = app.findAuthRecordByEmail("bots", email);
  } catch {
    bot = new Record(app.findCollectionByNameOrId("bots"));
    bot.setEmail(email);
    bot.setVerified(true);
  }
  if (bot.isNew() || !bot.validatePassword(password)) {
    bot.setPassword(password);
    app.save(bot);
  }
};
