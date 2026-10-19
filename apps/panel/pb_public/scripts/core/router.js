function match(pattern, path) {
  const want = pattern.split("/");
  const got = path.split("/");
  if (want.length !== got.length) return null;
  const params = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(":")) params[want[i].slice(1)] = decodeURIComponent(got[i]);
    else if (want[i] !== got[i]) return null;
  }
  return params;
}

async function transition(update) {
  let done = false;
  const run = () => {
    done = true;
    update();
  };
  if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return run();
  try {
    await document.startViewTransition(run).updateCallbackDone;
  } catch {
    if (!done) run();
  }
}

export function createRouter(routes, outlet, { fallback, onChange }) {
  let current = null;
  let lastHash = location.hash;

  async function go() {
    if (current?.canLeave && !(await current.canLeave())) {
      history.replaceState(null, "", lastHash);
      return;
    }
    const [path, search = ""] = (location.hash.slice(1) || "inicio").split("?");
    if (current?.path === path && current.onQuery) {
      lastHash = location.hash;
      current.onQuery(new URLSearchParams(search));
      return;
    }
    current?.controller.abort();

    const found = routes.map(([pattern, view]) => [pattern, view, match(pattern, path)]).find(([, , params]) => params);
    const [pattern, view, params] = found ?? ["404", fallback, {}];
    const controller = new AbortController();
    const root = document.createElement("section");
    root.className = `view view--${pattern.split("/")[0]}`;

    lastHash = location.hash;
    current = { controller, path };
    onChange(pattern);

    await transition(() => {
      outlet.replaceChildren(root);
      scrollTo(0, 0);
      outlet.scrollTop = 0;
    });

    try {
      Object.assign(current, await view(root, { params, query: new URLSearchParams(search), signal: controller.signal }));
    } catch (error) {
      if (controller.signal.aborted) return;
      root.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: "Essa tela tropeçou. Recarrega que passa." }));
      throw error;
    }
  }

  addEventListener("hashchange", go);
  addEventListener("beforeunload", (event) => {
    if (current?.dirty?.()) event.preventDefault();
  });
  return { start: go };
}
