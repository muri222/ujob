/// <reference path="../pb_data/types.d.ts" />

// chat estilo app do Claude: histórico + contexto do Radar montado na hora + anexos lidos do disco local

// pede a resposta pra última mensagem (ou regenera)
routerAdd(
  "POST",
  "/api/radar/chat/{id}/reply",
  (e) => {
    const conversation = $app.findRecordById("conversations", e.request.pathValue("id"));
    const body = e.requestInfo().body;
    if (body.regenerate) {
      const last = $app.findRecordsByFilter("chat_messages", "conversation = {:c}", "-createdAt", 1, 0, { c: conversation.id })[0];
      if (last && last.getString("role") === "assistant") $app.delete(last);
    }
    const reply = require(`${__hooks}/chat_reply.js`).queueReply($app, conversation, String(body.model ?? "best"));
    return e.json(200, { message: reply.id });
  },
  $apis.requireSuperuserAuth(),
);

// áudio: transcreve no PC (Whisper local) e, se pedido, já responde
routerAdd(
  "POST",
  "/api/radar/chat/messages/{id}/transcribe",
  (e) => {
    const message = $app.findRecordById("chat_messages", e.request.pathValue("id"));
    const audio = Array.from(message.get("files") || []).find((name) => /\.(webm|ogg|mp3|m4a|wav)$/i.test(name));
    if (!audio) return e.json(400, { message: "Sem áudio nessa mensagem." });
    const conversation = $app.findRecordById("conversations", message.getString("conversation"));
    message.load({ status: "transcrevendo", meta: { ...(JSON.parse(message.getString("meta") || "{}") || {}), autoReply: Boolean(e.requestInfo().body.reply), model: String(e.requestInfo().body.model ?? "best") } });
    $app.save(message);
    const task = new Record($app.findCollectionByNameOrId("ai_tasks"));
    task.load({ type: "transcribe", profile: conversation.getString("profile"), ref: message.id, status: "queued", priority: 10, payload: { path: `${$app.dataDir()}/storage/${message.collection().id}/${message.id}/${audio}` }, attempts: 0 });
    $app.save(task);
    return e.json(200, { ok: true });
  },
  $apis.requireSuperuserAuth(),
);

// parar a resposta: o brain confere a cada pedaço enviado
routerAdd(
  "POST",
  "/api/radar/chat/messages/{id}/stop",
  (e) => {
    const message = $app.findRecordById("chat_messages", e.request.pathValue("id"));
    message.set("meta", { ...(JSON.parse(message.getString("meta") || "{}") || {}), stop: true });
    $app.save(message);
    return e.json(200, { ok: true });
  },
  $apis.requireSuperuserAuth(),
);

// brain manda o texto parcial enquanto o Claude escreve (streaming)
routerAdd(
  "POST",
  "/api/radar/tasks/{id}/partial",
  (e) => {
    const task = $app.findRecordById("ai_tasks", e.request.pathValue("id"));
    if (task.getString("type") !== "chat_reply" || task.getString("status") !== "running") return e.json(409, { stop: true });
    const message = $app.findRecordById("chat_messages", task.getString("ref"));
    const meta = JSON.parse(message.getString("meta") || "{}") || {};
    message.load({ text: String(e.requestInfo().body.text ?? "").slice(0, 100000), status: "escrevendo" });
    $app.save(message);
    return e.json(200, { stop: Boolean(meta.stop) });
  },
  $apis.requireAuth("bots"),
);

onRecordAfterUpdateSuccess((e) => {
  e.next();
  const task = e.record;
  const type = task.getString("type");
  const status = task.getString("status");
  if (!["chat_reply", "chat_title", "transcribe"].includes(type) || !["done", "failed"].includes(status)) return;
  const result = JSON.parse(task.getString("result") || "null") || {};

  if (type === "chat_title") {
    if (status !== "done") return;
    const conversation = $app.findRecordById("conversations", task.getString("ref"));
    if (!conversation.getString("title")) {
      conversation.set("title", String(result.title ?? "").slice(0, 120));
      $app.save(conversation);
    }
    return;
  }

  const message = $app.findRecordById("chat_messages", task.getString("ref"));
  const meta = JSON.parse(message.getString("meta") || "{}") || {};
  if (status === "failed") {
    message.load({ status: type === "transcribe" ? "pronta" : "erro", error: task.getString("error").slice(0, 1000) });
    $app.save(message);
    return;
  }

  if (type === "transcribe") {
    const text = [message.getString("text"), String(result.text ?? "").trim()].filter(Boolean).join("\n\n");
    message.load({ text, status: "pronta", meta: { ...meta, transcribed: true } });
    $app.save(message);
    if (meta.autoReply && text) require(`${__hooks}/chat_reply.js`).queueReply($app, $app.findRecordById("conversations", message.getString("conversation")), meta.model || "best");
    return;
  }

  // chat_reply pronta
  message.load({ text: String(result.text ?? "").slice(0, 100000), status: "pronta", error: "", meta: { ...meta, stop: false, model_used: result.model, tokens: result.tokens } });
  $app.save(message);
  const conversation = $app.findRecordById("conversations", message.getString("conversation"));
  if (!conversation.getString("title")) {
    const first = $app.findRecordsByFilter("chat_messages", "conversation = {:c} && role = 'user'", "createdAt", 1, 0, { c: conversation.id })[0];
    const titleTask = new Record($app.findCollectionByNameOrId("ai_tasks"));
    titleTask.load({ type: "chat_title", profile: conversation.getString("profile"), ref: conversation.id, status: "queued", priority: 9, payload: { user: first ? first.getString("text").slice(0, 800) : "", reply: message.getString("text").slice(0, 800) }, attempts: 0 });
    $app.save(titleTask);
  }
}, "ai_tasks");
