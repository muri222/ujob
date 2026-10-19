import { api, create, update } from "../core/api.js";
import { CATEGORIES, STATES, WORKPLACES } from "../core/catalog.js";
import { ctx } from "../core/context.js";
import { cat, h, icon, toast } from "../core/dom.js";
import { fold, loadCities } from "../core/places.js";
import { segmented } from "../core/ui.js";

export function welcome({ force = false } = {}) {
  if (document.querySelector(".welcome")) return;
  const profile = ctx.profile ?? {};
  const picked = new Set(profile.categories ?? []);
  let workplace = profile.workplace ?? "";
  let step = 0;

  const name = h("input", { type: "text", value: profile.name ?? "", placeholder: "Como te chamamos?", maxLength: 80, autocomplete: "given-name" });
  const state = h("select", {}, h("option", { value: "" }, "Todo o Brasil"), Object.entries(STATES).map(([code, label]) => h("option", { value: code, selected: code === profile.state }, label)));
  const city = h("input", { type: "text", value: profile.city ?? "", placeholder: "Comece a digitar (opcional)", maxLength: 80, list: "welcome-cities", autocomplete: "off" });
  const cityList = h("datalist", { id: "welcome-cities" });
  const fillCities = async () => {
    const all = await loadCities();
    cityList.replaceChildren(...all.filter((item) => !state.value || item.state === state.value).slice(0, 900).map((item) => h("option", { value: item.name })));
  };
  state.addEventListener("change", () => ((city.value = ""), fillCities()));
  fillCities();
  const counter = h("span", { className: "welcome__counter" });

  const tiles = Object.entries(CATEGORIES).map(([key, text]) => {
    const tile = h("button", { type: "button", className: "area-tile", "aria-pressed": String(picked.has(key)) }, cat(key, 40), h("span", {}, text));
    tile.addEventListener("click", () => {
      picked.has(key) ? picked.delete(key) : picked.add(key);
      tile.setAttribute("aria-pressed", String(picked.has(key)));
      tile.animate([{ transform: "scale(0.94)" }, { transform: "scale(1)" }], { duration: 320, easing: "cubic-bezier(0.34, 1.5, 0.64, 1)" });
      counter.textContent = picked.size ? `${picked.size} ${picked.size === 1 ? "área" : "áreas"}` : "";
    });
    return tile;
  });

  const steps = [
    h(
      "section",
      { className: "welcome__step" },
      h("p", { className: "eyebrow" }, icon("sparkle"), "Passo 1 de 2"),
      h("h2", {}, "Qual é o seu segmento?"),
      h("p", { className: "lead" }, "Escolha uma ou mais áreas. A gente busca só o que interessa, sem encher o painel de coisa aleatória."),
      h("div", { className: "area-grid stagger" }, tiles.map((tile, i) => (tile.style.setProperty("--i", i), tile))),
    ),
    h(
      "section",
      { className: "welcome__step" },
      h("p", { className: "eyebrow" }, icon("pin"), "Passo 2 de 2"),
      h("h2", {}, "Onde você quer trabalhar?"),
      h("p", { className: "lead" }, "Vale estado, cidade ou o Brasil todo. Dá pra mudar quando quiser."),
      h("label", { className: "field" }, h("span", {}, "Seu nome"), name),
      h("div", { className: "welcome__row" }, h("label", { className: "field" }, h("span", {}, "Estado"), state), h("label", { className: "field" }, h("span", {}, "Cidade"), city, cityList)),
      h("div", { className: "field" }, h("span", {}, "Modalidade"), segmented([["", "Tanto faz"], ...Object.entries(WORKPLACES)], workplace, (value) => (workplace = value), "Modalidade")),
    ),
  ];

  const back = h("button", { type: "button", className: "btn btn--ghost" }, "Voltar");
  const next = h("button", { type: "button", className: "btn btn--primary btn--lg" }, "Continuar", icon("arrow"));
  const body = h("div", { className: "welcome__body" });
  const dialog = h(
    "dialog",
    { className: "welcome" },
    h("div", { className: "welcome__progress" }, h("i")),
    body,
    h("footer", { className: "welcome__foot" }, back, counter, next),
  );

  function show() {
    body.replaceChildren(steps[step]);
    back.hidden = step === 0 && !force;
    back.textContent = step === 0 ? "Agora não" : "Voltar";
    next.replaceChildren(step === steps.length - 1 ? "Buscar minhas vagas" : "Continuar", icon(step === steps.length - 1 ? "radar" : "arrow"));
    dialog.style.setProperty("--progress", `${((step + 1) / steps.length) * 100}%`);
    steps[step].animate([{ opacity: 0, transform: "translateX(16px)" }, { opacity: 1, transform: "none" }], { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  }

  back.addEventListener("click", () => (step === 0 ? dialog.close() : (step--, show())));
  next.addEventListener("click", async () => {
    if (step < steps.length - 1) {
      if (!picked.size) {
        toast("Escolha pelo menos uma área.");
        return;
      }
      step++;
      show();
      return;
    }
    const typed = city.value.trim();
    const found = typed ? (await loadCities()).find((item) => item.key === fold(typed) && (!state.value || item.state === state.value)) : null;
    if (typed && !found) {
      toast("Escolhe a cidade na lista, com o nome certinho.");
      city.focus();
      return;
    }
    next.disabled = true;
    const data = { name: name.value.trim(), categories: [...picked], state: found?.state ?? state.value, city: found?.name ?? "", workplace };
    try {
      ctx.profile = profile.id ? await update("profile", profile.id, data) : await create("profile", data);
      const { search } = await api("ujob/search", { method: "POST", body: { category: data.categories[0], state: data.state, city: data.city, workplace: data.workplace } });
      dialog.close();
      location.hash = `#buscar/${search.id}`;
    } catch {
      toast("Não deu pra salvar. Tenta de novo.");
    } finally {
      next.disabled = false;
    }
  });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("cancel", (event) => !force && !ctx.profile && event.preventDefault());

  document.body.append(dialog);
  show();
  dialog.showModal();
}
