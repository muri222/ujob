// tema salvo neste PC (conveniência por pessoa); aplicado antes da tela pintar pra não piscar
(() => {
  const KEY = "radar:theme";
  const dark = matchMedia("(prefers-color-scheme: dark)");
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch {
      return {};
    }
  };
  const apply = () => {
    const { mode = "system", palette = "areia" } = read();
    const root = document.documentElement;
    root.dataset.mode = mode === "system" ? (dark.matches ? "dark" : "light") : mode;
    if (palette === "areia") delete root.dataset.palette;
    else root.dataset.palette = palette;
  };
  dark.addEventListener("change", apply);
  window.radarTheme = {
    get: () => ({ mode: "system", palette: "areia", ...read() }),
    set(next) {
      try {
        localStorage.setItem(KEY, JSON.stringify({ ...this.get(), ...next }));
      } catch {}
      apply();
    },
  };
  apply();
})();
