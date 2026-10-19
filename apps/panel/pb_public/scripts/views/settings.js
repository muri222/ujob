import { api, list, remove } from "../core/api.js";
import { brainProblem, ctx, useProfile } from "../core/context.js";
import { confirm, h, header, icon, toast } from "../core/dom.js";
import { segmented, toggle } from "../core/ui.js";
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
    root.append(header("Config. da conta", null), h("div", { className: "empty card" }, h("strong", {}, "Crie sua primeira função"), "Use o seletor no topo do menu."));
    return;
  }
  // e-mail é da conta: serve pra todas as funções
  const { items } = await list("mail_accounts", { sort: "-verifiedAt", perPage: 1 }).catch(() => ({ items: [] }));
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
          const { items: fresh } = await list("mail_accounts", { sort: "-verifiedAt", perPage: 1 });
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

  // funções: renomear fica nas Preferências; aqui lista e apaga
  const functions = h(
    "ul",
    { className: "rejects" },
    ctx.profiles.map((item) =>
      h(
        "li",
        {},
        h("span", {}, item.label || "Principal", item.id === ctx.profile.id ? h("span", { className: "tag tag--ok" }, " ativa") : ""),
        h("small", {}, item.headline || ""),
        ctx.profiles.length > 1
          ? h(
              "button",
              {
                type: "button",
                className: "icon-btn",
                "aria-label": "Apagar função",
                onclick: async () => {
                  if (!(await confirm(`Apagar a função ${item.label || "Principal"}? Some o funil, as buscas, os leads e as conversas dela. Não dá pra desfazer.`, { confirmLabel: "Apagar" }))) return;
                  await remove("profile", item.id);
                  if (item.id === ctx.profile.id) useProfile(ctx.profiles.find((other) => other.id !== item.id).id);
                  location.reload();
                },
              },
              icon("close"),
            )
          : null,
      ),
    ),
  );

  // exportar: tudo da função ativa num JSON (igual "Exportar dados" do AiApply)
  const exportGo = h("button", { type: "button", className: "btn btn--soft" }, icon("upload"), "Baixar meus dados");
  exportGo.addEventListener("click", async () => {
    exportGo.disabled = true;
    try {
      const of = (name) => list(name, { filter: `profile = '${ctx.profile.id}'`, perPage: 500 }).then((page) => page.items).catch(() => []);
      const names = ["applications", "searches", "mind_facts", "messages", "leads", "campaigns", "conversations"];
      const data = { exportado: new Date().toISOString(), funcao: ctx.profile, ...Object.fromEntries(await Promise.all(names.map(async (name) => [name, await of(name)]))) };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      h("a", { href: url, download: `radar-${(ctx.profile.label || "funcao").normalize("NFD").replace(/[^\w]+/g, "-")}.json` }).click();
    } finally {
      exportGo.disabled = false;
    }
  });

  const FAQ = [
    ["Como funcionam as funções?", "Cada função (ex.: 3D Generalista, Editor de Vídeo) tem currículo, preferências, buscas, funil, leads e painel próprios. Troque no topo do menu. O e-mail de envio e o tema valem pra todas."],
    ["Como o Auto Apply decide pra quais vagas enviar?", "A cada 30 min ele pega vagas novas com e-mail da área e dos cargos da função, tira as empresas excluídas e pede a nota do Claude. Só as com nota acima da mínima viram candidatura. No Híbrido você confirma; no Automático sai sozinho até o limite diário."],
    ["Quanto da minha assinatura do Claude isso gasta?", "Nota de vaga usa o Sonnet (pouco); carta e CV adaptado usam o Opus (mais). Busca de leads na web com Claude é o que mais gasta. O resto (coleta, filtro, leitura de sites) roda no PC sem IA."],
    ["Meus dados saem do PC?", "Não. Banco, coleta e IA rodam aqui. Só sai o que você manda: e-mails de candidatura e as perguntas ao Claude da sua conta."],
  ];
  const support = h("div", { className: "answers" }, FAQ.map(([question, answer]) => h("details", { className: "answer" }, h("summary", {}, h("strong", {}, question)), h("p", { className: "settings__help" }, answer))));

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

  // fontes de vagas: chaves grátis (Adzuna, Jooble) e LinkedIn / Indeed / Google Vagas via Apify
  const keyBox = (kind, label, inputs, help, link) => {
    const state = h("span", { className: "settings__state" }, integrations[kind]?.connected ? [h("span", { className: "tag tag--ok" }, icon("check"), "Conectada"), ` ${ago(integrations[kind].verifiedAt)}`] : h("span", { className: "tag" }, "Não conectada"));
    const go = h("button", { type: "button", className: "btn btn--primary" }, icon("check"), "Conectar");
    go.addEventListener("click", async () => {
      go.disabled = true;
      try {
        await api(`radar/integrations/${kind}`, { method: "POST", body: Object.fromEntries(inputs.map(([key, node]) => [key, node.value])) });
        inputs.forEach(([, node]) => (node.value = ""));
        state.replaceChildren(h("span", { className: "tag tag--ok" }, icon("check"), "Conectada"), " as vagas chegam na próxima rodada");
      } catch (error) {
        state.replaceChildren(h("span", { className: "tag tag--down" }, error.message));
      } finally {
        go.disabled = false;
      }
    });
    return h("div", { className: "answer" }, h("strong", {}, label), h("p", { className: "settings__help" }, help, " ", h("a", { href: link, target: "_blank", rel: "noopener noreferrer" }, "Pegar chave grátis", icon("external"))), h("div", { className: "import__row" }, ...inputs.map(([, node]) => node), go, state));
  };
  const apifyJobs = integrations.apify ?? {};
  const BIG = [
    ["apify_linkedin", "LinkedIn", "~US$ 0,40 por 1.000 vagas"],
    ["apify_indeed", "Indeed", "~US$ 0,10 por 1.000 vagas"],
    ["apify_google", "Google Vagas", "~US$ 0,09 por página de 10 (o mais caro)"],
  ];
  const bigToggles = BIG.map(([kind, label, price]) =>
    h(
      "div",
      { className: "import__row" },
      toggle(label, Boolean(apifyJobs.jobs?.[kind]), async (on) => {
        if (!apifyJobs.connected) return toast("Conecte a Apify primeiro (seção abaixo).");
        await api("radar/integrations/apify/jobs", { method: "POST", body: { [kind]: on } }).catch((error) => toast(error.message));
        toast(on ? `${label} ligado. Entra nas suas buscas.` : `${label} desligado.`);
      }),
      h("strong", {}, label),
      h("small", { className: "settings__help" }, price),
    ),
  );
  const dailyItems = h("input", { type: "number", min: 0, max: 5000, step: 50, value: apifyJobs.dailyItems ?? 300 });
  dailyItems.addEventListener("change", () => api("radar/integrations/apify/jobs", { method: "POST", body: { dailyItems: dailyItems.value } }).then(() => toast("Teto salvo.")).catch((error) => toast(error.message)));
  const feeds = h(
    "section",
    { className: "panel settings" },
    h("header", { className: "section__head" }, h("h2", {}, "Fontes de vagas"), h("small", {}, `${integrations.discovered ?? 0} empresas descobertas sozinhas`)),
    h("p", { className: "settings__help" }, "O Radar já lê Gupy, Greenhouse, Lever, Ashby, Workable, Recruitee, Personio, Trampos, InfoJobs, Vagas.com, BNE e outros, de graça. Quando uma vaga aponta pra um sistema de vagas aberto, a empresa vira fonte sozinha."),
    keyBox("adzuna", "Adzuna (grátis)", [["appId", h("input", { placeholder: "App ID", autocomplete: "off" })], ["appKey", h("input", { type: "password", placeholder: "App Key", autocomplete: "off" })]], "Agregador com milhares de vagas no Brasil. Cadastro grátis, 250 buscas por dia.", "https://developer.adzuna.com/signup"),
    keyBox("jooble", "Jooble (grátis)", [["key", h("input", { type: "password", placeholder: "Chave da API", autocomplete: "off" })]], "Agregador que junta vagas de centenas de sites.", "https://jooble.org/api/about"),
    h(
      "div",
      { className: "answer" },
      h("strong", {}, "LinkedIn, Indeed e Google Vagas (via Apify)"),
      h("p", { className: "settings__help" }, "Esses sites não têm API aberta: o Radar usa coletores da Apify com os seus créditos (US$ 5 grátis por mês) e só nas suas buscas, nunca em segundo plano. Os termos de uso do LinkedIn e do Indeed não permitem coleta automática; use por sua conta."),
      ...bigToggles,
      h("label", { className: "field" }, h("span", {}, `Máximo de vagas por dia somando as três (hoje: ${apifyJobs.usedToday ?? 0})`), dailyItems),
    ),
  );

  // IA: Claude Code logado (padrão), ChatGPT logado (Codex) ou API com chave
  const AIS = [
    ["claude", "Claude Code (logado)", "Sua assinatura do Claude. Melhor qualidade, pesquisa na web, lê anexos. Recomendado.", { top: "opus", best: "sonnet", cheap: "haiku" }],
    ["codex", "ChatGPT (Codex logado)", "Sua assinatura do ChatGPT pelo Codex CLI (rode codex login uma vez). Pesquisa na web; sem streaming no chat.", { top: "", best: "", cheap: "" }],
    ["openrouter", "OpenRouter (chave)", "Paga por uso, centenas de modelos. Web só com :online (cobra a mais).", { top: "anthropic/claude-sonnet-4.5", best: "openai/gpt-5-mini", cheap: "google/gemini-2.5-flash" }],
    ["deepseek", "DeepSeek (chave)", "Paga por uso, bem barato. Sem pesquisa na web.", { top: "deepseek-reasoner", best: "deepseek-chat", cheap: "deepseek-chat" }],
    ["openai", "Outra API compatível com OpenAI", "OpenAI, Groq, Together, LM Studio... Cole o endereço e a chave.", { top: "", best: "", cheap: "" }],
  ];
  const aiNow = integrations.ai ?? { provider: "claude", models: {} };
  let aiPick = aiNow.provider || "claude";
  const aiCards = h("div", { className: "modes" });
  const aiKey = h("input", { type: "password", autocomplete: "off", placeholder: aiNow.hasKey ? "Chave salva (deixe vazio pra manter)" : "Chave da API" });
  const aiBase = h("input", { type: "url", value: aiNow.baseUrl ?? "", placeholder: "https://api.openai.com/v1" });
  const tierInputs = { top: h("input", { maxLength: 120 }), best: h("input", { maxLength: 120 }), cheap: h("input", { maxLength: 120 }) };
  const aiExtra = h("div", { className: "pref__control" });
  const paintAi = () => {
    aiCards.replaceChildren(...AIS.map(([key, title, text]) => h("button", { type: "button", className: "mode", role: "radio", "aria-checked": String(aiPick === key), onclick: () => ((aiPick = key), paintAi()) }, h("strong", {}, title), h("small", {}, text))));
    const defaults = AIS.find(([key]) => key === aiPick)[3];
    for (const [tier, node] of Object.entries(tierInputs)) {
      node.placeholder = defaults[tier] || "padrão da conta";
      node.value = aiPick === aiNow.provider ? aiNow.models?.[tier] ?? "" : "";
    }
    const usesKey = ["openrouter", "deepseek", "openai"].includes(aiPick);
    aiExtra.replaceChildren(
      usesKey ? field("Chave da API", aiKey) : "",
      aiPick === "openai" ? field("Endereço da API", aiBase) : "",
      aiPick !== "claude" ? h("details", { className: "settings__advanced" }, h("summary", {}, "Modelos (avançado)"), h("div", { className: "resume__grid" }, field("Caprichado (cartas, dossiê)", tierInputs.top), field("Equilibrado (nota de vaga)", tierInputs.best), field("Rápido (extração, títulos)", tierInputs.cheap))) : "",
    );
  };
  paintAi();
  const aiSave = h("button", { type: "button", className: "btn btn--primary" }, icon("check"), "Usar esta IA");
  aiSave.addEventListener("click", async () => {
    aiSave.disabled = true;
    try {
      await api("radar/integrations/ai", { method: "POST", body: { provider: aiPick, key: aiKey.value, baseUrl: aiBase.value, models: Object.fromEntries(Object.entries(tierInputs).map(([tier, node]) => [tier, node.value.trim()])) } });
      aiKey.value = "";
      Object.assign(aiNow, { provider: aiPick });
      claude.replaceChildren(h("span", { className: "spinner" }), " Trocando… o serviço de IA confere em até 30 s.");
      setTimeout(() => brainProblem(true).then((problem) => claude.replaceChildren(problem ? h("span", { className: "tag tag--down" }, problem) : h("span", { className: "tag tag--ok" }, icon("check"), `${AIS.find(([key]) => key === aiPick)[1]} pronto`))), 35_000);
    } catch (error) {
      toast(error.message);
    } finally {
      aiSave.disabled = false;
    }
  });

  const claude = h("p", {}, "Checando…");
  brainProblem(true).then((problem) => claude.replaceChildren(problem ? h("span", { className: "tag tag--down" }, problem) : h("span", { className: "tag tag--ok" }, icon("check"), `${AIS.find(([key]) => key === (aiNow.provider || "claude"))[1]} pronto`)));

  root.append(
    header("Config. da conta", "Vale pra todas as funções. Tudo fica só neste PC.", h("a", { className: "btn btn--soft", href: "#preferencias" }, icon("gear"), "Preferências da função")),
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
      h("header", { className: "section__head" }, h("h2", {}, "Apify (opcional)"), h("small", {}, "Busca leads no Google Maps com os seus créditos")),
      h("p", { className: "settings__help" }, "Crie uma conta grátis na Apify (US$ 5 de crédito por mês) e cole o token de API.", h("a", { href: "https://console.apify.com/settings/integrations", target: "_blank", rel: "noopener noreferrer" }, "Pegar meu token", icon("external"))),
      h("div", { className: "import__row" }, apifyToken, apifySave, apifyState),
    ),
    feeds,
    h("section", { className: "panel settings" }, h("header", { className: "section__head" }, h("h2", {}, "IA"), h("small", {}, "Qual IA o Radar usa em tudo: notas, cartas, chat, leads")), aiCards, aiExtra, h("div", { className: "import__row" }, aiSave, claude)),
    h("section", { className: "panel settings" }, h("header", { className: "section__head" }, h("h2", {}, "Suas funções"), h("small", {}, "Renomeie em Preferências")), functions),
    h("section", { className: "panel settings" }, h("header", { className: "section__head" }, h("h2", {}, "Exportar dados"), h("small", {}, "Tudo da função ativa num arquivo JSON")), h("div", { className: "import__row" }, exportGo)),
    h("section", { className: "panel settings" }, h("header", { className: "section__head" }, h("h2", {}, "Suporte"), h("a", { href: "#guia" }, "Como usar ", icon("arrow"))), support),
  );
}
