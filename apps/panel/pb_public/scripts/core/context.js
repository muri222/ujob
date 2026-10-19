import { api, create, list, update } from "./api.js";
import { listen } from "./realtime.js";

const applications = new Map();
const subscribers = new Set();

export const ctx = {
  profile: null,
  profiles: [],
  refreshCounts: () => {},
};

const PROFILE_KEY = "radar:profile";

export function storedProfile() {
  try {
    return localStorage.getItem(PROFILE_KEY);
  } catch {
    return null;
  }
}

export function useProfile(id) {
  try {
    localStorage.setItem(PROFILE_KEY, id);
  } catch {}
}

// filtro do perfil ativo, para applications e searches
export const mine = (filter = "") => [`profile = '${ctx.profile?.id ?? ""}'`, filter].filter(Boolean).map((part) => `(${part})`).join(" && ");

export async function loadApplications() {
  const { items } = await list("applications", { perPage: 500, fields: "id,job,stage", filter: mine("job != ''") });
  applications.clear();
  for (const item of items) applications.set(item.job, item);
}

export const applicationFor = (jobId) => applications.get(jobId) ?? null;

export function onApplications(handler, signal) {
  subscribers.add(handler);
  signal?.addEventListener("abort", () => subscribers.delete(handler));
}

const notify = () => {
  for (const handler of subscribers) handler();
  ctx.refreshCounts();
};

export async function track(job, stage) {
  const current = applications.get(job.id);
  const now = new Date().toISOString();
  const record = current
    ? await update("applications", current.id, { stage, ...(stage === "aplicada" && !current.appliedAt ? { appliedAt: now } : {}) })
    : await create("applications", {
        job: job.id,
        profile: ctx.profile?.id,
        title: job.title,
        company: job.company,
        companyLogo: job.companyLogo,
        url: job.applyUrl || job.url,
        stage,
        position: Date.now() / 1000,
        appliedAt: stage === "aplicada" ? now : "",
        contactEmail: job.contactEmail,
        contactPhone: job.contactWhatsapp || job.contactPhone,
      });
  applications.set(job.id, { id: record.id, job: job.id, stage: record.stage });
  notify();
  return record;
}

export async function untrack(job) {
  const current = applications.get(job.id);
  if (!current) return;
  await api(`collections/applications/records/${current.id}`, { method: "DELETE" });
  applications.delete(job.id);
  notify();
}

// notas da IA (tarefas job_fit) do perfil ativo, por vaga
const fits = new Map();
const fitWatchers = new Set();

export async function loadFits() {
  if (!ctx.profile) return;
  const { items } = await list("ai_tasks", { perPage: 500, sort: "updatedAt", fields: "ref,status,result,error,profile,type,updatedAt", filter: mine("type = 'job_fit'") });
  for (const item of items) fits.set(item.ref, item);
  listen("ai_tasks", ({ record }) => {
    if (record.type !== "job_fit" || record.profile !== ctx.profile?.id) return;
    fits.set(record.ref, record);
    for (const watcher of fitWatchers) watcher(record.ref);
  });
}

export const fitFor = (jobId) => fits.get(jobId) ?? null;

// avisa quando a nota de uma vaga muda; para sozinho quando o nó sai da tela
export function onFit(node, handler) {
  const watcher = (ref) => (node.isConnected ? handler(ref) : fitWatchers.delete(watcher));
  fitWatchers.add(watcher);
}

export async function requestFit(jobIds) {
  const { created } = await api("radar/fit", { method: "POST", body: { profile: ctx.profile?.id, jobs: jobIds } });
  for (const id of jobIds) if (!fits.has(id) || fits.get(id).status === "failed") fits.set(id, { ref: id, status: "queued" });
  return created;
}

// pede uma tarefa curta ao Claude e espera o resultado pelo realtime
export function askClaude(type, payload, { timeout = 120_000 } = {}) {
  return new Promise(async (resolve, reject) => {
    let task;
    const stop = new AbortController();
    const finish = (settle, value) => (clearTimeout(timer), stop.abort(), settle(value));
    const timer = setTimeout(() => finish(reject, new Error("O Claude demorou demais. Tenta de novo.")), timeout);
    listen(
      "ai_tasks",
      ({ record }) => {
        if (!task || record.id !== task.id) return;
        if (record.status === "done") finish(resolve, record.result);
        if (record.status === "failed") finish(reject, new Error(record.error || "O Claude não conseguiu."));
      },
      stop.signal,
    );
    try {
      task = await create("ai_tasks", { type, profile: ctx.profile?.id, ref: "", status: "queued", payload, attempts: 0 });
    } catch (error) {
      finish(reject, error);
    }
  });
}

let brainCache = null;

// motivo pelo qual o Claude do PC não vai responder, ou null se está pronto
export async function brainProblem(force = false) {
  if (force || !brainCache || Date.now() - brainCache.at > 60_000) brainCache = { at: Date.now(), data: await api("radar/brain").catch(() => null) };
  const data = brainCache.data;
  if (!data?.at || Date.now() - Date.parse(data.at) > 3 * 60_000) return "O serviço de IA do Radar está desligado. Feche e abra o app.";
  return data.problem;
}

let statsCache = null;

export async function stats(force = false) {
  if (!force && statsCache && Date.now() - statsCache.at < 30_000) return statsCache.data;
  const data = await api(`ujob/stats?profile=${ctx.profile?.id ?? ""}`);
  statsCache = { at: Date.now(), data };
  return data;
}

export const asMap = (rows = []) => Object.fromEntries(rows.filter((row) => row.key).map((row) => [row.key, row.total]));
