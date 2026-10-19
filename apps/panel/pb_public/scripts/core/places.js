import { api } from "./api.js";
import { STATES } from "./catalog.js";

let cities = null;
const counts = new Map();

export const fold = (text) => String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export async function loadCities() {
  cities ??= fetch("assets/cities.json")
    .then((response) => response.json())
    .then((byState) => Object.entries(byState).flatMap(([state, names]) => names.map((name) => ({ name, state, key: fold(name) }))));
  return cities;
}

export async function findPlaces(term, state) {
  const wanted = fold(term);
  const all = await loadCities();
  const pool = state ? all.filter((city) => city.state === state) : all;
  if (!wanted) return { states: [], cities: [] };
  const starts = pool.filter((city) => city.key.startsWith(wanted));
  const inside = pool.filter((city) => !city.key.startsWith(wanted) && city.key.includes(wanted));
  return {
    states: state ? [] : Object.entries(STATES).filter(([code, name]) => fold(name).includes(wanted) || fold(code) === wanted),
    cities: [...starts, ...inside].slice(0, 30),
  };
}

export async function busyCities(state) {
  if (!counts.has(state)) counts.set(state, api(`ujob/cities?state=${state}`).catch(() => []));
  return counts.get(state);
}

export async function isCity(name, state) {
  const wanted = fold(name);
  return (await loadCities()).some((city) => city.key === wanted && (!state || city.state === state));
}
