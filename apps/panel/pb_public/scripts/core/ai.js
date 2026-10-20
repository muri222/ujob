import { api } from "./api.js";
import { brainProblem } from "./context.js";
import { h, icon, toast } from "./dom.js";

// IA: Claude Code logado (padrão), ChatGPT logado (Codex) ou API com chave. Usado em Config. da conta e no primeiro passo da configuração inicial.
const AIS = [
  ["claude", "Claude Code (logado)", "Sua assinatura do Claude. Melhor qualidade, pesquisa na web, lê anexos. Recomendado.", { top: "opus", best: "sonnet", cheap: "haiku" }],
  ["codex", "ChatGPT (Codex logado)", "Sua assinatura do ChatGPT pelo Codex CLI (rode codex login uma vez). Pesquisa na web; sem streaming no chat.", { top: "", best: "", cheap: "" }],
  ["openrouter", "OpenRouter (chave)", "Paga por uso, centenas de modelos. Web só com :online (cobra a mais).", { top: "anthropic/claude-sonnet-4.5", best: "openai/gpt-5-mini", cheap: "google/gemini-2.5-flash" }],
  ["deepseek", "DeepSeek (chave)", "Paga por uso, bem barato. Sem pesquisa na web.", { top: "deepseek-reasoner", best: "deepseek-chat", cheap: "deepseek-chat" }],
  ["openai", "Outra API compatível com OpenAI", "OpenAI, Groq, Together, LM Studio... Cole o endereço e a chave.", { top: "", best: "", cheap: "" }],
];
const HELP = {
  claude: "Instale o Claude Code e, num terminal, rode: claude auth login",
  codex: "Instale o Codex CLI e, num terminal, rode: codex login",
};

const field = (label, input) => h("label", { className: "field" }, h("span", {}, label), input);
const titleOf = (key) => AIS.find(([item]) => item === key)?.[1] ?? "IA";

export function aiPicker(current) {
  const aiNow = current ?? { provider: "claude", models: {} };
  let aiPick = aiNow.provider || "claude";
  const cards = h("div", { className: "modes" });
  const key = h("input", { type: "password", autocomplete: "off", placeholder: aiNow.hasKey ? "Chave salva (deixe vazio pra manter)" : "Chave da API" });
  const base = h("input", { type: "url", value: aiNow.baseUrl ?? "", placeholder: "https://api.openai.com/v1" });
  const tiers = { top: h("input", { maxLength: 120 }), best: h("input", { maxLength: 120 }), cheap: h("input", { maxLength: 120 }) };
  const extra = h("div", { className: "pref__control" });
  const status = h("p", {}, "Checando…");

  const showStatus = (problem) =>
    status.replaceChildren(
      problem
        ? h("span", { className: "tag tag--down" }, problem)
        : h("span", { className: "tag tag--ok" }, icon("check"), `${titleOf(aiNow.provider || "claude")} pronto`),
      problem && HELP[aiNow.provider || "claude"] ? h("small", { className: "settings__help" }, " ", HELP[aiNow.provider || "claude"]) : null,
    );
  const check = () => brainProblem(true).then(showStatus);

  function paint() {
    cards.replaceChildren(...AIS.map(([item, title, text]) => h("button", { type: "button", className: "mode", role: "radio", "aria-checked": String(aiPick === item), onclick: () => ((aiPick = item), paint()) }, h("strong", {}, title), h("small", {}, text))));
    const defaults = AIS.find(([item]) => item === aiPick)[3];
    for (const [tier, node] of Object.entries(tiers)) {
      node.placeholder = defaults[tier] || "padrão da conta";
      node.value = aiPick === aiNow.provider ? aiNow.models?.[tier] ?? "" : "";
    }
    const usesKey = ["openrouter", "deepseek", "openai"].includes(aiPick);
    extra.replaceChildren(
      usesKey ? field("Chave da API", key) : "",
      aiPick === "openai" ? field("Endereço da API", base) : "",
      aiPick !== "claude" ? h("details", { className: "settings__advanced" }, h("summary", {}, "Modelos (avançado)"), h("div", { className: "resume__grid" }, field("Caprichado (cartas, dossiê)", tiers.top), field("Equilibrado (nota de vaga)", tiers.best), field("Rápido (extração, títulos)", tiers.cheap))) : "",
    );
  }

  async function save() {
    await api("radar/integrations/ai", { method: "POST", body: { provider: aiPick, key: key.value, baseUrl: base.value, models: Object.fromEntries(Object.entries(tiers).map(([tier, node]) => [tier, node.value.trim()])) } });
    key.value = "";
    Object.assign(aiNow, { provider: aiPick });
    status.replaceChildren(h("span", { className: "spinner" }), " Trocando… o serviço de IA confere em até 30 s.");
    setTimeout(check, 35_000);
  }

  const use = h("button", { type: "button", className: "btn btn--primary" }, icon("check"), "Usar esta IA");
  use.addEventListener("click", async () => {
    use.disabled = true;
    try {
      await save();
    } catch (error) {
      toast(error.message);
    } finally {
      use.disabled = false;
    }
  });
  const again = h("button", { type: "button", className: "btn btn--ghost", onclick: () => (status.replaceChildren(h("span", { className: "spinner" }), " Checando…"), check()) }, "Verificar de novo");

  paint();
  check();
  return { nodes: [cards, extra, h("div", { className: "import__row" }, use, again, status)], changed: () => aiPick !== (aiNow.provider || "claude") || Boolean(key.value), save };
}
