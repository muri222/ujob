/// <reference path="../pb_data/types.d.ts" />

// a cada 30 min: avalia vagas novas com e-mail pros perfis em Híbrido/Automático
cronAdd("radar-autoapply", "*/30 * * * *", () => {
  try {
    require(`${__hooks}/autoapply.js`).scan($app);
  } catch (error) {
    console.log("autoapply:", error);
  }
});

// rodar agora (botão em Configurações)
routerAdd(
  "POST",
  "/api/radar/autoapply/run",
  (e) => e.json(200, { queued: require(`${__hooks}/autoapply.js`).scan($app) }),
  $apis.requireSuperuserAuth(),
);

onRecordAfterUpdateSuccess((e) => {
  e.next();
  const task = e.record;
  const type = task.getString("type");
  if (task.getString("status") !== "done" || type !== "job_fit") return;
  const payload = JSON.parse(task.getString("payload") || "{}") || {};
  if (!payload.auto) return;
  const profile = $app.findRecordById("profile", task.getString("profile"));
  const mode = profile.getString("sendMode");
  if (mode !== "hibrido" && mode !== "auto") return;
  const apply = require(`${__hooks}/apply.js`);

  // nota boa + vale aplicar + vaga com e-mail → Claude prepara carta e CV
  if (type === "job_fit") {
    const result = JSON.parse(task.getString("result") || "{}") || {};
    const threshold = profile.getInt("threshold") || 70;
    if (!(result.score >= threshold && result.vale_aplicar)) return;
    let job;
    try {
      job = $app.findRecordById("jobs", task.getString("ref"));
    } catch {
      return;
    }
    if (!job.getString("contactEmail")) return;
    apply.prepare($app, profile, job, { auto: true });
  }
  // o envio automático da carta pronta fica no gancho do mail.pb.js (precisa rodar depois de a carta ficar "pronta")

}, "ai_tasks");
