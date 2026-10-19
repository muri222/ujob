import { CATEGORIES, CONTRACTS, STATES, WORKPLACES } from "./catalog.js";
import { cat, h, icon } from "./dom.js";
import { number } from "./format.js";
import { busyCities, findPlaces, isCity } from "./places.js";
import { closePopover, popover } from "./popover.js";

const SUGGESTED = ["vendedor", "atendente", "auxiliar administrativo", "motorista", "enfermeiro", "professor", "desenvolvedor", "estágio", "jovem aprendiz"];

function options(entries, current, onPick, { counts = {}, iconFor } = {}) {
  return h(
    "div",
    { className: "popover__grid", role: "listbox" },
    entries.map(([value, text]) =>
      h(
        "button",
        { type: "button", className: "option", role: "option", "aria-checked": String(value === current), onclick: () => onPick(value) },
        iconFor?.(value),
        h("span", {}, text),
        counts[value] ? h("small", {}, number(counts[value])) : null,
      ),
    ),
  );
}

export function createSentence({ query, counts = {}, onChange, size = "lg" }) {
  const state = { ...query };
  const root = h("p", { className: `sentence sentence--${size}` });

  let applying = false;
  const set = (patch) => {
    Object.assign(state, patch);
    for (const key of Object.keys(state)) if (!state[key]) delete state[key];
    applying = true;
    closePopover();
    applying = false;
    render();
    onChange?.({ ...state });
  };

  const token = (text, filled, open, label) => {
    const button = h("button", { type: "button", className: filled ? "token is-filled" : "token", "aria-haspopup": "dialog", "aria-expanded": "false", "aria-label": label }, h("span", {}, text), icon("down"));
    button.addEventListener("click", () => open(button));
    return button;
  };

  function areaPicker(anchor) {
    popover(
      anchor,
      [
        h("p", { className: "popover__title" }, "Escolha a área"),
        options([["", "Qualquer área"], ...Object.entries(CATEGORIES)], state.category ?? "", (category) => set({ category }), {
          counts: counts.category ?? {},
          iconFor: (value) => (value ? cat(value) : cat("outros")),
        }),
      ],
      { width: 560 },
    );
  }

  function termPicker(anchor) {
    const input = h("input", { type: "search", value: state.term ?? "", placeholder: "Cargo, empresa ou palavra-chave", maxLength: 80, enterKeyHint: "done" });
    const form = h("form", { className: "search", onsubmit: (event) => (event.preventDefault(), set({ term: input.value.trim() })) }, icon("search"), input);
    popover(anchor, [
      form,
      h("p", { className: "popover__title" }, "Ideias rápidas"),
      h("div", { className: "chips" }, SUGGESTED.map((term) => h("button", { type: "button", className: "chip", onclick: () => set({ term }) }, term))),
      state.term && h("button", { type: "button", className: "btn btn--ghost btn--block", onclick: () => set({ term: "" }) }, icon("close"), "Limpar palavra-chave"),
    ]);
  }

  function placePicker(anchor) {
    const input = h("input", { type: "search", placeholder: "Digite uma cidade ou estado", maxLength: 40, autocomplete: "off", enterKeyHint: "search" });
    const body = h("div", { className: "places" });
    const uf = (code) => h("span", { className: "uf" }, code || "BR");
    const pickCity = (city) => pickCityNow(city);

    const cityList = (items, withCounts) =>
      h(
        "div",
        { className: "popover__grid popover__grid--cities", role: "listbox" },
        items.map((city) =>
          h(
            "button",
            { type: "button", className: "option", role: "option", "aria-checked": String(city.name === state.city && city.state === state.state), onclick: () => pickCity(city) },
            uf(city.state),
            h("span", {}, city.name),
            withCounts && city.total ? h("small", {}, number(city.total)) : null,
          ),
        ),
      );

    let pending = false;
    const pickState = (value) => {
      if (!value) return set({ state: "", city: "" });
      Object.assign(state, { state: value });
      delete state.city;
      pending = true;
      input.value = "";
      input.placeholder = `Cidade em ${STATES[value]} (opcional)`;
      draw();
      input.focus();
    };
    const pickCityNow = (city) => {
      pending = false;
      set({ state: city.state, city: city.name });
    };
    const stateGrid = (entries) => options(entries, state.state ?? "", pickState, { counts: counts.state ?? {}, iconFor: (value) => uf(value) });

    async function draw() {
      const term = input.value.trim();
      if (term) {
        const found = await findPlaces(term, "");
        found.cities.sort((a, b) => (b.state === state.state) - (a.state === state.state));
        if (input.value.trim() !== term) return;
        body.replaceChildren(
          ...[
            found.cities.length ? [h("p", { className: "popover__title" }, "Cidades"), cityList(found.cities)] : [],
            found.states.length ? [h("p", { className: "popover__title" }, "Estados"), stateGrid(found.states)] : [],
            !found.states.length && !found.cities.length ? h("p", { className: "places__none" }, "Nenhuma cidade com esse nome. Confere a grafia?") : [],
          ].flat(),
        );
        return;
      }
      const busy = state.state ? await busyCities(state.state) : [];
      if (input.value.trim()) return;
      const real = [];
      for (const row of busy) if (real.length < 12 && (await isCity(row.key, state.state))) real.push({ name: row.key, state: state.state, total: row.total });
      body.replaceChildren(
        ...[
          state.city ? h("button", { type: "button", className: "btn btn--ghost btn--block", onclick: () => set({ city: "" }) }, icon("close"), `Ver ${STATES[state.state] ?? "o estado"} inteiro`) : [],
          real.length ? [h("p", { className: "popover__title" }, `Cidades com mais vagas em ${STATES[state.state]}`), cityList(real, true)] : [],
          h("p", { className: "places__hint" }, icon("pin"), state.state ? `Digite acima pra achar qualquer cidade de ${STATES[state.state]} ou do Brasil.` : "Digite acima o nome da sua cidade, ou escolha um estado."),
          h("p", { className: "popover__title" }, "Estados"),
          stateGrid([["", "Todo o Brasil"], ...Object.entries(STATES)]),
        ].flat(),
      );
    }

    input.addEventListener("input", draw);
    draw();
    const done = h("button", { type: "button", className: "btn btn--primary btn--block places__done", onclick: () => ((pending = false), set({})) }, icon("check"), "Pronto");
    popover(anchor, [h("label", { className: "search" }, icon("pin"), input), body, done], {
      width: 580,
      onClose: () => {
        if (!pending || applying) return;
        pending = false;
        render();
        onChange?.({ ...state });
      },
    });
  }

  function listPicker(anchor, title, entries, key) {
    popover(anchor, [h("p", { className: "popover__title" }, title), options(entries, state[key] ?? "", (value) => set({ [key]: value }), { counts: counts[key] ?? {} })], { width: 320 });
  }

  function render() {
    const place = state.city ? `${state.city}${state.state ? `/${state.state}` : ""}` : STATES[state.state] ?? "todo o Brasil";
    root.replaceChildren(
      "Quero vagas de ",
      token(CATEGORIES[state.category] ?? "qualquer área", Boolean(state.category), areaPicker, "Área"),
      " ",
      token(state.term ? `“${state.term}”` : "qualquer cargo", Boolean(state.term), termPicker, "Palavra-chave"),
      " em ",
      token(place, Boolean(state.state || state.city), placePicker, "Lugar"),
      ", ",
      token(WORKPLACES[state.workplace]?.toLowerCase() ?? "qualquer modalidade", Boolean(state.workplace), (anchor) => listPicker(anchor, "Modalidade", [["", "Qualquer modalidade"], ...Object.entries(WORKPLACES)], "workplace"), "Modalidade"),
      " e ",
      token(CONTRACTS[state.contract] ?? "qualquer contrato", Boolean(state.contract), (anchor) => listPicker(anchor, "Tipo de contrato", [["", "Qualquer contrato"], ...Object.entries(CONTRACTS).filter(([key]) => !["talentos", "outro"].includes(key))], "contract"), "Contrato"),
      ".",
    );
  }

  render();
  root.value = () => ({ ...state });
  root.set = (patch) => {
    Object.assign(state, patch);
    render();
  };
  return root;
}
