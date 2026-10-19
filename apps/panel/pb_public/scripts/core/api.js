import { session } from "./session.js";

const BASE = new URL("api/", new URL(".", location.href));

export class SessionError extends Error {}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || `Erro ${status}`);
    this.status = status;
    this.fields = Object.fromEntries(Object.entries(body?.data ?? {}).map(([field, info]) => [field, info.message]));
  }
}

export const quote = (value) => `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

export async function api(path, { method = "GET", body, keepalive = false, auth = true } = {}) {
  const isForm = body instanceof FormData;
  const headers = isForm ? {} : { "Content-Type": "application/json" };
  if (auth) headers.Authorization = session.token();

  const response = await fetch(new URL(path, BASE), {
    method,
    headers,
    body: body && (isForm ? body : JSON.stringify(body)),
    keepalive,
  });
  if (auth && (response.status === 401 || response.status === 403)) throw new SessionError();
  if (!response.ok) throw new ApiError(response.status, await response.json().catch(() => null));
  return response.status === 204 ? null : response.json();
}

export const list = (collection, params) => api(`collections/${collection}/records?${new URLSearchParams(params)}`);

export const get = (collection, id, params = {}) => api(`collections/${collection}/records/${id}?${new URLSearchParams(params)}`);

export const create = (collection, body) => api(`collections/${collection}/records`, { method: "POST", body });

export const update = (collection, id, body) => api(`collections/${collection}/records/${id}`, { method: "PATCH", body });

export const remove = (collection, id, keepalive = false) =>
  api(`collections/${collection}/records/${id}`, { method: "DELETE", keepalive });

export const count = async (collection, filter) =>
  (await list(collection, { filter, perPage: 1, fields: "id" })).totalItems;

export const fileUrl = (record, name, thumb) =>
  new URL(`files/${record.collectionId}/${record.id}/${encodeURIComponent(name)}${thumb ? `?thumb=${thumb}` : ""}`, BASE).href;

export async function login(identity, password) {
  const result = await api("collections/_superusers/auth-with-password", {
    method: "POST",
    body: { identity, password },
    auth: false,
  });
  session.save(result);
  return result.record;
}

export async function refresh() {
  session.save(await api("collections/_superusers/auth-refresh", { method: "POST" }));
}
