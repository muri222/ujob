import { queueTour } from "../core/tour.js";
import { api, create, remove, update } from "../core/api.js";
import { CATEGORIES, CONTRACTS, SENIORITY, STATES } from "../core/catalog.js";
import { askClaude, brainProblem, ctx, useProfile } from "../core/context.js";
import { AUTH, COUNTRIES, COUNTRY, countryLabel } from "../core/countries.js";
import { h, icon, toast } from "../core/dom.js";
import { listen } from "../core/realtime.js";
import { picks, tags } from "../core/ui.js";
import { mergeResume } from "./resume.js";
import { runSearch } from "./search.js";

// Configuração inicial (igual AiApply): função, currículo, cargos, países e visto, preferências e modo.
// Roda na primeira vez, ao criar função nova (fresh) e em "Ajustar" (force). Sai com o painel funcionando.
const CV_FIELDS = ["name", "headline", "email", "phone", "about", "skills", "experiences", "education", "languages", "links", "city", "state", "letter", "template"];
const MODES = [
  ["revisao", "Modo revisão", "Você escolhe cada vaga. Nada sai sem você."],
  ["hibrido", "Modo híbrido", "O Claude prepara sozinho as vagas com nota alta; você só confirma."],
  ["auto", "Modo automático", "Sai sozinho do seu e-mail, até o limite diário."],
];
const SITUATIONS = [["", "Selecione…"], ["desempregado_urgente", "Desempregado e preciso de emprego"], ["desempregado", "Desempregado, mas sem pressa"], ["insatisfeito", "Empregado e quero mudar"], ["aberto", "Empregado, mas aberto a oportunidades"], ["freela", "Procurando freelas e projetos"]];

const field = (label, control, hint) => h("label", { className: "field" }, h("span", {}, label), control, hint ? h("small", {}, hint) : null);
const select = (options, value, onPick) => {
  const node = h("select", {}, options.map(([key, text]) => h("option", { value: key, selected: key === (value ?? "") }, text)));
  node.addEventListener("change", () => onPick(node.value));
  return node;
};
const input = (value, onSet, props = {}) => {
  const node = h("input", { value: value ?? "", ...props });
  node.addEventListener("input", () => onSet(node.value.trim()));
  return node;
};

export function welcome({ force = false, fresh = false } = {}) {
  if (document.querySelector(".welcome")) return;
  const base = ctx.profile ?? {};
  const editing = !fresh && Boolean(base.id);
  // rascunho da função: tudo é salvo no fim (e ao sair do passo 1, pra poder subir o PDF)
  const draft = {
    label: editing ? base.label ?? "" : "",
    name: base.name ?? "",
    email: base.email ?? "",
    phone: base.phone ?? "",
    links: [...(base.links ?? [])],
    categories: editing ? [...(base.categories ?? [])] : [],
    seniority: editing ? base.seniority ?? "" : base.seniority ?? "",
    salary: base.salary || "",
    city: base.city ?? "",
    state: base.state ?? "",
    sendMode: editing ? base.sendMode || "revisao" : "revisao",
    dailyCap: base.dailyCap || 10,
    threshold: base.threshold || 70,
    countries: (base.countries ?? []).filter((place) => COUNTRY[place.code]).map((place) => ({ ...place, modes: [...(place.modes ?? ["remoto"])], cities: [...(place.cities ?? [])] })),
    prefs: { roles: [], contracts: [], situation: "", start: "", relocate: "", currency: "BRL", exclude: [], worldwide: false, queueCap: 15, ...(base.prefs ?? {}) },
  };
  if (!editing) draft.prefs = { ...draft.prefs, roles: [], rejects: { roles: [], skills: [] } };
  draft.prefs.roles = [...(draft.prefs.roles ?? [])];
  draft.prefs.contracts = [...(draft.prefs.contracts ?? [])];
  draft.prefs.exclude = [...(draft.prefs.exclude ?? [])];
  if (!draft.countries.length) draft.countries.push({ code: "BR", modes: ["remoto", "presencial"], cities: [], auth: "cidadao" });
  let copyCv = fresh && Boolean(base.id);
  let record = editing ? base : null;
  let createdHere = false;
  let step = 0;

  const linkOf = (pattern) => draft.links.find((link) => pattern.test(link)) ?? "";
  const setLink = (pattern, value) => {
    const at = draft.links.findIndex((link) => pattern.test(link));
    if (at >= 0) draft.links.splice(at, 1);
    if (value) draft.links.unshift(value);
  };

  async function persist(extra = {}) {
    const body = { ...draft, ...extra };
    if (copyCv && !record) for (const key of CV_FIELDS) if (base[key] !== undefined && !["name", "email", "phone", "links"].includes(key)) body[key] = base[key];
    if (!record) {
      record = await create("profile", { kind: "pessoa", ...body });
      createdHere = true;
    } else {
      record = await update("profile", record.id, body);
    }
    return record;
  }

  // ── passo 1: função e contato
  function stepFunction() {
    return h(
      "section",
      { className: "welcome__step" },
      h("p", { className: "eyebrow" }, icon("sparkle"), "Passo 1 de 6"),
      h("h2", {}, editing ? "Ajuste sua função" : base.id ? "Nova função" : "Vamos montar seu uJob"),
      h("p", { className: "lead" }, "Uma função é um tipo de vaga que você procura (ex.: Artista 3D, Editor de Vídeo). Cada uma tem currículo, países, buscas e painel próprios."),
      field("Nome da função", input(draft.label, (value) => (draft.label = value), { maxLength: 60, placeholder: "Ex.: 3D Generalist, Editor de Vídeo, Designer Gráfico", required: true })),
      h("div", { className: "welcome__row" }, field("Seu nome completo", input(draft.name, (value) => (draft.name = value), { maxLength: 80, autocomplete: "name" })), field("E-mail", input(draft.email, (value) => (draft.email = value), { type: "email", autocomplete: "email" }))),
      h("div", { className: "welcome__row" }, field("Telefone / WhatsApp", input(draft.phone, (value) => (draft.phone = value), { maxLength: 30, autocomplete: "tel" })), field("LinkedIn", input(linkOf(/linkedin\.com/i), (value) => setLink(/linkedin\.com/i, value), { type: "url", placeholder: "https://linkedin.com/in/..." }))),
      field("Portfólio", input(linkOf(/^(?!.*linkedin\.com)/i), (value) => setLink(/^(?!.*linkedin\.com)/i, value), { type: "url", placeholder: "https://behance.net/..., ArtStation, site" })),
      fresh && base.id
        ? h("label", { className: "check" }, h("input", { type: "checkbox", checked: copyCv, onchange: (event) => (copyCv = event.target.checked) }), h("span", {}, `Começar com o currículo de ${base.label || "Principal"} (dá pra adaptar depois)`))
        : null,
    );
  }

  // ── passo 2: currículo (PDF ou site lido no PC, Claude organiza)
  function stepResume() {
    const status = h("div", { className: "import" });
    const summary = () => {
      const cv = record ?? {};
      return [cv.headline, `${(cv.experiences ?? []).length} experiências`, `${(cv.skills ?? []).length} habilidades`, cv.resume ? "PDF guardado" : null].filter(Boolean).join(" · ");
    };
    const paint = (message) =>
      status.replaceChildren(
        (record?.experiences ?? []).length || record?.headline ? h("p", { className: "tag tag--ok" }, icon("check"), " ", summary()) : h("p", { className: "settings__help" }, "Ainda sem currículo nesta função."),
        message ? h("p", { className: message.error ? "fit__err" : "fit__ai" }, message.busy ? h("span", { className: "spinner" }) : null, message.text) : null,
      );
    const runImport = async (body) => {
      const problem = await brainProblem(true);
      if (problem) return paint({ error: true, text: problem });
      paint({ busy: true, text: "Lendo no seu PC e organizando com o Claude…" });
      try {
        const { task } = await api("radar/cv/import", { method: "POST", body: { ...body, profile: record.id } });
        const stop = new AbortController();
        listen(
          "ai_tasks",
          async ({ record: done }) => {
            if (done.id !== task || !["done", "failed"].includes(done.status)) return;
            stop.abort();
            if (done.status === "failed") return paint({ error: true, text: done.error || "A importação falhou." });
            const merged = mergeResume({ ...record }, done.result, "fill");
            record = await update("profile", record.id, Object.fromEntries(CV_FIELDS.filter((key) => merged[key] !== undefined).map((key) => [key, merged[key]])));
            for (const key of ["name", "email", "phone"]) if (!draft[key] && record[key]) draft[key] = record[key];
            draft.links = [...new Set([...draft.links, ...(record.links ?? [])])];
            paint({ text: "Pronto! Confira e ajuste depois em Currículo." });
          },
          stop.signal,
        );
      } catch (error) {
        paint({ error: true, text: error.message });
      }
    };
    const upload = h("input", { type: "file", accept: "application/pdf", hidden: true });
    upload.addEventListener("change", async () => {
      const file = upload.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) return toast("O PDF passa de 5 MB.");
      const form = new FormData();
      form.append("resume", file);
      try {
        record = await api(`collections/profile/records/${record.id}`, { method: "PATCH", body: form });
        runImport({ source: "pdf" });
      } catch {
        paint({ error: true, text: "Não deu pra enviar o PDF." });
      }
    });
    const site = h("input", { type: "url", placeholder: "Ou o link do seu portfólio / site", maxLength: 500 });
    paint();
    return h(
      "section",
      { className: "welcome__step" },
      h("p", { className: "eyebrow" }, icon("file"), "Passo 2 de 6"),
      h("h2", {}, "Seu currículo"),
      h("p", { className: "lead" }, "Mande o PDF (ou o link do portfólio). O arquivo é lido no seu PC e o Claude só organiza os campos. É a base das notas, das cartas e do CV adaptado."),
      h("div", { className: "welcome__choices" }, h("button", { type: "button", className: "btn btn--primary", onclick: () => upload.click() }, icon("upload"), "Enviar PDF do currículo"), upload),
      h("div", { className: "import__row" }, site, h("button", { type: "button", className: "btn btn--soft", onclick: () => site.value.trim() && runImport({ source: "url", url: site.value.trim() }) }, icon("external"), "Ler site")),
      status,
    );
  }

  // ── passo 3: cargos, nível, contrato, áreas
  function stepRoles() {
    const box = h("div", { className: "pref__control" });
    const ask = h("button", { type: "button", className: "btn btn--soft" }, icon("sparkle"), "Sugerir cargos com o Claude");
    const drawRoles = () => box.replaceChildren(tags(draft.prefs.roles, () => {}, { placeholder: "Ex.: 3D Generalist, Character Artist (Enter pra adicionar)", suggestions: (record?.headline ?? "").split(/[·|,/]/).map((part) => part.trim()).filter((part) => part.length > 2) }), h("div", { className: "import__row" }, ask));
    const suggest = async () => {
      if (await brainProblem()) return;
      ask.disabled = true;
      try {
        // o nome da função manda (o CV pode ser de outra área quando foi copiado)
        const found = await askClaude("job_query", { text: `Vagas de ${draft.label}`, perfil: { funcao: draft.label, skills: (record?.skills ?? []).slice(0, 15) } }, { timeout: 60_000 });
        for (const term of found.terms) if (!draft.prefs.roles.some((role) => role.toLowerCase() === term.toLowerCase())) draft.prefs.roles.push(term);
        if (found.category && !draft.categories.includes(found.category)) draft.categories.push(found.category);
        drawRoles();
        areaBox.replaceChildren(picks(Object.entries(CATEGORIES), draft.categories, () => {}));
      } catch (error) {
        toast(error.message);
      } finally {
        ask.disabled = false;
      }
    };
    ask.addEventListener("click", suggest);
    drawRoles();
    const areaBox = h("div", {}, picks(Object.entries(CATEGORIES), draft.categories, () => {}));
    if (!draft.prefs.roles.length) suggest();
    return h(
      "section",
      { className: "welcome__step" },
      h("p", { className: "eyebrow" }, icon("briefcase"), "Passo 3 de 6"),
      h("h2", {}, "Que vagas você quer?"),
      h("p", { className: "lead" }, "Os cargos viram as buscas nos portais e o filtro do painel. Coloque em português e inglês pra pegar vaga de fora."),
      h("div", { className: "field" }, h("span", {}, "Cargos"), box),
      h("div", { className: "welcome__row" }, field("Nível de experiência", select([["", "Qualquer"], ...Object.entries(SENIORITY)], draft.seniority, (value) => (draft.seniority = value))), field("Situação atual", select(SITUATIONS, draft.prefs.situation, (value) => (draft.prefs.situation = value)))),
      h("div", { className: "field" }, h("span", {}, "Tipo de trabalho aceito"), picks(Object.entries(CONTRACTS).filter(([key]) => !["talentos", "outro"].includes(key)), draft.prefs.contracts, () => {})),
      h("details", { className: "settings__advanced" }, h("summary", {}, "Áreas que o radar acompanha (opcional)"), areaBox),
    );
  }

  // ── passo 4: países, modalidade e autorização de trabalho (visto)
  function stepCountries() {
    const chosen = h("div", { className: "places" });
    const filter = h("input", { type: "search", placeholder: "Buscar país" });
    const grid = h("div", { className: "quick welcome__countries" });
    const drawGrid = () => {
      const term = filter.value.trim().toLowerCase();
      grid.replaceChildren(
        ...COUNTRIES.filter(([code]) => code !== "WW")
          .filter(([, pt, en]) => !term || pt.toLowerCase().includes(term) || en.toLowerCase().includes(term))
          .map(([code]) => {
            const on = draft.countries.some((place) => place.code === code);
            return h(
              "button",
              {
                type: "button",
                className: "chip",
                "aria-pressed": String(on),
                onclick: () => {
                  const at = draft.countries.findIndex((place) => place.code === code);
                  if (at >= 0) draft.countries.splice(at, 1);
                  else draft.countries.push({ code, modes: ["remoto"], cities: [], auth: code === "BR" ? "cidadao" : "" });
                  drawGrid();
                  drawChosen();
                },
              },
              countryLabel(code),
            );
          }),
      );
    };
    const drawChosen = () =>
      chosen.replaceChildren(
        ...draft.countries.map((place) =>
          h(
            "div",
            { className: "place" },
            h("strong", {}, countryLabel(place.code)),
            h("div", { className: "welcome__row" }, field("Autorização de trabalho", select(AUTH, place.auth, (value) => (place.auth = value))), field("Cidades (opcional)", input((place.cities ?? []).join(", "), (value) => (place.cities = value.split(",").map((city) => city.trim()).filter(Boolean)), { placeholder: "Ex.: Lisboa, Porto" }))),
            picks([["remoto", "Remoto"], ["presencial", "Presencial / Híbrido"]], place.modes, () => {}),
          ),
        ),
        draft.countries.length ? "" : h("p", { className: "fit__err" }, "Escolha pelo menos um país ou marque o mundo todo."),
      );
    filter.addEventListener("input", drawGrid);
    drawGrid();
    drawChosen();
    const homeState = select([["", "Estado (se for no Brasil)"], ...Object.entries(STATES)], draft.state, (value) => (draft.state = value));
    return h(
      "section",
      { className: "welcome__step" },
      h("p", { className: "eyebrow" }, icon("globe"), "Passo 4 de 6"),
      h("h2", {}, "Onde você quer trabalhar?"),
      h("p", { className: "lead" }, "O uJob busca no mundo todo. Escolha os países principais e diga se tem permissão de trabalho ou precisa de visto: isso filtra vaga que exige autorização que você não tem."),
      h("label", { className: "check welcome__world" }, h("input", { type: "checkbox", checked: draft.prefs.worldwide, onchange: (event) => (draft.prefs.worldwide = event.target.checked) }), h("span", {}, h("strong", {}, "🌍 Aceito vaga remota de qualquer lugar do mundo"), h("small", {}, " Empresas de fora que contratam remoto (PJ/contractor)."))),
      h("label", { className: "search welcome__search" }, icon("search"), filter),
      grid,
      chosen,
      h("div", { className: "welcome__row" }, field("Cidade onde você mora", input(draft.city, (value) => (draft.city = value), { maxLength: 80 })), field("Estado", homeState)),
      field("Aceita se mudar pelo emprego?", select([["", "Selecione…"], ["sim", "Sim"], ["talvez", "Depende da vaga"], ["nao", "Não"]], draft.prefs.relocate, (value) => (draft.prefs.relocate = value))),
    );
  }

  // ── passo 5: salário e preferências
  function stepPrefs() {
    const asap = h("button", { type: "button", className: "chip", "aria-pressed": String(draft.prefs.start === "asap") }, "Imediato");
    const date = input(draft.prefs.start === "asap" ? "" : draft.prefs.start, (value) => ((draft.prefs.start = value), asap.setAttribute("aria-pressed", "false")), { type: "date" });
    asap.addEventListener("click", () => {
      draft.prefs.start = draft.prefs.start === "asap" ? "" : "asap";
      asap.setAttribute("aria-pressed", String(draft.prefs.start === "asap"));
      date.value = "";
    });
    return h(
      "section",
      { className: "welcome__step" },
      h("p", { className: "eyebrow" }, icon("money"), "Passo 5 de 6"),
      h("h2", {}, "Salário e preferências"),
      h("p", { className: "lead" }, "Entra na nota do Claude e nas respostas dos formulários. Pode deixar em branco."),
      h("div", { className: "welcome__row" }, field("Moeda", select([["BRL", "R$ (real)"], ["USD", "US$ (dólar)"], ["EUR", "€ (euro)"], ["GBP", "£ (libra)"]], draft.prefs.currency, (value) => (draft.prefs.currency = value))), field("Expectativa mensal", input(draft.salary, (value) => (draft.salary = Number(value) || 0), { type: "number", min: 0 }))),
      h("div", { className: "field" }, h("span", {}, "Quando pode começar"), h("div", { className: "import__row" }, date, asap)),
      h("div", { className: "field" }, h("span", {}, "Empresas que você não quer (opcional)"), tags(draft.prefs.exclude, () => {}, { placeholder: "Ex.: Empresa X" })),
    );
  }

  // ── passo 6: como candidatar
  function stepMode() {
    const wrap = h("div", { className: "modes" });
    const draw = () => wrap.replaceChildren(...MODES.map(([key, title, text]) => h("button", { type: "button", className: "mode", role: "radio", "aria-checked": String(draft.sendMode === key), onclick: () => ((draft.sendMode = key), draw()) }, h("strong", {}, title), h("small", {}, text))));
    draw();
    return h(
      "section",
      { className: "welcome__step" },
      h("p", { className: "eyebrow" }, icon("send"), "Passo 6 de 6"),
      h("h2", {}, "Como você quer se candidatar?"),
      h("p", { className: "lead" }, "Dá pra mudar a qualquer hora. Envio por e-mail precisa do seu e-mail configurado em Config. da conta."),
      wrap,
      h("div", { className: "welcome__row" }, field("Limite de candidaturas por dia", input(draft.dailyCap, (value) => (draft.dailyCap = Math.max(1, Math.min(100, Number(value) || 10))), { type: "number", min: 1, max: 100 })), field("Nota mínima do Claude pra candidatar sozinho", input(draft.threshold, (value) => (draft.threshold = Math.max(50, Math.min(95, Number(value) || 70))), { type: "number", min: 50, max: 95, step: 5 }))),
    );
  }

  const STEPS = [stepFunction, stepResume, stepRoles, stepCountries, stepPrefs, stepMode];
  const back = h("button", { type: "button", className: "btn btn--ghost" }, "Voltar");
  const skip = h("button", { type: "button", className: "btn btn--ghost" }, "Pular");
  const next = h("button", { type: "button", className: "btn btn--primary btn--lg" }, "Continuar", icon("arrow"));
  const body = h("div", { className: "welcome__body" });
  const dialog = h("dialog", { className: "welcome" }, h("div", { className: "welcome__progress" }, h("i")), body, h("footer", { className: "welcome__foot" }, back, h("span", { className: "welcome__counter" }), skip, next));

  function show() {
    const node = STEPS[step]();
    body.replaceChildren(node);
    back.hidden = step === 0 && !force && !base.id;
    back.textContent = step === 0 ? "Cancelar" : "Voltar";
    skip.hidden = ![1, 4].includes(step);
    next.replaceChildren(step === STEPS.length - 1 ? "Montar meu painel" : "Continuar", icon(step === STEPS.length - 1 ? "radar" : "arrow"));
    dialog.style.setProperty("--progress", `${((step + 1) / STEPS.length) * 100}%`);
    node.animate([{ opacity: 0, transform: "translateX(16px)" }, { opacity: 1, transform: "none" }], { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    body.scrollTop = 0;
  }

  async function forward() {
    if (step === 0 && !draft.label.trim()) return toast("Dê um nome pra função (ex.: Artista 3D).");
    if (step === 2 && !draft.prefs.roles.length) return toast("Coloque pelo menos um cargo (ou use Sugerir cargos).");
    if (step === 3 && !draft.countries.length && !draft.prefs.worldwide) return toast("Escolha pelo menos um país ou o mundo todo.");
    next.disabled = true;
    try {
      if (step === 0 || step === STEPS.length - 1) await persist();
      if (step < STEPS.length - 1) {
        step++;
        show();
        return;
      }
      await finish();
    } catch {
      toast("Não deu pra salvar. Tenta de novo.");
    } finally {
      next.disabled = false;
    }
  }

  async function finish() {
    // modalidade geral: só remoto se todos os países forem só remoto
    const onlyRemote = draft.countries.every((place) => place.modes.length === 1 && place.modes[0] === "remoto");
    record = await persist({ workplace: onlyRemote ? "remoto" : "" });
    ctx.profile = record;
    useProfile(record.id);
    createdHere = false;
    if (!ctx.profiles?.length) queueTour();
    dialog.close();
    const countries = [...draft.countries.map((place) => place.code), ...(draft.prefs.worldwide ? ["WW"] : [])];
    toast("Painel montado. Buscando as primeiras vagas nos seus países…");
    await runSearch({ terms: draft.prefs.roles.slice(0, 8), countries, prompt: draft.label }, { saved: true }).catch(() => (location.hash = "#inicio"));
    location.reload();
  }

  back.addEventListener("click", () => (step === 0 ? dialog.close() : (step--, show())));
  skip.addEventListener("click", () => (step++, show()));
  next.addEventListener("click", forward);
  dialog.addEventListener("close", () => {
    // função nova abandonada no meio não fica pela metade na lista
    if (createdHere && record) remove("profile", record.id).catch(() => {});
    dialog.remove();
  });
  dialog.addEventListener("cancel", (event) => !force && !base.id && event.preventDefault());

  document.body.append(dialog);
  show();
  dialog.showModal();
}
