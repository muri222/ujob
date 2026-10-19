const KEY = `__pb_superusers__${location.pathname.replace(/\/[^/]*$/, "")}/_`;
const IDLE_MS = 30 * 60_000;

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

function expiresAt(token) {
  try {
    return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp * 1000;
  } catch {
    return 0;
  }
}

export const session = {
  token: () => read().token ?? "",

  user: () => read().record ?? null,

  valid() {
    const token = session.token();
    return Boolean(token) && expiresAt(token) > Date.now() + 60_000;
  },

  save({ token, record }) {
    localStorage.setItem(KEY, JSON.stringify({ token, record }));
  },

  clear() {
    localStorage.removeItem(KEY);
  },

  watchIdle(onIdle) {
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(onIdle, IDLE_MS);
    };
    for (const type of ["pointerdown", "keydown", "scroll"]) addEventListener(type, reset, { passive: true });
    reset();
  },
};
