/// <reference path="../pb_data/types.d.ts" />

// fila uma resposta do chat: histórico + contexto do Radar montado agora (handlers do PB não veem funções de fora, por isso módulo)
const CHAT_PRIORITY = 10;

function queueReply(app, conversation, model) {
  // Array.from: a lista do PB é uma fatia do Go; .reverse() direto nela embaralha os itens
  const history = Array.from(app.findRecordsByFilter("chat_messages", "conversation = {:c} && status = 'pronta'", "-createdAt", 30, 0, { c: conversation.id }))
    .reverse()
    .map((message) => ({
      role: message.getString("role"),
      text: message.getString("text"),
      // áudio já virou texto na transcrição; o Claude não lê áudio, então não vai como anexo
      files: Array.from(message.get("files") || [])
        .filter((name) => !/\.(webm|ogg|mp3|m4a|wav)$/i.test(name))
        .map((name) => `${message.id}/${name}`),
    }));
  const reply = new Record(app.findCollectionByNameOrId("chat_messages"));
  reply.load({ conversation: conversation.id, role: "assistant", text: "", status: "pensando", meta: { model } });
  app.save(reply);
  const task = new Record(app.findCollectionByNameOrId("ai_tasks"));
  task.load({
    type: "chat_reply",
    profile: conversation.getString("profile"),
    ref: reply.id,
    status: "queued",
    priority: CHAT_PRIORITY,
    payload: {
      mode: conversation.getString("mode") || "chat",
      setup: JSON.parse(conversation.getString("setup") || "null"),
      model: ["top", "best", "cheap"].includes(model) ? model : "best",
      history,
      files_dir: `${app.dataDir()}/storage/${app.findCollectionByNameOrId("chat_messages").id}`,
      context: require(`${__hooks}/chat_context.js`)(app, conversation.getString("profile")),
    },
    attempts: 0,
  });
  app.save(task);
  conversation.set("lastAt", new Date().toISOString().replace("T", " "));
  app.save(conversation);
  return reply;
}


module.exports = { queueReply, CHAT_PRIORITY };
