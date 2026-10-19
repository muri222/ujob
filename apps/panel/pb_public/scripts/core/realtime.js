import { session } from "./session.js";

const BASE = new URL("api/", new URL(".", location.href));
const listeners = new Map();
let source = null;
let clientId = "";
let retry = 1000;

async function subscribe() {
  if (!clientId) return;
  await fetch(new URL("realtime", BASE), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: session.token() },
    body: JSON.stringify({ clientId, subscriptions: [...listeners.keys()] }),
  }).catch(() => {});
}

function connect() {
  source = new EventSource(new URL("realtime", BASE));
  source.addEventListener("PB_CONNECT", (event) => {
    clientId = JSON.parse(event.data).clientId;
    retry = 1000;
    subscribe();
  });
  for (const topic of listeners.keys()) bind(topic);
  source.onerror = () => {
    source.close();
    clientId = "";
    setTimeout(connect, (retry = Math.min(retry * 2, 30000)));
  };
}

function bind(topic) {
  source.addEventListener(topic, (event) => {
    const payload = JSON.parse(event.data);
    for (const handler of listeners.get(topic) ?? []) handler(payload);
  });
}

export function listen(topic, handler, signal) {
  const fresh = !listeners.has(topic);
  if (fresh) listeners.set(topic, new Set());
  listeners.get(topic).add(handler);
  if (!source) connect();
  else if (fresh) {
    bind(topic);
    subscribe();
  }
  signal?.addEventListener("abort", () => listeners.get(topic)?.delete(handler));
}
