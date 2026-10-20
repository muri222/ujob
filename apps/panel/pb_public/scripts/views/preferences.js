import { api, list, quote, remove, update } from "../core/api.js";
import { CATEGORIES, CONTRACTS, SENIORITY, STATES } from "../core/catalog.js";
import { askClaude, brainProblem, ctx } from "../core/context.js";
import { h, header, icon, toast } from "../core/dom.js";
import { picks, segmented, tags } from "../core/ui.js";
import { AUTH, COUNTRIES, COUNTRY, countryLabel } from "../core/countries.js";

// Preferências da função ativa, nas mesmas abas do AiApply. Tudo entra na nota do Claude, no Auto Apply e nas candidaturas.
const TABS = [
  ["rapidas", "Configs rápidas"],
  ["perfil", "Perfil e currículo"],
  ["vaga", "Preferências de vaga"],
  ["respostas", "Biblioteca de respostas"],
  ["rejeicao", "Motivos de rejeição"],
];

const MODES = [
  ["auto", "Modo automático", "Economiza tempo, sem aprovação", "Totalmente automático. O Claude acha vagas boas e envia a candidatura do seu e-mail, dentro do limite diário."],
  ["hibrido", "Modo híbrido", "Melhor dos dois mundos", "Equilíbrio entre velocidade e controle. Vagas com nota alta viram candidatura pronta sozinhas; você só confirma."],
  ["revisao", "Modo revisão", "Revise e aprove cada vaga", "Controle total. Nada é preparado nem enviado sem você pedir."],
];

const SITUATIONS = [
  ["", "Selecione…"],
  ["desempregado_urgente", "Desempregado e preciso de emprego"],
  ["desempregado", "Desempregado, mas sem pressa"],
  ["insatisfeito", "Empregado e quero mudar"],
  ["aberto", "Empregado, mas aberto a oportunidades"],
  ["freela", "Procurando freelas e projetos"],
];

const UNSAID = [["", "Prefiro não dizer"]];
const IDENTITY = [
  ["race", "Como você se identifica (raça/cor)?", [...UNSAID, ["branca", "Branca"], ["preta", "Preta"], ["parda", "Parda"], ["amarela", "Amarela"], ["indigena", "Indígena"]]],
  ["gender", "Qual o seu gênero?", [...UNSAID, ["mulher", "Mulher"], ["homem", "Homem"], ["nao_binario", "Não binário"], ["outro", "Outro"]]],
  ["trans", "Você se identifica como pessoa trans?", [...UNSAID, ["sim", "Sim"], ["nao", "Não"]]],
  ["pcd", "Você é PcD (pessoa com deficiência)?", [...UNSAID, ["sim", "Sim"], ["nao", "Não"]]],
];

// perguntas que formulários de vaga mais fazem; respondidas uma vez, o Claude reusa nas candidaturas
const COMMON = [
  "Qual a sua pretensão salarial mensal (R$)?",
  "Qual a sua pretensão anual em dólar (vagas internacionais)?",
  "Quando você pode começar?",
  "Quantos anos de experiência você tem na área?",
  "Qual o seu nível de inglês?",
  "Você precisa de patrocínio de visto?",
  "Aceita mudar de cidade ou país?",
  "Link do portfólio",
  "Link do LinkedIn",
  "Por que você quer trabalhar nesta empresa? (resposta base)",
  "Conte um projeto do qual você se orgulha",
  "Como ficou sabendo da vaga?",
];

const blankPrefs = () => ({ situation: "", roles: [], contracts: [], relocate: "", start: "", currency: "BRL", exclude: [], cnh: "", identity: {}, queueCap: 15, rejects: { roles: [], skills: [] } });

export default async function preferences(root, { query }) {
  if (!ctx.profile) {
    root.append(header("Preferências", null), h("div", { className: "empty card" }, h("strong", {}, "Crie sua primeira função"), "Use o seletor no topo do menu."));
    return;
  }
  const profile = ctx.profile;
  const prefs = { ...blankPrefs(), ...(profile.prefs || {}) };
  prefs.rejects = { roles: [], skills: [], ...(prefs.rejects || {}) };
  const places = Array.isArray(profile.countries) ? profile.countries : [];
  const answers = Array.isArray(profile.answers) ? profile.answers : [];
  const categories = [...(profile.categories ?? [])];
  const links = [...(profile.links ?? [])];

  // salva só o que esta tela mexe, com atraso curto (várias mudanças viram um PATCH)
  const pending = {};
  let timer;
  const saved = h("span", { className: "settings__state" });
  const save = (patch) => {
    Object.assign(pending, patch);
    saved.textContent = "Salvando…";
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const body = { ...pending };
      for (const key of Object.keys(pending)) delete pending[key];
      try {
        ctx.profile = await update("profile", profile.id, body);
        Object.assign(profile, ctx.profile);
        saved.textContent = "Salvo";
      } catch {
        saved.textContent = "Não salvou. Tente de novo.";
      }
    }, 600);
  };
  const savePrefs = () => save({ prefs });

  const row = (label, help, ...control) => h("div", { className: "pref" }, h("div", { className: "pref__label" }, h("strong", {}, label), help && h("small", {}, help)), h("div", { className: "pref__control" }, control));
  const select = (options, value, onPick) => {
    const node = h("select", {}, options.map(([key, text]) => h("option", { value: key, selected: key === (value ?? "") }, text)));
    node.addEventListener("change", () => onPick(node.value));
    return node;
  };
  const input = (value, onSet, props = {}) => {
    const node = h("input", { value: value ?? "", ...props });
    node.addEventListener("change", () => onSet(node.value.trim()));
    return node;
  };
  const block = (title, ...rows) => h("section", { className: "panel prefs__block" }, h("h2", {}, title), rows);
  const slider = (value, min, max, step, unit, onSet, help) => {
    const label = h("strong", { className: "num" }, value);
    const range = h("input", { type: "range", min, max, step, value });
    range.addEventListener("input", () => (label.textContent = range.value));
    range.addEventListener("change", () => onSet(Number(range.value)));
    return h("div", { className: "pref__slider" }, h("p", {}, label, " ", unit), range, help && h("small", {}, help));
  };

  function modeCards() {
    const current = () => profile.sendMode || "revisao";
    const wrap = h("div", { className: "modes", role: "radiogroup" });
    const draw = () =>
      wrap.replaceChildren(
        ...MODES.map(([key, title, badge, text]) =>
          h(
            "button",
            { type: "button", className: "mode", role: "radio", "aria-checked": String(current() === key), onclick: () => (save({ sendMode: key }), (profile.sendMode = key), draw(), key === "auto" && toast("Automático ligado. Confira o limite diário e a nota mínima.")) },
            h("strong", {}, title, " ", h("span", { className: "tag" }, badge)),
            h("small", {}, text),
          ),
        ),
      );
    draw();
    return wrap;
  }

  // sugestões: pedaços do título do CV; o botão pede ao Claude (Haiku) cargos reais em PT e EN
  const rolesBox = () => {
    const suggestions = (profile.headline ?? "").split(/[·|,/]/).map((part) => part.trim()).filter((part) => part.length > 2);
    const box = h("div", { className: "pref__control" });
    const ask = h("button", { type: "button", className: "btn btn--soft" }, icon("sparkle"), "Sugerir com Claude");
    ask.addEventListener("click", async () => {
      const problem = await brainProblem(true);
      if (problem) return toast(problem);
      ask.disabled = true;
      try {
        const found = await askClaude("job_query", { text: `Cargos para a função ${profile.label || ""}. ${profile.headline || ""}`, perfil: { headline: profile.headline, skills: profile.skills } }, { timeout: 60_000 });
        for (const term of found.terms) if (!prefs.roles.some((role) => role.toLowerCase() === term.toLowerCase())) prefs.roles.push(term);
        savePrefs();
        draw();
      } catch (error) {
        toast(error.message);
      } finally {
        ask.disabled = false;
      }
    });
    const draw = () => box.replaceChildren(tags(prefs.roles, savePrefs, { placeholder: "Ex.: 3D Generalist, Character Artist", suggestions }), h("div", { className: "import__row" }, ask));
    draw();
    return box;
  };

  const unanswered = () => COMMON.filter((question) => !answers.some((item) => item.q === question && item.a?.trim())).length;

  function quick() {
    const runNow = h("button", { type: "button", className: "btn btn--soft" }, icon("radar"), "Rodar agora");
    runNow.addEventListener("click", async () => {
      if ((profile.sendMode || "revisao") === "revisao") return toast("Escolha Híbrido ou Automático primeiro.");
      runNow.disabled = true;
      try {
        const { queued } = await api("radar/autoapply/run", { method: "POST" });
        toast(queued ? `${queued} vagas novas na fila de avaliação do Claude.` : "Nenhuma vaga nova com e-mail pra essa função agora.");
      } finally {
        runNow.disabled = false;
      }
    });
    const missing = unanswered();
    return [
      missing
        ? h("div", { className: "banner" }, h("span", {}, h("strong", {}, `${missing} perguntas comuns de candidatura sem resposta`), h("small", {}, "Responda uma vez e o Claude reusa em toda candidatura.")), h("button", { className: "btn btn--primary", onclick: () => show("respostas") }, "Abrir biblioteca"))
        : null,
      block("Modo de candidatura", modeCards(), h("div", { className: "import__row" }, runNow)),
      block(
        "Volume de candidaturas",
        row("Limite diário", "Máximo de envios por dia nesta função.", slider(profile.dailyCap || 10, 1, 100, 1, "candidaturas", (value) => save({ dailyCap: value }))),
        row("Vagas aguardando revisão", "No Híbrido, o Claude para de preparar quando a fila chega aqui, até você revisar.", slider(prefs.queueCap, 5, 50, 5, "vagas por vez", (value) => ((prefs.queueCap = value), savePrefs()))),
        row("Nota mínima", "Só vagas com essa nota do Claude ou mais viram candidatura sozinhas.", slider(profile.threshold || 70, 50, 95, 5, "de compatibilidade ou mais", (value) => save({ threshold: value }))),
      ),
      block("Cargos", row("Cargos que você procura nesta função", "Usados no Auto Apply, no painel e na nota do Claude.", rolesBox())),
    ];
  }

  async function perfil() {
    const others = ctx.profiles.filter((item) => item.id !== profile.id);
    const copy = h("button", { type: "button", className: "btn btn--soft" }, icon("copy"), "Copiar currículo");
    const from = select(others.map((item) => [item.id, item.label || item.name || "Sem nome"]), others[0]?.id, () => {});
    copy.addEventListener("click", async () => {
      const source = others.find((item) => item.id === from.value);
      if (!source) return;
      const fields = ["headline", "about", "skills", "experiences", "education", "languages", "links", "email", "phone", "city", "state"];
      save(Object.fromEntries(fields.map((key) => [key, source[key]])));
      toast(`Currículo copiado de ${source.label || source.name}. Ajuste o que for diferente nesta função.`);
    });
    const cv = [
      profile.headline,
      `${(profile.experiences ?? []).length} experiências`,
      `${(profile.skills ?? []).length} habilidades`,
      profile.resume ? "PDF enviado" : "sem PDF",
    ].filter(Boolean);
    const linkedin = links.find((link) => /linkedin\.com/i.test(link)) ?? "";
    const setLink = (pattern, value) => {
      const at = links.findIndex((link) => pattern.test(link));
      if (at >= 0) links.splice(at, 1);
      if (value) links.unshift(value);
      save({ links });
    };
    return [
      block(
        "Currículo desta função",
        row("Currículo base", "Cada função pode ter um currículo diferente (ex.: um pra 3D, outro pra edição).", h("p", { className: "settings__help" }, cv.join(" · ")), h("div", { className: "import__row" }, h("a", { className: "btn btn--primary", href: "#curriculo" }, icon("edit"), "Editar currículo"), h("a", { className: "btn btn--soft", href: "#curriculo" }, icon("sparkle"), "Importar com Claude"))),
        others.length ? row("Copiar de outra função", "Traz CV, links e contatos de outra função pra cá.", h("div", { className: "import__row" }, from, copy)) : null,
      ),
      block(
        "Esta função",
        row("Nome da função", "Como aparece no seletor do menu (ex.: 3D Generalista, Editor de Vídeo).", input(profile.label, (value) => (save({ label: value }), (document.querySelector(".side__fn-name").textContent = value || "Principal")), { maxLength: 60 })),
      ),
      block(
        "Info pessoal",
        row("Nome completo", null, input(profile.name, (value) => save({ name: value }), { maxLength: 80 })),
        row("E-mail", null, input(profile.email, (value) => save({ email: value }), { type: "email" })),
        row("Telefone", null, input(profile.phone, (value) => save({ phone: value }), { maxLength: 30 })),
        row("LinkedIn", null, input(linkedin, (value) => setLink(/linkedin\.com/i, value), { type: "url", placeholder: "https://linkedin.com/in/..." })),
        row("Portfólio", null, input(links.find((link) => !/linkedin\.com/i.test(link)) ?? "", (value) => setLink(/^(?!.*linkedin\.com)/i, value), { type: "url", placeholder: "https://..." })),
      ),
    ];
  }

  // países da função (lista fixa com código ISO: é o que a busca e o filtro entendem)
  function placesBox() {
    const wrap = h("div", { className: "places" });
    const changed = () => save({ countries: places });
    function draw() {
      const free = COUNTRIES.filter(([code]) => code !== "WW" && !places.some((place) => place.code === code));
      const adder = select([["", "+ Adicionar país…"], ...free.map(([code]) => [code, countryLabel(code)])], "", (code) => {
        if (!code) return;
        places.push({ code, cities: [], modes: ["remoto"], auth: code === "BR" ? "cidadao" : "" });
        changed();
        draw();
      });
      wrap.replaceChildren(
        ...places.filter((place) => COUNTRY[place.code]).map((place) =>
          h(
            "div",
            { className: "place" },
            h("div", { className: "import__row" }, h("strong", { className: "pref__country" }, countryLabel(place.code)), h("button", { type: "button", className: "icon-btn", "aria-label": "Remover", onclick: () => (places.splice(places.indexOf(place), 1), changed(), draw()) }, icon("close"))),
            input((place.cities ?? []).join(", "), (value) => ((place.cities = value.split(",").map((city) => city.trim()).filter(Boolean)), changed()), { placeholder: "Cidades (opcional, separadas por vírgula)" }),
            picks([["remoto", "Remoto"], ["presencial", "Presencial / Híbrido"]], (place.modes ??= ["remoto"]), changed),
          ),
        ),
        h("label", { className: "check" }, h("input", { type: "checkbox", checked: Boolean(prefs.worldwide), onchange: (event) => ((prefs.worldwide = event.target.checked), savePrefs()) }), h("span", {}, "🌍 Aceito vaga remota de qualquer lugar do mundo")),
        adder,
      );
    }
    draw();
    return wrap;
  }

  function eligibility() {
    const named = places.filter((place) => COUNTRY[place.code]);
    if (!named.length) return h("small", {}, "Adicione países em \"Onde gostaria de trabalhar\".");
    return h(
      "div",
      { className: "places" },
      named.map((place) => h("div", { className: "import__row" }, h("span", { className: "pref__country" }, countryLabel(place.code)), select(AUTH, place.auth, (value) => ((place.auth = value), save({ countries: places }))))),
    );
  }

  function vaga() {
    return [
      block(
        "Função e experiência",
        row("Sua situação de emprego", null, select(SITUATIONS, prefs.situation, (value) => ((prefs.situation = value), savePrefs()))),
        row("Cargos desejados", null, rolesBox()),
        row("Nível de experiência almejado", null, select([["", "Qualquer"], ...Object.entries(SENIORITY)], profile.seniority, (value) => save({ seniority: value }))),
        row("Setores / áreas", "As áreas que o radar acompanha nesta função.", picks(Object.entries(CATEGORIES), categories, () => save({ categories }))),
        row("Tipo de trabalho aceito", null, picks(Object.entries(CONTRACTS).filter(([key]) => !["talentos", "outro"].includes(key)), prefs.contracts, savePrefs)),
      ),
      block(
        "Local e horário",
        row("Onde você mora", null, h("div", { className: "import__row" }, input(profile.city, (value) => save({ city: value }), { placeholder: "Cidade" }), select([["", "Estado"], ...Object.entries(STATES)], profile.state, (value) => save({ state: value })))),
        row("Modalidade preferida", null, select([["", "Tanto faz"], ["remoto", "Remoto"], ["hibrido", "Híbrido"], ["presencial", "Presencial"]], profile.workplace, (value) => save({ workplace: value }))),
        row("Onde gostaria de trabalhar?", "Países e se aceita remoto ou presencial em cada um.", placesBox()),
        row("Aceita mudar de cidade pelo emprego?", null, select([["", "Selecione…"], ["sim", "Sim"], ["talvez", "Depende da vaga"], ["nao", "Não"]], prefs.relocate, (value) => ((prefs.relocate = value), savePrefs()))),
        row(
          "Quando você pode começar?",
          null,
          h(
            "div",
            { className: "import__row" },
            input(prefs.start === "asap" ? "" : prefs.start, (value) => ((prefs.start = value), savePrefs()), { type: "date" }),
            h("button", { type: "button", className: "chip", "aria-pressed": String(prefs.start === "asap"), onclick: (event) => ((prefs.start = prefs.start === "asap" ? "" : "asap"), event.currentTarget.setAttribute("aria-pressed", String(prefs.start === "asap")), savePrefs()) }, "Imediato"),
          ),
        ),
      ),
      block(
        "Remuneração",
        row("Expectativa salarial (mensal)", null, h("div", { className: "import__row" }, select([["BRL", "R$"], ["USD", "US$"], ["EUR", "€"], ["GBP", "£"]], prefs.currency, (value) => ((prefs.currency = value), savePrefs())), input(profile.salary || "", (value) => save({ salary: Number(value) || 0 }), { type: "number", min: 0 }))),
      ),
      block("Filtragem", row("Empresas pra excluir", "Nunca aparecem no Auto Apply nem no painel desta função.", tags(prefs.exclude, savePrefs, { placeholder: "Ex.: Empresa X" }))),
      block(
        "Elegibilidade",
        row("Autorização de trabalho por país", null, eligibility()),
        row("Possui carteira de motorista?", null, select([["", "Prefiro não informar"], ["sim", "Sim"], ["nao", "Não"]], prefs.cnh, (value) => ((prefs.cnh = value), savePrefs()))),
      ),
      block(
        "Autoidentificação voluntária",
        h("p", { className: "settings__help" }, "Opcional. Só é usado pra responder formulários que perguntam isso. Nunca vai pro Claude avaliar vaga."),
        ...IDENTITY.map(([key, label, options]) => row(label, null, select(options, prefs.identity[key], (value) => ((prefs.identity[key] = value), savePrefs())))),
      ),
    ];
  }

  function respostas() {
    const changed = () => save({ answers });
    const wrap = h("div", { className: "answers" });
    const filter = h("input", { type: "search", placeholder: "Buscar respostas" });
    function draw() {
      for (const question of COMMON) if (!answers.some((item) => item.q === question)) answers.push({ q: question, a: "" });
      const term = filter.value.trim().toLowerCase();
      wrap.replaceChildren(
        ...answers
          .map((item, index) => [item, index])
          .filter(([item]) => !term || `${item.q} ${item.a}`.toLowerCase().includes(term))
          .map(([item, index]) => {
            const answer = h("textarea", { rows: 2, maxLength: 2000, value: item.a ?? "", placeholder: "Sua resposta" });
            answer.addEventListener("change", () => ((item.a = answer.value.trim()), changed()));
            return h(
              "div",
              { className: "answer" },
              h("div", { className: "import__row" }, h("strong", {}, item.q), item.a?.trim() ? h("span", { className: "tag tag--ok" }, "Respondida") : h("span", { className: "tag" }, "Sugerida"), COMMON.includes(item.q) ? null : h("button", { type: "button", className: "icon-btn", "aria-label": "Apagar", onclick: () => (answers.splice(index, 1), changed(), draw()) }, icon("close"))),
              answer,
            );
          }),
      );
    }
    filter.addEventListener("input", draw);
    const add = h("button", { type: "button", className: "btn btn--primary" }, icon("plus"), "Adicionar resposta");
    add.addEventListener("click", () => {
      const question = filter.value.trim() || "Nova pergunta";
      answers.unshift({ q: question, a: "" });
      filter.value = "";
      changed();
      draw();
    });
    draw();
    return [h("div", { className: "import__row" }, filter, add), h("p", { className: "settings__help" }, "Responda as perguntas comuns uma vez. O Claude usa nas cartas e, na F2, pra preencher formulários de vaga sozinho."), wrap];
  }

  async function rejeicao() {
    const facts = await list("mind_facts", { filter: `profile = ${quote(profile.id)} && status = 'aprovado' && kind = 'restricao'`, sort: "-updatedAt", perPage: 100 }).catch(() => ({ items: [] }));
    const learned = h(
      "ul",
      { className: "rejects" },
      facts.items.map((fact) => {
        const item = h("li", {}, h("span", {}, fact.text), h("small", {}, fact.origin), h("button", { type: "button", className: "icon-btn", "aria-label": "Apagar", onclick: async () => (await remove("mind_facts", fact.id).catch(() => {}), item.remove()) }, icon("close")));
        return item;
      }),
    );
    return [
      h("p", { className: "settings__help" }, "O uJob aprende com as vagas que você recusa e com o que você marca aqui. Vagas parecidas ficam com nota menor e saem do Auto Apply."),
      block("Cargos que não quero", tags(prefs.rejects.roles, savePrefs, { placeholder: "Ex.: Vagas de engenharia, Animação 2D" })),
      block("Habilidades que não tenho", tags(prefs.rejects.skills, savePrefs, { placeholder: "Ex.: Unreal Engine, After Effects" })),
      block("Aprendido com suas recusas", facts.items.length ? learned : h("small", {}, "Ainda nada. Recuse uma vaga com o botão Não quero (tecla N)."), h("a", { href: "#mente" }, "Ver tudo na Mente ", icon("arrow"))),
    ];
  }

  const body = h("div", { className: "prefs__body" });
  const tabs = segmented(TABS.map(([key, text]) => [key, text]), "rapidas", (key) => show(key), "Seções");
  const VIEWS = { rapidas: quick, perfil, vaga, respostas, rejeicao };
  async function show(key) {
    tabs.set(key);
    history.replaceState(null, "", `#preferencias?aba=${key}`);
    body.replaceChildren(h("p", { className: "fit__ai" }, h("span", { className: "spinner" })));
    body.replaceChildren(...[await VIEWS[key]()].flat().filter(Boolean));
  }

  root.append(header("Preferências", `Função: ${profile.label || "Principal"}. Tudo aqui entra na nota do Claude, no Auto Apply e nas candidaturas.`, saved), h("div", { className: "prefs__tabs" }, tabs), body);
  await show(VIEWS[query.get("aba")] ? query.get("aba") : "rapidas");
}
