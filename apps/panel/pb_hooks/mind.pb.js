/// <reference path="../pb_data/types.d.ts" />

// importar CV: o brain lê o PDF/site no próprio PC e o Claude só estrutura o texto
routerAdd(
  "POST",
  "/api/radar/cv/import",
  (e) => {
    const body = e.requestInfo().body;
    const profile = $app.findRecordById("profile", String(body.profile ?? ""));
    let payload;
    if (body.source === "pdf") {
      const file = profile.getString("resume");
      if (!file) return e.json(400, { message: "Envie o PDF do currículo primeiro." });
      payload = { pdf: `${$app.dataDir()}/storage/${profile.collection().id}/${profile.id}/${file}` };
    } else {
      const url = String(body.url ?? "").trim();
      if (!/^https?:\/\/[^\s"<>]{3,500}$/i.test(url)) return e.json(400, { message: "Link inválido." });
      payload = { url };
    }
    const task = new Record($app.findCollectionByNameOrId("ai_tasks"));
    task.load({ type: "cv_import", profile: profile.id, ref: body.source === "pdf" ? "pdf" : "url", status: "queued", payload, attempts: 0 });
    $app.save(task);
    return e.json(200, { task: task.id });
  },
  $apis.requireSuperuserAuth(),
);

// texto livre de recusa vira fatos pendentes na Mente, pro usuário aprovar
onRecordAfterUpdateSuccess((e) => {
  e.next();
  const task = e.record;
  if (task.getString("type") !== "mind_extract" || task.getString("status") !== "done") return;
  const json = (field) => JSON.parse(task.getString(field) || "{}") || {};
  const { facts = [] } = json("result");
  const origin = String(json("payload").origin ?? "recusa de vaga").slice(0, 160);
  const collection = $app.findCollectionByNameOrId("mind_facts");
  for (const fact of facts.slice(0, 5)) {
    const record = new Record(collection);
    record.load({
      profile: task.getString("profile"),
      text: String(fact.text ?? "").slice(0, 300),
      kind: ["preferencia", "restricao", "objetivo", "fato"].includes(fact.kind) ? fact.kind : "preferencia",
      origin,
      confidence: Math.max(0, Math.min(1, Number(fact.confidence) || 0.5)),
      status: "pendente",
    });
    try {
      $app.save(record);
    } catch {}
  }
}, "ai_tasks");

// Mente mudou: as notas de vaga antigas ficam desatualizadas (o fit compara com profile.updated)
const touchProfile = (e) => {
  e.next();
  try {
    $app.save($app.findRecordById("profile", e.record.getString("profile")));
  } catch {}
};
onRecordAfterCreateSuccess(touchProfile, "mind_facts");
onRecordAfterUpdateSuccess(touchProfile, "mind_facts");
onRecordAfterDeleteSuccess(touchProfile, "mind_facts");
