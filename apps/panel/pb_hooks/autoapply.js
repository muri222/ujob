/// <reference path="../pb_data/types.d.ts" />

// Auto Apply: só roda pra perfil em Híbrido ou Automático. Revisão (padrão) nunca entra aqui.
const PER_RUN = 12;

function scan(app) {
  const { cvOf, vagaOf, menteOf } = require(`${__hooks}/payload.js`);
  const profiles = app.findRecordsByFilter("profile", "sendMode = 'hibrido' || sendMode = 'auto'", "", 20, 0);
  const since = new Date(Date.now() - 2 * 864e5).toISOString().replace("T", " ");
  let queued = 0;
  for (const profile of profiles) {
    const areas = JSON.parse(profile.getString("categories") || "[]") || [];
    const areaFilter = areas.length ? ` && (${areas.map((_, i) => `category = {:a${i}}`).join(" || ")})` : "";
    const params = { since, p: profile.id, ...Object.fromEntries(areas.map((area, i) => [`a${i}`, area])) };
    // vaga nova, com e-mail, da área do perfil, que ainda não foi avaliada nem está no funil
    const jobs = app.findRecordsByFilter(
      "jobs",
      `status = 'open' && contactEmail != '' && firstSeenAt >= {:since}${areaFilter}`,
      "-firstSeenAt",
      80,
      0,
      params,
    );
    const cv = cvOf(profile);
    const mente = menteOf(app, profile.id);
    let picked = 0;
    for (const job of jobs) {
      if (picked >= PER_RUN) break;
      const known =
        app.countRecords("ai_tasks", $dbx.exp("profile = {:p} AND type = 'job_fit' AND ref = {:j}", { p: profile.id, j: job.id })) ||
        app.countRecords("applications", $dbx.exp("profile = {:p} AND job = {:j}", { p: profile.id, j: job.id }));
      if (known) continue;
      const task = new Record(app.findCollectionByNameOrId("ai_tasks"));
      task.load({ type: "job_fit", ref: job.id, profile: profile.id, status: "queued", payload: { vaga: vagaOf(job), cv, mente, auto: true }, attempts: 0 });
      app.save(task);
      picked++;
    }
    queued += picked;
  }
  return queued;
}

module.exports = { scan };
