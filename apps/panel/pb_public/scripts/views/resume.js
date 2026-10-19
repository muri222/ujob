import { api, create, update } from "../core/api.js";
import { CATEGORIES, SENIORITY, STATES } from "../core/catalog.js";
import { brainProblem, ctx } from "../core/context.js";
import { confirm, h, header, icon, toast } from "../core/dom.js";
import { DEFAULT_LETTER } from "../core/letter.js";
import { SKILLS } from "../core/match.js";
import { fold, isCity, loadCities } from "../core/places.js";
import { listen } from "../core/realtime.js";
import { segmented } from "../core/ui.js";

const TEMPLATES = [["classico", "Clássico"], ["moderno", "Moderno"], ["compacto", "Compacto"]];
const SAVE_DELAY = 700;

const blankExperience = () => ({ role: "", company: "", start: "", end: "", text: "" });
const blankEducation = () => ({ course: "", school: "", end: "" });
const SCALARS = ["name", "headline", "email", "phone", "city", "state", "about", "seniority"];
const LISTS = ["skills", "languages", "links"];

// junta o CV importado: "fill" só completa o vazio, "replace" troca pelo importado (sem apagar o que veio vazio)
function mergeResume(p, cv, mode) {
  const has = (value) => (Array.isArray(value) ? value.length : Boolean(value));
  for (const key of SCALARS) if (has(cv[key]) && (mode === "replace" || !has(p[key]))) p[key] = cv[key];
  for (const key of LISTS) p[key] = mode === "replace" && has(cv[key]) ? cv[key] : [...new Set([...(p[key] ?? []), ...(cv[key] ?? [])])].slice(0, 40);
  for (const key of ["experiences", "education"]) {
    const filled = (p[key] ?? []).filter((item) => Object.values(item).some(Boolean));
    if (has(cv[key]) && (mode === "replace" || !filled.length)) p[key] = cv[key];
  }
  return p;
}

function completeness(p) {
  const checks = [p.name, p.headline, p.email || p.phone, p.city, p.about?.length > 60, (p.skills ?? []).length >= 4, (p.experiences ?? []).some((item) => item.role), (p.education ?? []).some((item) => item.course), (p.languages ?? []).length];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function paper(p) {
  const contact = [p.email, p.phone, [p.city, p.state].filter(Boolean).join("/"), ...(p.links ?? [])].filter(Boolean);
  const section = (title, ...content) => (content.flat().filter(Boolean).length ? h("section", {}, h("h3", {}, title), content) : null);
  return h(
    "article",
    { className: `paper paper--${p.template || "classico"}` },
    h("header", { className: "paper__head" }, h("h2", {}, p.name || "Seu nome"), p.headline ? h("p", { className: "paper__headline" }, p.headline) : null, h("p", { className: "paper__contact" }, contact.join("  ·  "))),
    section("Resumo", p.about ? h("p", {}, p.about) : null),
    section(
      "Experiência",
      (p.experiences ?? [])
        .filter((item) => item.role || item.company)
        .map((item) => h("div", { className: "paper__item" }, h("div", { className: "paper__line" }, h("strong", {}, [item.role, item.company].filter(Boolean).join(" · ")), h("span", {}, [item.start, item.end || (item.start ? "atual" : "")].filter(Boolean).join(" – "))), item.text ? h("p", {}, item.text) : null)),
    ),
    section(
      "Formação",
      (p.education ?? []).filter((item) => item.course).map((item) => h("div", { className: "paper__line" }, h("strong", {}, [item.course, item.school].filter(Boolean).join(" · ")), h("span", {}, item.end))),
    ),
    section("Habilidades", (p.skills ?? []).length ? h("p", { className: "paper__skills" }, p.skills.join("  ·  ")) : null),
    section("Idiomas", (p.languages ?? []).length ? h("p", {}, p.languages.join("  ·  ")) : null),
  );
}

export default async function resume(root, { signal }) {
  const p = structuredClone(ctx.profile ?? {});
  const snapshot = (value) => JSON.parse(JSON.stringify(value));
  for (const key of ["skills", "experiences", "education", "languages", "links"]) p[key] = Array.isArray(p[key]) ? p[key] : [];
  if (!p.experiences.length) p.experiences.push(blankExperience());
  if (!p.education.length) p.education.push(blankEducation());

  const status = h("span", { className: "resume__status" }, icon("check"), "Tudo salvo");
  const meter = h("div", { className: "meter" }, h("i"));
  const meterText = h("strong", { className: "num" });
  const preview = h("div", { className: "resume__paper" });
  let timer;

  // salva só o que mudou desde que a tela abriu: uma aba antiga não apaga o que foi importado ou editado em outro lugar
  function shape() {
    const full = { ...p, experiences: p.experiences.filter((item) => item.role || item.company), education: p.education.filter((item) => item.course) };
    full.salary = Number(full.salary) || 0;
    for (const key of ["id", "resume", "collectionId", "collectionName", "updated", "expand"]) delete full[key];
    return snapshot(full);
  }
  let sent = shape();
  async function persist() {
    const full = shape();
    const body = p.id ? Object.fromEntries(Object.entries(full).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(sent[key]))) : full;
    if (p.id && !Object.keys(body).length) {
      status.replaceChildren(icon("check"), "Tudo salvo");
      status.classList.remove("is-saving");
      return;
    }
    try {
      const saved = p.id ? await update("profile", p.id, body) : await create("profile", body);
      p.id = saved.id;
      ctx.profile = saved;
      sent = { ...sent, ...snapshot(body) };
      status.replaceChildren(icon("check"), "Tudo salvo");
      status.classList.remove("is-saving");
    } catch {
      status.replaceChildren(icon("close"), "Não salvou. Confere os campos.");
    }
  }

  function changed() {
    const score = completeness(p);
    meter.style.setProperty("--p", `${score}%`);
    meterText.textContent = `${score}%`;
    preview.replaceChildren(paper(p));
    status.replaceChildren(h("span", { className: "spinner" }), "Salvando");
    status.classList.add("is-saving");
    clearTimeout(timer);
    timer = setTimeout(persist, SAVE_DELAY);
  }
  signal.addEventListener("abort", () => {
    if (status.classList.contains("is-saving")) persist();
  });

  const input = (key, attrs = {}) => {
    const node = h(attrs.multiline ? "textarea" : "input", { value: p[key] ?? "", maxLength: attrs.max ?? 120, placeholder: attrs.placeholder ?? "", type: attrs.type ?? "text", rows: attrs.rows ?? 4, autocomplete: attrs.autocomplete ?? "off" });
    node.addEventListener("input", () => ((p[key] = node.value), changed()));
    return h("label", { className: "field" }, h("span", {}, attrs.label), node);
  };

  const cities = h("datalist", { id: "resume-cities" });
  const fillCities = async () => {
    const all = await loadCities();
    cities.replaceChildren(...all.filter((city) => !p.state || city.state === p.state).slice(0, 900).map((city) => h("option", { value: city.name })));
  };
  const cityInput = h("input", { value: p.city ?? "", list: "resume-cities", placeholder: "Comece a digitar", maxLength: 80 });
  cityInput.addEventListener("change", async () => {
    const value = cityInput.value.trim();
    if (value && !(await isCity(value, p.state))) {
      toast("Escolhe uma cidade da lista, com o nome certinho.");
      cityInput.value = p.city ?? "";
      return;
    }
    const match = (await loadCities()).find((city) => city.key === fold(value) && (!p.state || city.state === p.state));
    p.city = match?.name ?? "";
    if (match) p.state = match.state;
    stateSelect.value = p.state ?? "";
    cityInput.value = p.city;
    changed();
  });
  const stateSelect = h("select", {}, h("option", { value: "" }, "Estado"), Object.entries(STATES).map(([code, label]) => h("option", { value: code, selected: code === p.state }, label)));
  stateSelect.addEventListener("change", () => {
    p.state = stateSelect.value;
    p.city = "";
    cityInput.value = "";
    fillCities();
    changed();
  });
  fillCities();

  const chipsInput = (key, suggestions, placeholder) => {
    const box = h("div", { className: "chips-input" });
    const entry = h("input", { placeholder, maxLength: 40 });
    const hints = h("div", { className: "chips-input__hints" });
    const add = (value) => {
      const clean = value.trim();
      if (!clean || p[key].some((item) => fold(item) === fold(clean)) || p[key].length >= 40) return;
      p[key].push(clean);
      draw();
      changed();
    };
    function draw() {
      box.replaceChildren(
        ...p[key].map((item, index) => h("button", { type: "button", className: "chip is-on", onclick: () => (p[key].splice(index, 1), draw(), changed()) }, item, icon("close"))),
        entry,
      );
      const term = fold(entry.value);
      hints.replaceChildren(
        ...suggestions
          .filter((item) => !p[key].some((own) => fold(own) === fold(item)) && (!term || fold(item).includes(term)))
          .slice(0, 14)
          .map((item) => h("button", { type: "button", className: "chip", onclick: () => (add(item), entry.focus()) }, icon("plus"), item)),
      );
    }
    entry.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        add(entry.value);
        entry.value = "";
        draw();
      } else if (event.key === "Backspace" && !entry.value && p[key].length) {
        p[key].pop();
        draw();
        changed();
      }
    });
    entry.addEventListener("input", draw);
    box.addEventListener("click", (event) => event.target === box && entry.focus());
    draw();
    return [box, hints];
  };

  const repeat = (key, blank, fields, addLabel) => {
    const wrap = h("div", { className: "repeat" });
    function draw() {
      wrap.replaceChildren(
        ...p[key].map((item, index) =>
          h(
            "div",
            { className: "repeat__item" },
            h(
              "div",
              { className: "repeat__grid" },
              fields.map(([field, label, attrs = {}]) => {
                const node = h(attrs.multiline ? "textarea" : "input", { value: item[field] ?? "", placeholder: attrs.placeholder ?? "", maxLength: attrs.max ?? 120, rows: 3 });
                node.addEventListener("input", () => ((item[field] = node.value), changed()));
                return h("label", { className: `field${attrs.wide ? " field--wide" : ""}` }, h("span", {}, label), node);
              }),
            ),
            h("button", { type: "button", className: "icon-btn", "aria-label": "Remover", onclick: () => (p[key].splice(index, 1), draw(), changed()) }, icon("trash")),
          ),
        ),
        h("button", { type: "button", className: "btn btn--ghost", onclick: () => (p[key].push(blank()), draw()) }, icon("plus"), addLabel),
      );
    }
    draw();
    return wrap;
  };

  const areaSkills = [...new Set([...(p.categories ?? []).flatMap((key) => SKILLS.filter((skill) => fold(skill).includes(fold(CATEGORIES[key] ?? "")))), ...SKILLS])];
  const template = segmented(TEMPLATES, p.template || "classico", (value) => ((p.template = value), changed()), "Modelo");
  const seniority = h("select", {}, h("option", { value: "" }, "Prefiro não dizer"), Object.entries(SENIORITY).map(([key, label]) => h("option", { value: key, selected: key === p.seniority }, label)));
  seniority.addEventListener("change", () => ((p.seniority = seniority.value), changed()));

  const upload = h("input", { type: "file", accept: "application/pdf", hidden: true });
  upload.addEventListener("change", async () => {
    const file = upload.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast("O PDF passa de 5 MB.");
    if (!p.id) await persist();
    const form = new FormData();
    form.append("resume", file);
    try {
      ctx.profile = await api(`collections/profile/records/${p.id}`, { method: "PATCH", body: form });
      toast("PDF guardado. Ele fica junto do seu perfil.");
    } catch {
      toast("Não deu pra enviar o PDF.");
    }
  });

  // importar com Claude: o PDF/site é lido no PC (sem token) e o Claude só organiza os campos
  const importBox = h("div", { className: "import" });
  const siteInput = h("input", { type: "url", placeholder: "https://seu-portfolio.com", maxLength: 500 });
  function importIdle(message) {
    const fromPdf = h("button", { type: "button", className: "btn btn--soft", disabled: !ctx.profile?.resume, title: ctx.profile?.resume ? "" : "Envie o PDF primeiro" }, icon("file"), "Ler meu PDF");
    const fromSite = h("button", { type: "button", className: "btn btn--soft" }, icon("external"), "Ler site");
    fromPdf.addEventListener("click", () => runImport({ source: "pdf" }));
    fromSite.addEventListener("click", () => siteInput.value.trim() && runImport({ source: "url", url: siteInput.value.trim() }));
    importBox.replaceChildren(h("div", { className: "import__row" }, fromPdf, siteInput, fromSite), message ? h("p", { className: "fit__err" }, message) : "");
    brainProblem().then((problem) => problem && importBox.append(h("p", { className: "fit__err" }, problem)));
  }
  function importReady(cv) {
    const summary = [cv.headline, `${cv.experiences.length} experiências`, `${cv.skills.length} habilidades`, cv.links.length && `${cv.links.length} links`].filter(Boolean).join(" · ");
    const apply = async (mode) => {
      if (mode === "replace" && !(await confirm("Trocar os campos do currículo pelos importados?", { confirmLabel: "Substituir" }))) return;
      mergeResume(p, cv, mode);
      await persist();
      location.reload();
    };
    importBox.replaceChildren(
      h("p", {}, h("strong", {}, "O Claude organizou: "), summary),
      h("div", { className: "import__row" }, h("button", { type: "button", className: "btn btn--primary", onclick: () => apply("fill") }, icon("check"), "Completar o que está vazio"), h("button", { type: "button", className: "btn", onclick: () => apply("replace") }, "Substituir pelo importado"), h("button", { type: "button", className: "btn btn--ghost", onclick: () => importIdle() }, "Descartar")),
    );
  }
  async function runImport(body) {
    if (!p.id) await persist();
    try {
      const { task } = await api("radar/cv/import", { method: "POST", body: { ...body, profile: p.id } });
      importBox.replaceChildren(h("p", { className: "fit__ai" }, h("span", { className: "spinner" }), "Lendo no seu PC e organizando com o Claude…"));
      listen(
        "ai_tasks",
        ({ record }) => {
          if (record.id !== task) return;
          if (record.status === "done") importReady(record.result);
          if (record.status === "failed") importIdle(record.error || "A importação falhou.");
        },
        signal,
      );
    } catch (error) {
      importIdle(error.message);
    }
  }
  importIdle();

  const card = (title, lead, ...content) => h("section", { className: "panel resume__card" }, h("header", { className: "section__head" }, h("h2", {}, title), lead ? h("small", {}, lead) : null), content);
  const [skillsBox, skillsHints] = chipsInput("skills", areaSkills, "Digite e aperte Enter");
  const [langBox, langHints] = chipsInput("languages", ["Inglês básico", "Inglês intermediário", "Inglês fluente", "Espanhol básico", "Espanhol intermediário", "Espanhol fluente", "Libras"], "Ex.: Inglês intermediário");
  const [linkBox] = chipsInput("links", [], "Cole o link e aperte Enter");

  root.append(
    header(
      "Meu currículo",
      "Quanto mais completo, mais certeira fica a nota de cada vaga e melhor sai a carta de apresentação.",
      h("button", { className: "btn", onclick: () => upload.click() }, icon("upload"), "Enviar PDF"),
      h("button", { className: "btn btn--primary", onclick: () => print() }, icon("print"), "Baixar PDF"),
      upload,
    ),
    h("div", { className: "resume__bar" }, h("div", { className: "resume__meter" }, h("span", {}, "Currículo completo"), meterText, meter), status),
    h(
      "div",
      { className: "resume" },
      h(
        "div",
        { className: "resume__form" },
        card("Importar com Claude", "De um PDF ou do seu site/portfólio", importBox),
        card(
          "Sobre você",
          null,
          h(
            "div",
            { className: "resume__grid" },
            input("name", { label: "Nome completo", autocomplete: "name" }),
            input("headline", { label: "Título", placeholder: "Ex.: Vendedora com 5 anos de varejo" }),
            input("email", { label: "E-mail", type: "email", autocomplete: "email" }),
            input("phone", { label: "Telefone / WhatsApp", type: "tel", max: 30, autocomplete: "tel" }),
            h("label", { className: "field" }, h("span", {}, "Estado"), stateSelect),
            h("label", { className: "field" }, h("span", {}, "Cidade"), cityInput, cities),
            h("label", { className: "field" }, h("span", {}, "Nível"), seniority),
            input("salary", { label: "Pretensão salarial (R$)", type: "number", max: 10 }),
          ),
          h("div", { className: "field" }, h("span", {}, "Links (LinkedIn, portfólio)"), linkBox),
        ),
        card("Resumo", "2 a 4 frases", input("about", { label: "Quem é você no trabalho", multiline: true, max: 2000, rows: 5, placeholder: "Conte em poucas linhas sua experiência, o que você faz bem e o que procura." })),
        card("Habilidades", "Elas que fazem a nota subir", skillsBox, skillsHints),
        card("Experiência", null, repeat("experiences", blankExperience, [["role", "Cargo"], ["company", "Empresa"], ["start", "Início", { placeholder: "03/2022", max: 20 }], ["end", "Fim", { placeholder: "Deixe vazio se for o atual", max: 20 }], ["text", "O que você fazia", { multiline: true, wide: true, max: 1200 }]], "Adicionar experiência")),
        card("Formação", null, repeat("education", blankEducation, [["course", "Curso"], ["school", "Instituição"], ["end", "Conclusão", { placeholder: "2024 ou cursando", max: 20 }]], "Adicionar formação")),
        card("Idiomas", null, langBox, langHints),
        card(
          "Carta padrão",
          "Use {empresa}, {cargo}, {habilidades}, {nome}, {contato}",
          input("letter", { label: "Modelo da carta de apresentação", multiline: true, max: 4000, rows: 10, placeholder: DEFAULT_LETTER }),
        ),
      ),
      h("aside", { className: "resume__side" }, h("div", { className: "resume__tools" }, h("span", {}, "Modelo"), template), preview),
    ),
  );
  meter.style.setProperty("--p", `${completeness(p)}%`);
  meterText.textContent = `${completeness(p)}%`;
  preview.replaceChildren(paper(p));
}
