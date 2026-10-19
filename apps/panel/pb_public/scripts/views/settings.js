import { api, list, update } from "../core/api.js";
import { brainProblem, ctx, mine } from "../core/context.js";
import { h, header, icon, toast } from "../core/dom.js";
import { segmented } from "../core/ui.js";
import { ago } from "../core/format.js";
import { listen } from "../core/realtime.js";

const HELP = {
  workspace: "Google Workspace (e-mail do seu domínio no Google): ative a verificação em 2 etapas e crie uma senha de app. Se a opção não aparecer, o admin do Workspace precisa liberar.",
  gmail: "No Gmail: ative a verificação em 2 etapas e crie uma senha de app (16 letras). A senha normal não funciona.",
  outlook: "No Outlook/Hotmail: crie uma senha de app na sua conta Microsoft (precisa da verificação em 2 etapas).",
  yahoo: "No Yahoo: gere uma senha de app em Segurança da conta.",
  icloud: "No iCloud: gere uma senha específica de app no site da Apple.",
};

const PALETTES = [
  ["areia", "Areia", "#9a7a4f"],
  ["oceano", "Oceano", "#2f6fb0"],
  ["floresta", "Floresta", "#2f7d5b"],
  ["ameixa", "Ameixa", "#7a4fa0"],
  ["coral", "Coral", "#c8573a"],
  ["grafite", "Grafite", "#4a5059"],
];

function appearance() {
  const current = window.radarTheme.get();
  const mode = segmented([["system", "Sistema"], ["light", "Claro"], ["dark", "Escuro"]], current.mode, (value) => window.radarTheme.set({ mode: value }), "Modo");
  const swatches = h("div", { className: "swatches" });
  const paint = () =>
    swatches.replaceChildren(
      ...PALETTES.map(([key, label, color]) =>
        h(
          "button",
          { type: "button", className: "swatch", "aria-pressed": String(window.radarTheme.get().palette === key), onclick: () => (window.radarTheme.set({ palette: key }), paint()) },
          h("i", { style: { background: color } }),
          label,
        ),
      ),
    );
  paint();
  return h("section", { className: "panel settings" }, h("header", { className: "section__head" }, h("h2", {}, "Aparência"), h("small", {}, "Fica salvo neste PC")), h("div", { className: "import__row" }, mode), swatches);
}

export default async function settings(root, { signal }) {
  if (!ctx.profile) {
    root.append(header("Configurações", null), h("div", { className: "empty card" }, h("strong", {}, "Crie seu perfil primeiro"), "Cada perfil tem o próprio e-mail de envio."));
    return;
  }
  const { items } = await list("mail_accounts", { filter: mine(), perPage: 1 }).catch(() => ({ items: [] }));
  const account = items[0] ?? {};

  const field = (label, input) => h("label", { className: "field" }, h("span", {}, label), input);
  const email = h("input", { type: "email", value: account.email ?? ctx.profile.email ?? "", placeholder: "voce@gmail.com", autocomplete: "email" });
  const name = h("input", { value: account.name ?? ctx.profile.name ?? "", maxLength: 80, placeholder: "Como aparece pra quem recebe" });
  const password = h("input", { type: "password", placeholder: account.email ? "Deixe vazio pra manter a atual" : "Senha de app", autocomplete: "new-password" });
  const smtpHost = h("input", { value: account.smtpHost ?? "" });
  const smtpPort = h("input", { type: "number", value: account.smtpPort ?? 587 });
  const imapHost = h("input", { value: account.imapHost ?? "" });
  const imapPort = h("input", { type: "number", value: account.imapPort ?? 993 });
  const help = h("p", { className: "settings__help" });
  const state = h("p", { className: "settings__state" });
  const save = h("button", { className: "btn btn--primary" }, icon("check"), "Salvar e testar");

  function paintState(record) {
    if (record.verifiedAt) state.replaceChildren(h("span", { className: "tag tag--ok" }, icon("check"), "Conectado"), ` testado ${ago(record.verifiedAt)}`);
    else if (record.lastError) state.replaceChildren(h("span", { className: "tag tag--down" }, "Não conectou"), ` ${record.lastError}`);
    else state.replaceChildren(record.email ? h("span", { className: "tag" }, "Ainda não testado") : "");
  }
  paintState(account);

  async function detect() {
    if (!email.value.includes("@")) return;
    try {
      const found = await api(`radar/mail/detect?email=${encodeURIComponent(email.value.trim())}`);
      smtpHost.value = found.smtpHost;
      smtpPort.value = found.smtpPort;
      imapHost.value = found.imapHost;
      imapPort.value = found.imapPort;
      help.replaceChildren(HELP[found.provider] ?? "Use uma senha de app se o seu provedor tiver; senão, a senha do e-mail.", found.help ? [" ", h("a", { href: found.help, target: "_blank", rel: "noopener noreferrer" }, "Criar senha de app", icon("external"))] : "");
    } catch {}
  }
  email.addEventListener("change", detect);
  if (email.value && (!account.smtpHost || account.lastError)) detect();

  save.addEventListener("click", async () => {
    save.disabled = true;
    state.replaceChildren(h("span", { className: "spinner" }), " Testando a conexão…");
    try {
      const { task } = await api("radar/mail/account", {
        method: "POST",
        body: { profile: ctx.profile.id, email: email.value, name: name.value, password: password.value, smtpHost: smtpHost.value, smtpPort: smtpPort.value, imapHost: imapHost.value, imapPort: imapPort.value },
      });
      password.value = "";
      listen(
        "ai_tasks",
        async ({ record }) => {
          if (record.id !== task || !["done", "failed"].includes(record.status)) return;
          const { items: fresh } = await list("mail_accounts", { filter: mine(), perPage: 1 });
          paintState(fresh[0] ?? {});
          save.disabled = false;
        },
        signal,
      );
    } catch (error) {
      state.replaceChildren(h("span", { className: "tag tag--down" }, "Não salvou"), ` ${error.message}`);
      save.disabled = false;
    }
  });

  // Auto Apply (igual AiApply): Revisão = só clique; Híbrido = Claude prepara sozinho, você envia; Automático = sai sozinho
  const MODES = {
    revisao: "Você escolhe a vaga, o Claude prepara, você revisa e envia. Nada sai sozinho.",
    hibrido: "A cada 30 min o Radar avalia vagas novas com e-mail da sua área. As que passam do limiar viram candidatura pronta em Prontas para enviar; você só confirma.",
    auto: "Igual ao Híbrido, mas a candidatura sai sozinha do seu e-mail, dentro do teto diário. Tudo fica registrado.",
  };
  const modeHelp = h("p", { className: "settings__help" }, MODES[ctx.profile.sendMode || "revisao"]);
  const saveProfile = async (patch, message) => {
    ctx.profile = await update("profile", ctx.profile.id, patch).catch(() => ctx.profile);
    if (message) toast(message);
  };
  const mode = segmented(
    [["revisao", "Revisão"], ["hibrido", "Híbrido"], ["auto", "Automático"]],
    ctx.profile.sendMode || "revisao",
    (value) => {
      modeHelp.textContent = MODES[value];
      saveProfile({ sendMode: value }, value === "auto" ? "Automático ligado. Confira o teto diário e o limiar." : "Modo salvo.");
    },
    "Modo de envio",
  );
  const threshold = h("input", { type: "range", min: 50, max: 95, step: 5, value: ctx.profile.threshold || 70 });
  const thresholdLabel = h("strong", { className: "num" }, `${ctx.profile.threshold || 70}`);
  threshold.addEventListener("input", () => (thresholdLabel.textContent = threshold.value));
  threshold.addEventListener("change", () => saveProfile({ threshold: Number(threshold.value) }, `Só vagas com nota ${threshold.value}+ do Claude.`));
  const runNow = h("button", { type: "button", className: "btn btn--soft" }, icon("radar"), "Rodar agora");
  runNow.addEventListener("click", async () => {
    if ((ctx.profile.sendMode || "revisao") === "revisao") return toast("Escolha Híbrido ou Automático primeiro.");
    runNow.disabled = true;
    try {
      const { queued } = await api("radar/autoapply/run", { method: "POST" });
      toast(queued ? `${queued} vagas novas na fila de avaliação do Claude.` : "Nenhuma vaga nova com e-mail na sua área agora.");
    } finally {
      runNow.disabled = false;
    }
  });

  const cap = h("input", { type: "number", min: 1, max: 500, value: ctx.profile.dailyCap || 10 });
  cap.addEventListener("change", async () => {
    const value = Math.max(1, Math.min(500, Number(cap.value) || 10));
    ctx.profile = await update("profile", ctx.profile.id, { dailyCap: value }).catch(() => ctx.profile);
    toast(`Teto: ${value} envios por dia.`);
  });

  // Apify: opcional, pra buscar leads no Google Maps com os créditos da própria pessoa
  const apifyToken = h("input", { type: "password", placeholder: "apify_api_...", autocomplete: "off" });
  const apifyState = h("p", { className: "settings__state" });
  const integrations = await api("radar/integrations").catch(() => ({ apify: {} }));
  apifyState.replaceChildren(integrations.apify?.connected ? [h("span", { className: "tag tag--ok" }, icon("check"), "Conectada"), ` ${ago(integrations.apify.verifiedAt)}`] : h("span", { className: "tag" }, "Não conectada"));
  const apifySave = h("button", { className: "btn btn--primary" }, icon("check"), "Conectar");
  apifySave.addEventListener("click", async () => {
    apifySave.disabled = true;
    try {
      const { username } = await api("radar/integrations/apify", { method: "POST", body: { token: apifyToken.value } });
      apifyToken.value = "";
      apifyState.replaceChildren(h("span", { className: "tag tag--ok" }, icon("check"), "Conectada"), ` como ${username}`);
    } catch (error) {
      apifyState.replaceChildren(h("span", { className: "tag tag--down" }, error.message));
    } finally {
      apifySave.disabled = false;
    }
  });

  const claude = h("p", {}, "Checando…");
  brainProblem(true).then((problem) => claude.replaceChildren(problem ? h("span", { className: "tag tag--down" }, problem) : h("span", { className: "tag tag--ok" }, icon("check"), "Claude Code logado e pronto")));

  root.append(
    header("Configurações", `Perfil: ${ctx.profile.name || "sem nome"}. Tudo fica só neste PC.`),
    appearance(),
    h(
      "section",
      { className: "panel settings" },
      h("header", { className: "section__head" }, h("h2", {}, "E-mail de envio"), h("small", {}, "As candidaturas saem do seu próprio e-mail")),
      h("div", { className: "resume__grid" }, field("Seu e-mail", email), field("Nome do remetente", name), field("Senha de app", password)),
      help,
      h("details", { className: "settings__advanced" }, h("summary", {}, "Avançado (servidor)"), h("div", { className: "resume__grid" }, field("SMTP", smtpHost), field("Porta SMTP", smtpPort), field("IMAP", imapHost), field("Porta IMAP", imapPort))),
      h("div", { className: "import__row" }, save, state),
    ),
    h(
      "section",
      { className: "panel settings" },
      h("header", { className: "section__head" }, h("h2", {}, "Envio e Auto Apply"), h("small", {}, "Você escolhe quanto o Radar faz sozinho")),
      h("div", { className: "import__row" }, mode, runNow),
      modeHelp,
      h("div", { className: "resume__grid" }, field("Máximo de envios por dia", cap), h("label", { className: "field" }, h("span", {}, "Nota mínima do Claude pra candidatar sozinho: ", thresholdLabel), threshold)),
    ),
    h(
      "section",
      { className: "panel settings" },
      h("header", { className: "section__head" }, h("h2", {}, "Apify (opcional)"), h("small", {}, "Busca leads no Google Maps com os seus créditos")),
      h("p", { className: "settings__help" }, "Crie uma conta grátis na Apify (US$ 5 de crédito por mês) e cole o token de API.", h("a", { href: "https://console.apify.com/settings/integrations", target: "_blank", rel: "noopener noreferrer" }, "Pegar meu token", icon("external"))),
      h("div", { className: "import__row" }, apifyToken, apifySave, apifyState),
    ),
    h("section", { className: "panel settings" }, h("header", { className: "section__head" }, h("h2", {}, "IA"), h("small", {}, "Usa o Claude Code logado neste PC, na sua assinatura")), claude),
  );
}
