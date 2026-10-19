import { api, list } from "../core/api.js";
import { CATEGORIES } from "../core/catalog.js";
import { askClaude, asMap, brainProblem, ctx, mine, stats } from "../core/context.js";
import { cat, h, icon, stagger, toast } from "../core/dom.js";
import { ago, number } from "../core/format.js";
import { dotGrid, magnet, rotatingText } from "../core/fx.js";
import { describe, fromParams } from "../core/query.js";
import { profileCountries } from "../core/countries.js";
import { createSentence } from "../core/sentence.js";

const ROLES = ["vendedor", "enfermeira", "motorista", "dev", "professora", "designer", "analista", "cozinheiro", "estágio"];
const STATUS = { queued: ["Na fila", "tag"], running: ["Buscando", "tag tag--brand"], done: ["Pronta", "tag tag--ok"], error: ["Falhou", "tag tag--down"], canceled: ["Trocada", "tag"] };

export async function runSearch(query, { saved = false } = {}) {
  // país escolhido na frase manda; senão, os países da função (Brasil se não tiver nenhum)
  const countries = query.countries ?? (query.country ? [query.country] : query.state || query.city ? ["BR"] : profileCountries(ctx.profile));
  const { search, reused } = await api("ujob/search", { method: "POST", body: { ...query, countries, saved, profile: ctx.profile?.id } });
  if (reused && search.status === "done") toast("Essa busca é fresquinha. Mostrando o resultado na hora.");
  location.hash = `#buscar/${search.id}`;
}

export default async function search(root, { query, signal }) {
  const profile = ctx.profile ?? {};
  const initial = Object.keys(fromParams(query)).length
    ? fromParams(query)
    : { category: profile.categories?.[0], state: profile.state, city: profile.city, workplace: profile.workplace };
  for (const key of Object.keys(initial)) if (!initial[key] || !["term", "category", "state", "city", "workplace", "contract", "country"].includes(key)) delete initial[key];

  const data = await stats().catch(() => null);
  const counts = { category: asMap(data?.category), state: asMap(data?.state), workplace: asMap(data?.workplace), contract: asMap(data?.contract) };
  const sentence = createSentence({ query: initial, counts });
  const go = h("button", { className: "btn btn--primary btn--lg hero__go" }, icon("radar"), "Buscar agora");
  const keep = h("label", { className: "hero__keep" }, h("input", { type: "checkbox" }), h("span", {}, "Salvar e me avisar quando entrar vaga nova"));

  async function submit() {
    go.disabled = true;
    go.classList.add("is-busy");
    try {
      await runSearch(sentence.value(), { saved: keep.querySelector("input").checked });
    } catch {
      toast("Não deu pra disparar a busca.");
      go.disabled = false;
      go.classList.remove("is-busy");
    }
  }
  go.addEventListener("click", submit);
  magnet(go);

  // busca descrita: o Claude (Haiku) vira o texto em termos PT/EN + filtros; serve pra função bem específica
  const described = h("textarea", { rows: 2, maxLength: 500, placeholder: "Ex.: character artist pra jogos, remoto, de preferência empresa gringa" });
  const describeGo = h("button", { className: "btn btn--soft" }, icon("sparkle"), "Buscar com IA");
  const describeNote = h("p", { className: "hero__hint" });
  async function submitDescribed() {
    const text = described.value.trim();
    if (!text) return described.focus();
    const problem = await brainProblem(true);
    if (problem) return toast(problem);
    describeGo.disabled = true;
    describeNote.replaceChildren(h("span", { className: "spinner" }), " Entendendo o que você procura…");
    try {
      const found = await askClaude("job_query", { text, perfil: { headline: profile.headline, skills: profile.skills, categories: profile.categories, state: profile.state, city: profile.city, workplace: profile.workplace } }, { timeout: 60_000 });
      describeNote.textContent = found.explicacao;
      // termos mandam: a área do classificador erra em função específica e cortaria vaga boa
      const query = Object.fromEntries(Object.entries({ terms: found.terms, state: found.state, city: found.city, workplace: found.workplace, contract: found.contract, prompt: text }).filter(([, value]) => (Array.isArray(value) ? value.length : value)));
      await runSearch(query, { saved: keep.querySelector("input").checked });
    } catch (error) {
      describeNote.textContent = error.message;
    } finally {
      describeGo.disabled = false;
    }
  }
  describeGo.addEventListener("click", submitDescribed);
  described.addEventListener("keydown", (event) => event.key === "Enter" && !event.shiftKey && (event.preventDefault(), submitDescribed()));

  const quick = (profile.categories ?? []).slice(0, 6).map((key) =>
    h("button", { className: "chip", onclick: () => runSearch({ category: key, state: profile.state, city: profile.city, workplace: profile.workplace }) }, cat(key, 18), CATEGORIES[key]),
  );

  root.append(
    h(
      "section",
      { className: "hero" },
      h("p", { className: "eyebrow" }, icon("radar"), "Nova busca"),
      h("h1", { className: "hero__title" }, "Tem vaga de ", rotatingText(ROLES, { signal }), " esperando por você."),
      sentence,
      h("div", { className: "hero__actions" }, go, keep),
      h("div", { className: "hero__describe" }, h("span", { className: "eyebrow" }, icon("sparkle"), "Ou descreva com suas palavras"), h("div", { className: "hero__describe-row" }, described, describeGo), describeNote),
      h("p", { className: "hero__hint" }, "Toque nas partes destacadas pra mudar. A gente vasculha portais, empresas, comunidades e o acervo do ujob na hora, e as vagas vão chegando enquanto você olha."),
      quick.length > 0 && h("div", { className: "hero__quick" }, h("span", {}, "Seus atalhos"), quick),
    ),
  );

  dotGrid(root.querySelector(".hero"));
  if (query.get("go")) submit();

  const { items } = await list("searches", { sort: "-requestedAt", perPage: 12, filter: mine() });
  if (!items.length) return;
  root.append(
    h(
      "section",
      { className: "section" },
      h("header", { className: "section__head" }, h("h2", {}, "Buscas recentes"), h("a", { href: "#alertas" }, "Salvas", icon("arrow"))),
      h(
        "ul",
        { className: "recent stagger" },
        stagger(
          items.map((item) => {
            const [text, tone] = STATUS[item.status] ?? STATUS.done;
            return h(
              "li",
              {},
              h(
                "a",
                { href: `#buscar/${item.id}`, className: "recent__item" },
                cat(item.category || "outros"),
                h("span", { className: "recent__text" }, h("strong", {}, item.name || describe(item)), h("small", {}, `${ago(item.requestedAt)} · ${number(item.found)} encontradas`)),
                item.saved && icon("bell"),
                h("span", { className: tone }, text),
              ),
            );
          }),
        ),
      ),
    ),
  );
}
