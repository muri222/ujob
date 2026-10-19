/// <reference path="../pb_data/types.d.ts" />

// Preparar entrevista: a pessoa marca as partes (pesquisa da empresa, salário, roteiro, pitch, perguntas)
// e o Claude faz só essas. Busca na web só quando pede empresa ou salário (gasta mais).
routerAdd(
  "POST",
  "/api/radar/coach",
  (e) => {
    const { cvOf, vagaOf, menteOf } = require(`${__hooks}/payload.js`);
    // ponytail: dentro do handler (o JSVM isola os handlers e não enxerga const do topo do arquivo)
    const SECTIONS = ["empresa", "salario", "roteiro", "pitch", "perguntas"];
    const body = e.requestInfo().body;
    const application = $app.findRecordById("applications", String(body.application ?? ""));
    const sections = (Array.isArray(body.sections) ? body.sections : []).filter((key) => SECTIONS.includes(key));
    if (!sections.length) return e.json(400, { message: "Escolha pelo menos uma parte pro Claude fazer." });
    const busy = $app.countRecords("ai_tasks", $dbx.exp("type = 'interview_coach' AND ref = {:ref} AND (status = 'queued' OR status = 'running')", { ref: application.id }));
    if (busy) return e.json(409, { message: "O Claude já está preparando essa candidatura." });
    const profile = $app.findRecordById("profile", application.getString("profile"));
    let vaga = { title: application.getString("title"), company: application.getString("company"), url: application.getString("url") };
    try {
      if (application.getString("job")) vaga = vagaOf($app.findRecordById("jobs", application.getString("job")));
    } catch {}
    const task = new Record($app.findCollectionByNameOrId("ai_tasks"));
    task.load({
      type: "interview_coach",
      profile: profile.id,
      ref: application.id,
      status: "queued",
      priority: 5,
      payload: { sections, notes: String(body.notes ?? "").slice(0, 2000), vaga, cv: cvOf(profile), mente: menteOf($app, profile.id), etapa: application.getString("stage") },
      attempts: 0,
    });
    $app.save(task);
    return e.json(200, { task: task.id });
  },
  $apis.requireSuperuserAuth(),
);

// resultado entra na candidatura, somando com o que já tinha (só troca as partes refeitas)
onRecordAfterUpdateSuccess((e) => {
  e.next();
  const task = e.record;
  if (task.getString("type") !== "interview_coach" || task.getString("status") !== "done") return;
  let application;
  try {
    application = $app.findRecordById("applications", task.getString("ref"));
  } catch {
    return;
  }
  const coach = JSON.parse(application.getString("coach") || "{}") || {};
  const result = JSON.parse(task.getString("result") || "{}") || {};
  for (const [key, value] of Object.entries(result)) if (value !== null && value !== undefined && value !== "") coach[key] = value;
  coach.updatedAt = new Date().toISOString();
  application.set("coach", coach);
  $app.save(application);
}, "ai_tasks");
