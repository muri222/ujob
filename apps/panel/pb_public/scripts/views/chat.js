import { api, create, list, quote, update } from "../core/api.js";
import { brainProblem, ctx, mine } from "../core/context.js";
import { ask, confirm, h, icon, modal, toast } from "../core/dom.js";
import { ago } from "../core/format.js";
import { markdown } from "../core/markdown.js";
import { listen } from "../core/realtime.js";

// conversa com o Claude do PC, com o contexto do uJob montado na hora de cada resposta
const MODELS = [
  ["best", "Sonnet", "Equilibrado"],
  ["top", "Opus", "Mais inteligente, mais lento"],
  ["cheap", "Haiku", "Rápido e leve"],
];
const SUGGESTIONS = [
  "Quais vagas valem minha candidatura hoje e por quê?",
  "Escreva uma DM curta pro lead mais promissor",
  "Me prepare pra uma entrevista de artista 3D",
  "Monte uma proposta de projeto pra um cliente novo",
];
const WORKING = { pensando: "Pensando…", escrevendo: "", transcrevendo: "Transcrevendo o áudio…" };
const MODEL_KEY = "radar:chat-model";

let fileToken = { value: "", at: 0 };
async function fileUrl(message, name) {
  if (!fileToken.value || Date.now() - fileToken.at > 100_000) fileToken = { value: (await api("files/token", { method: "POST" })).token, at: Date.now() };
  return `api/files/${message.collectionId}/${message.id}/${encodeURIComponent(name)}?token=${fileToken.value}`;
}

const storedModel = () => {
  try {
    return localStorage.getItem(MODEL_KEY) || "best";
  } catch {
    return "best";
  }
};

export default async function chat(root, { signal, query }) {
  if (!ctx.profile) {
    root.append(h("div", { className: "empty card" }, h("strong", {}, "Crie seu perfil primeiro"), "O chat usa seu currículo e seu funil como contexto."));
    return;
  }
  root.classList.add("view--flush");
  let conversation = null;
  let showArchived = false;
  let model = storedModel();
  let attachments = [];
  let recorder = null;
  const nodes = new Map();

  // ---------- lista de conversas ----------
  const listBox = h("ul", { className: "chat__list" });
  const search = h("input", { type: "search", placeholder: "Buscar conversas", className: "chat__search" });
  const tabs = h(
    "div",
    { className: "chat__tabs" },
    h("button", { type: "button", "aria-pressed": "true", onclick: (event) => switchTab(false, event.currentTarget) }, "Conversas"),
    h("button", { type: "button", "aria-pressed": "false", onclick: (event) => switchTab(true, event.currentTarget) }, "Arquivadas"),
  );
  function switchTab(archived, button) {
    showArchived = archived;
    for (const node of tabs.children) node.setAttribute("aria-pressed", String(node === button));
    loadList();
  }

  async function loadList() {
    const term = search.value.trim();
    const { items } = await list("conversations", { filter: mine(`archived = ${showArchived}${term ? ` && title ~ ${quote(term)}` : ""}`), sort: "-pinned,-lastAt,-createdAt", perPage: 200 }).catch(() => ({ items: [] }));
    listBox.replaceChildren(
      ...(items.length
        ? items.map((item) => {
            const menu = h(
              "div",
              { className: "chat__item-menu" },
              h("button", { type: "button", title: item.pinned ? "Desafixar" : "Fixar", onclick: (event) => (event.stopPropagation(), update("conversations", item.id, { pinned: !item.pinned }).then(loadList)) }, icon("bookmark")),
              h("button", { type: "button", title: "Renomear", onclick: (event) => (event.stopPropagation(), rename(item)) }, icon("edit")),
              h("button", { type: "button", title: item.archived ? "Desarquivar" : "Arquivar", onclick: (event) => (event.stopPropagation(), archive(item, !item.archived)) }, icon(item.archived ? "undo" : "kanban")),
              h("button", { type: "button", title: "Apagar", onclick: (event) => (event.stopPropagation(), remove(item)) }, icon("trash")),
            );
            return h(
              "li",
              { className: `chat__item${conversation?.id === item.id ? " is-active" : ""}`, onclick: () => openConversation(item) },
              h("span", { className: "chat__item-title" }, item.pinned ? "📌 " : "", item.mode === "entrevista" ? "🎤 " : "", item.title || "Nova conversa"),
              h("small", {}, ago(item.lastAt || item.createdAt)),
              menu,
            );
          })
        : [h("li", { className: "chat__empty-list" }, showArchived ? "Nada arquivado." : term ? "Nenhuma conversa com esse nome." : "Suas conversas aparecem aqui.")]),
    );
  }
  search.addEventListener("input", () => loadList());

  async function rename(item) {
    const title = await ask("Novo nome da conversa", { value: item.title || "" });
    if (!title) return;
    await update("conversations", item.id, { title: title.trim().slice(0, 120) || item.title });
    if (conversation?.id === item.id) titleNode.textContent = title.trim() || "Nova conversa";
    loadList();
  }
  async function archive(item, archived) {
    await update("conversations", item.id, { archived });
    toast(archived ? "Conversa arquivada." : "Conversa de volta.");
    if (archived && conversation?.id === item.id) newConversation();
    loadList();
  }
  async function remove(item) {
    if (!(await confirm("Apagar essa conversa de vez? Mensagens e anexos somem.", { confirmLabel: "Apagar" }))) return;
    await api(`collections/conversations/records/${item.id}`, { method: "DELETE" });
    if (conversation?.id === item.id) newConversation();
    loadList();
  }

  // ---------- conversa ----------
  const titleNode = h("strong", { className: "chat__title" }, "Nova conversa");
  const finishButton = h("button", { type: "button", className: "btn btn--soft", hidden: true, onclick: () => ((input.value = "Encerre a entrevista e me dê a avaliação completa."), send()) }, icon("check"), "Encerrar e avaliar");
  const modelSelect = h("select", { className: "chat__model", "aria-label": "Modelo" }, MODELS.map(([key, name, hint]) => h("option", { value: key, selected: key === model }, `${name} · ${hint}`)));
  modelSelect.addEventListener("change", () => {
    model = modelSelect.value;
    try {
      localStorage.setItem(MODEL_KEY, model);
    } catch {}
  });
  const thread = h("div", { className: "chat__thread" });
  const scroller = h("div", { className: "chat__scroll" }, thread);
  const stick = () => requestAnimationFrame(() => (scroller.scrollTop = scroller.scrollHeight));

  function welcomeScreen() {
    const name = (ctx.profile.name || "").split(" ")[0];
    thread.replaceChildren(
      h(
        "div",
        { className: "chat__welcome" },
        h("span", { className: "chat__spark" }, icon("sparkle")),
        h("h2", {}, name && name !== "Artista" ? `Como posso ajudar, ${name}?` : "Como posso ajudar?"),
        h("p", {}, "Eu vejo seu currículo, a Mente, o funil, as vagas avaliadas e os leads, sempre atualizados."),
        h("div", { className: "chat__suggestions" }, SUGGESTIONS.map((text) => h("button", { type: "button", onclick: () => ((input.value = text), send()) }, text))),
      ),
    );
  }

  async function paintFiles(message, box) {
    const names = message.files ?? [];
    if (!names.length) return;
    const chips = await Promise.all(
      names.map(async (name) => {
        const url = await fileUrl(message, name);
        if (/\.(png|jpe?g|gif|webp)$/i.test(name)) return h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, h("img", { src: url, alt: name, className: "chat__thumb" }));
        if (/\.(webm|ogg|mp3|m4a|wav)$/i.test(name)) return h("audio", { src: url, controls: true, className: "chat__audio" });
        return h("a", { className: "tag", href: url, target: "_blank", rel: "noopener noreferrer" }, icon("file"), name.replace(/_[a-z0-9]{10}(\.\w+)$/, "$1"));
      }),
    );
    box.replaceChildren(...chips);
  }

  function messageNode(message) {
    const body = h("div", { className: "chat__body" });
    const files = h("div", { className: "chat__files" });
    const actions = h("div", { className: "chat__actions" });
    const node = h("article", { className: `chat__msg chat__msg--${message.role}` }, files, body, actions);
    node.paint = (record) => {
      const working = WORKING[record.status];
      if (record.role === "assistant") {
        body.innerHTML = record.text ? markdown(record.text) : "";
        if (working) body.append(h("p", { className: "chat__working" }, h("span", { className: "spinner" }), working));
        if (record.status === "escrevendo") body.append(h("span", { className: "chat__caret" }));
        if (record.status === "erro") body.append(h("p", { className: "fit__err" }, record.error || "Deu erro."));
      } else {
        body.replaceChildren(record.text ? h("p", {}, record.text) : "", working ? h("p", { className: "chat__working" }, h("span", { className: "spinner" }), working) : "");
      }
      const done = record.status === "pronta" || record.status === "erro";
      actions.replaceChildren(
        done && record.text ? h("button", { type: "button", title: "Copiar", onclick: () => navigator.clipboard.writeText(record.text).then(() => toast("Copiado.")) }, icon("copy")) : "",
        done && record.role === "assistant" ? h("button", { type: "button", title: "Gerar de novo", onclick: () => regenerate() }, icon("refresh")) : "",
        done && record.role === "assistant" && record.text && "speechSynthesis" in window ? h("button", { type: "button", title: "Ouvir", onclick: () => speak(record.text) }, icon("live")) : "",
        record.meta?.model_used && done ? h("small", {}, record.meta.model_used.replace("claude-", "")) : "",
      );
      paintBusy();
    };
    node.record = message;
    node.paint(message);
    paintFiles(message, files);
    return node;
  }

  // lê em voz alta com as vozes do Windows (grátis); útil pra treinar entrevista
  function speak(text) {
    speechSynthesis.cancel();
    const plain = text.replace(/[#*_`>\[\]()]/g, "").slice(0, 4000);
    const utterance = new SpeechSynthesisUtterance(plain);
    utterance.lang = conversation?.setup?.idioma === "en" ? "en-US" : "pt-BR";
    utterance.voice = speechSynthesis.getVoices().find((voice) => voice.lang.startsWith(utterance.lang.slice(0, 2))) ?? null;
    speechSynthesis.speak(utterance);
  }

  let busy = false;
  function paintBusy() {
    const last = [...nodes.values()].at(-1)?.record;
    busy = Boolean(last && WORKING[last.status] !== undefined && last.status !== "pronta");
    sendButton.replaceChildren(icon(busy ? "close" : "send"));
    sendButton.title = busy ? "Parar" : "Enviar (Enter)";
  }

  async function openConversation(item) {
    conversation = item;
    titleNode.textContent = item.title || "Nova conversa";
    finishButton.hidden = item.mode !== "entrevista";
    nodes.clear();
    const { items } = await list("chat_messages", { filter: `conversation = ${quote(item.id)}`, sort: "createdAt", perPage: 500 });
    thread.replaceChildren(...items.map((message) => {
      const node = messageNode(message);
      nodes.set(message.id, node);
      return node;
    }));
    if (!items.length) welcomeScreen();
    paintBusy();
    stick();
    loadList();
    history.replaceState(null, "", `#claude?c=${item.id}`);
  }

  function newConversation() {
    conversation = null;
    titleNode.textContent = "Nova conversa";
    finishButton.hidden = true;
    nodes.clear();
    welcomeScreen();
    paintBusy();
    loadList();
    history.replaceState(null, "", "#claude");
    input.focus();
  }

  listen(
    "chat_messages",
    ({ action, record }) => {
      if (!conversation || record.conversation !== conversation.id) return;
      const node = nodes.get(record.id);
      if (action === "delete") return node?.remove(), nodes.delete(record.id), paintBusy();
      if (node) {
        node.record = record;
        node.paint(record);
      } else {
        if (!nodes.size) thread.replaceChildren();
        const fresh = messageNode(record);
        nodes.set(record.id, fresh);
        thread.append(fresh);
      }
      stick();
    },
    signal,
  );
  listen("conversations", ({ record }) => {
    if (record.profile !== ctx.profile.id) return;
    if (conversation?.id === record.id && record.title) titleNode.textContent = record.title;
    loadList();
  }, signal);

  // ---------- composição ----------
  const input = h("textarea", { rows: 1, placeholder: "Mensagem pro Claude… (Enter envia, Shift+Enter quebra linha)", className: "chat__input" });
  const tray = h("div", { className: "chat__tray" });
  const picker = h("input", { type: "file", multiple: true, hidden: true });
  const attachButton = h("button", { type: "button", className: "icon-btn", title: "Anexar arquivo", onclick: () => picker.click() }, icon("plus"));
  const micButton = h("button", { type: "button", className: "icon-btn", title: "Gravar áudio" }, icon("mic"));
  const sendButton = h("button", { type: "button", className: "chat__send", title: "Enviar (Enter)" }, icon("send"));

  const grow = () => ((input.style.height = "auto"), (input.style.height = `${Math.min(220, input.scrollHeight)}px`));
  input.addEventListener("input", grow);
  input.addEventListener("keydown", (event) => event.key === "Enter" && !event.shiftKey && (event.preventDefault(), busy ? null : send()));

  function addFiles(files) {
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) toast(`${file.name} passa de 25 MB.`);
      else if (attachments.length < 10) attachments.push(file);
    }
    paintTray();
  }
  function paintTray() {
    tray.replaceChildren(
      ...attachments.map((file, index) =>
        h("span", { className: "tag" }, icon(file.type.startsWith("audio") ? "mic" : "file"), file.name.slice(0, 40), h("button", { type: "button", "aria-label": "Tirar", onclick: () => (attachments.splice(index, 1), paintTray()) }, icon("close"))),
      ),
    );
  }
  picker.addEventListener("change", () => (addFiles(picker.files), (picker.value = "")));
  input.addEventListener("paste", (event) => {
    const files = [...(event.clipboardData?.files ?? [])];
    if (files.length) (event.preventDefault(), addFiles(files));
  });
  root.addEventListener("dragover", (event) => event.preventDefault());
  root.addEventListener("drop", (event) => (event.preventDefault(), addFiles(event.dataTransfer.files)));

  micButton.addEventListener("click", async () => {
    if (recorder) return recorder.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      recorder = new MediaRecorder(stream);
      const started = Date.now();
      const timer = setInterval(() => (micButton.dataset.time = `${Math.round((Date.now() - started) / 1000)}s`), 500);
      recorder.ondataavailable = (event) => chunks.push(event.data);
      recorder.onstop = () => {
        clearInterval(timer);
        stream.getTracks().forEach((track) => track.stop());
        micButton.classList.remove("is-recording");
        delete micButton.dataset.time;
        recorder = null;
        const audio = new File(chunks, `audio-${Date.now()}.webm`, { type: "audio/webm" });
        send({ audio });
      };
      recorder.start();
      micButton.classList.add("is-recording");
    } catch {
      toast("Não deu pra usar o microfone. Libere a permissão do microfone pro uJob.");
    }
  });

  async function setupInterview(jobId = "") {
    const { items: applications } = await list("applications", { filter: mine("stage != 'recusada' && stage != 'encerrada'"), sort: "-updated", perPage: 50 }).catch(() => ({ items: [] }));
    const pick = h(
      "select",
      {},
      h("option", { value: "" }, "Descrever outra vaga…"),
      applications.map((item) => h("option", { value: item.job || `app:${item.id}`, selected: item.job && item.job === jobId }, `${item.title}${item.company ? ` · ${item.company}` : ""}`)),
    );
    if (jobId && !applications.some((item) => item.job === jobId)) pick.prepend(h("option", { value: jobId, selected: true }, "A vaga que você abriu"));
    const describe = h("textarea", { rows: 3, placeholder: "Cargo, empresa e o que a vaga pede (cole a descrição se tiver)" });
    const language = h("select", {}, h("option", { value: "pt" }, "Português"), h("option", { value: "en" }, "Inglês"));
    const kind = h("select", {}, h("option", { value: "misto" }, "Misto"), h("option", { value: "comportamental" }, "Comportamental (RH)"), h("option", { value: "tecnica" }, "Técnica"));
    const syncDescribe = () => (describe.hidden = Boolean(pick.value));
    pick.addEventListener("change", syncDescribe);
    syncDescribe();
    const dialog = h(
      "dialog",
      { className: "confirm interview-dialog" },
      h(
        "form",
        { method: "dialog", className: "interview-setup" },
        h("p", {}, h("strong", {}, "Treinar entrevista"), h("br"), h("small", {}, "O Claude vira o entrevistador dessa vaga, faz uma pergunta por vez e no fim te avalia. Responda escrevendo ou por áudio.")),
        h("label", { className: "field" }, h("span", {}, "Vaga"), pick),
        describe,
        h("div", { className: "resume__grid" }, h("label", { className: "field" }, h("span", {}, "Idioma"), language), h("label", { className: "field" }, h("span", {}, "Tipo"), kind)),
        h("div", { className: "confirm__actions" }, h("button", { className: "btn btn--ghost", value: "no", formNoValidate: true }, "Cancelar"), h("button", { className: "btn btn--primary", value: "yes" }, icon("live"), "Começar")),
      ),
    );
    if (!(await modal(dialog, (value) => value === "yes"))) return;
    let vaga = { titulo: describe.value.trim().slice(0, 120), descricao: describe.value.trim().slice(0, 4000) };
    if (pick.value && !pick.value.startsWith("app:")) {
      const job = await api(`collections/jobs/records/${pick.value}`).catch(() => null);
      if (job) vaga = { titulo: job.title, empresa: job.company, descricao: String(job.description || job.summary || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 4000) };
    } else if (pick.value) {
      const app = applications.find((item) => `app:${item.id}` === pick.value);
      vaga = { titulo: app.title, empresa: app.company, descricao: app.notes || "" };
    }
    if (!vaga.titulo) return toast("Escolha uma vaga ou descreva a vaga.");
    const problem = await brainProblem(true);
    if (problem) return toast(problem);
    conversation = await create("conversations", {
      profile: ctx.profile.id,
      mode: "entrevista",
      title: `Entrevista · ${vaga.titulo}`.slice(0, 120),
      setup: { ...vaga, idioma: language.value, tipo: kind.value },
      lastAt: new Date().toISOString(),
    });
    await openConversation(conversation);
    await create("chat_messages", { conversation: conversation.id, role: "user", text: language.value === "en" ? "I'm ready, let's start the interview." : "Estou pronto, pode começar a entrevista.", status: "pronta" });
    await api(`radar/chat/${conversation.id}/reply`, { method: "POST", body: { model } });
  }

  async function ensureConversation() {
    if (conversation) return conversation;
    conversation = await create("conversations", { profile: ctx.profile.id, title: "", lastAt: new Date().toISOString() });
    history.replaceState(null, "", `#claude?c=${conversation.id}`);
    loadList();
    return conversation;
  }

  async function send({ audio } = {}) {
    const text = input.value.trim();
    if (!text && !attachments.length && !audio) return;
    if (!audio) {
      const problem = await brainProblem(true);
      if (problem) return toast(problem);
    }
    const files = audio ? [audio] : attachments;
    input.value = "";
    attachments = [];
    paintTray();
    grow();
    try {
      const current = await ensureConversation();
      const form = new FormData();
      form.append("conversation", current.id);
      form.append("role", "user");
      form.append("text", text);
      form.append("status", audio ? "transcrevendo" : "pronta");
      for (const file of files) form.append("files", file);
      const message = await api("collections/chat_messages/records", { method: "POST", body: form });
      if (audio) await api(`radar/chat/messages/${message.id}/transcribe`, { method: "POST", body: { reply: true, model } });
      else await api(`radar/chat/${current.id}/reply`, { method: "POST", body: { model } });
    } catch (error) {
      toast(error.message || "Não deu pra enviar.");
    }
  }

  async function regenerate() {
    if (!conversation || busy) return;
    await api(`radar/chat/${conversation.id}/reply`, { method: "POST", body: { model, regenerate: true } }).catch((error) => toast(error.message));
  }

  sendButton.addEventListener("click", async () => {
    if (!busy) return send();
    const last = [...nodes.values()].at(-1)?.record;
    if (last?.role === "assistant") await api(`radar/chat/messages/${last.id}/stop`, { method: "POST" }).catch(() => {});
  });

  root.append(
    h(
      "div",
      { className: "chat" },
      h(
        "aside",
        { className: "chat__side" },
        h("button", { type: "button", className: "btn btn--primary chat__new", onclick: newConversation }, icon("plus"), "Nova conversa"),
        h("button", { type: "button", className: "btn btn--soft chat__new", onclick: () => setupInterview() }, icon("live"), "Treinar entrevista"),
        search,
        tabs,
        listBox,
      ),
      h(
        "section",
        { className: "chat__main" },
        h("header", { className: "chat__head" }, titleNode, h("div", { className: "import__row" }, finishButton, modelSelect)),
        scroller,
        h("div", { className: "chat__composer" }, tray, h("div", { className: "chat__row" }, attachButton, input, micButton, sendButton), picker, h("small", { className: "chat__hint" }, "Usa a IA escolhida em Config. da conta (padrão: Claude Code logado). Pode pesquisar na web e ler seus anexos.")),
      ),
    ),
  );

  await loadList();
  if (query.get("entrevista") !== null) {
    newConversation();
    return setupInterview(query.get("entrevista") || "");
  }
  const wanted = query.get("c");
  if (wanted) {
    const found = await api(`collections/conversations/records/${wanted}`).catch(() => null);
    found ? openConversation(found) : newConversation();
  } else newConversation();
}
