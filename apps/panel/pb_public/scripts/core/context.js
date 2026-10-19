import { api, create, list, update } from "./api.js";

const applications = new Map();
const subscribers = new Set();

export const ctx = {
  profile: null,
  refreshCounts: () => {},
};

export async function loadApplications() {
  const { items } = await list("applications", { perPage: 500, fields: "id,job,stage", filter: "job != ''" });
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

let statsCache = null;

export async function stats(force = false) {
  if (!force && statsCache && Date.now() - statsCache.at < 30_000) return statsCache.data;
  const data = await api("ujob/stats");
  statsCache = { at: Date.now(), data };
  return data;
}

export const asMap = (rows = []) => Object.fromEntries(rows.filter((row) => row.key).map((row) => [row.key, row.total]));
