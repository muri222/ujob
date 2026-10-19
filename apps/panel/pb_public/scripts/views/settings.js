import { api, list, update } from "../core/api.js";
import { brainProblem, ctx, mine } from "../core/context.js";
import { h, header, icon, toast } from "../core/dom.js";
import { ago } from "../core/format.js";
import { listen } from "../core/realtime.js";

const HELP = {
  gmail: "No Gmail: ative a verificação em 2 etapas e crie uma senha de app (16 letras). A senha normal não funciona.",
  outlook: "No Outlook/Hotmail: crie uma senha de app na sua conta Microsoft (precisa da verificação em 2 etapas).",
  yahoo: "No Yahoo: gere uma senha de app em Segurança da conta.",
  icloud: "No iCloud: gere uma senha específica de app no site da Apple.",
};

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
  if (email.value && !account.smtpHost) detect();

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

  const cap = h("input", { type: "number", min: 1, max: 500, value: ctx.profile.dailyCap || 10 });
  cap.addEventListener("change", async () => {
    const value = Math.max(1, Math.min(500, Number(cap.value) || 10));
    ctx.profile = await update("profile", ctx.profile.id, { dailyCap: value }).catch(() => ctx.profile);
    toast(`Teto: ${value} envios por dia.`);
  });

  const claude = h("p", {}, "Checando…");
  brainProblem(true).then((problem) => claude.replaceChildren(problem ? h("span", { className: "tag tag--down" }, problem) : h("span", { className: "tag tag--ok" }, icon("check"), "Claude Code logado e pronto")));

  root.append(
    header("Configurações", `Perfil: ${ctx.profile.name || "sem nome"}. Tudo fica só neste PC.`),
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
      h("header", { className: "section__head" }, h("h2", {}, "Envio"), h("small", {}, "Modo Revisão: nada sai sem o seu clique")),
      h("div", { className: "resume__grid" }, field("Máximo de envios por dia", cap)),
    ),
    h("section", { className: "panel settings" }, h("header", { className: "section__head" }, h("h2", {}, "IA"), h("small", {}, "Usa o Claude Code logado neste PC, na sua assinatura")), claude),
  );
}
