/// <reference path="../pb_data/types.d.ts" />

cronAdd("ujob-close-stale", "17 * * * *", () => {
  const staleHours = Math.max(24, parseInt($os.getenv("JOB_STALE_HOURS") || "96", 10));
  $app
    .db()
    .newQuery(
      `UPDATE jobs SET status = 'closed', closedAt = strftime('%Y-%m-%d %H:%M:%fZ', 'now')
       WHERE status = 'open' AND (
         lastSeenAt < strftime('%Y-%m-%d %H:%M:%fZ', 'now', {:window})
         OR (expiresAt != '' AND expiresAt < strftime('%Y-%m-%d %H:%M:%fZ', 'now'))
       )`,
    )
    .bind({ window: `-${staleHours} hours` })
    .execute();
});

cronAdd("ujob-retention", "41 4 * * *", () => {
  const days = Math.max(30, parseInt($os.getenv("JOB_RETENTION_DAYS") || "120", 10));
  $app
    .db()
    .newQuery(
      `DELETE FROM jobs WHERE status = 'closed' AND closedAt < strftime('%Y-%m-%d %H:%M:%fZ', 'now', {:window})
       AND id NOT IN (SELECT job FROM applications WHERE job != '')`,
    )
    .bind({ window: `-${days} days` })
    .execute();
  $app.db().newQuery("DELETE FROM runs WHERE finishedAt < strftime('%Y-%m-%d %H:%M:%fZ', 'now', '-30 days')").execute();
  $app.db().newQuery("DELETE FROM honeypot_hits WHERE created < strftime('%Y-%m-%d %H:%M:%fZ', 'now', '-30 days')").execute();
});
