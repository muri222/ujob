/// <reference path="../pb_data/types.d.ts" />

// o que o Claude recebe sobre o candidato e a vaga; usado pela nota (job_fit) e pela candidatura (apply_kit)
const plain = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function cvOf(profile) {
  const cv = {};
  for (const field of ["name", "headline", "email", "phone", "about", "skills", "experiences", "education", "languages", "links", "seniority", "city", "state", "workplace", "salary", "categories", "countries", "portfolio"]) {
    cv[field] = profile.get(field);
  }
  // preferências da função (sem a autoidentificação, que nunca entra na avaliação)
  const prefs = JSON.parse(profile.getString("prefs") || "{}") || {};
  delete prefs.identity;
  delete prefs.queueCap;
  cv.preferencias = prefs;
  const answers = JSON.parse(profile.getString("answers") || "[]") || [];
  cv.respostas_prontas = answers.filter((item) => item && item.a && String(item.a).trim()).slice(0, 40);
  return cv;
}

// cargos da função e empresas excluídas viram filtro SQL (mesma regra do painel)
function scopeOf(profile) {
  const prefs = JSON.parse(profile.getString("prefs") || "{}") || {};
  const areas = JSON.parse(profile.getString("categories") || "[]") || [];
  const roles = (prefs.roles || []).filter(Boolean).slice(0, 10);
  const exclude = (prefs.exclude || []).filter(Boolean).slice(0, 30);
  const params = {};
  const any = [...areas.map((area, i) => ((params[`a${i}`] = area), `category = {:a${i}}`)), ...roles.map((role, i) => ((params[`r${i}`] = role), `title ~ {:r${i}}`))];
  let filter = any.length ? ` && (${any.join(" || ")})` : "";
  // países da função (mesma regra do painel): Brasil tem estado; os outros vêm no texto do país; WW = remoto de fora
  const { COUNTRIES } = require(`${__hooks}/countries.js`);
  const codes = (JSON.parse(profile.getString("countries") || "[]") || []).map((place) => place && place.code).filter((code) => COUNTRIES[code]);
  if (prefs.worldwide && !codes.includes("WW")) codes.push("WW");
  const places = codes.map((code, i) => {
    if (code === "BR") return "(state != '' || country ~ 'bra')";
    if (code === "WW") return "(workplace = 'remoto' && state = '')";
    params[`c${i}`] = COUNTRIES[code].en;
    params[`p${i}`] = COUNTRIES[code].pt;
    return `(state = '' && (country ~ {:c${i}} || country ~ {:p${i}}))`;
  });
  if (places.length) filter += ` && (${places.join(" || ")})`;
  for (const [i, company] of exclude.entries()) {
    params[`x${i}`] = company;
    filter += ` && company !~ {:x${i}}`;
  }
  return { filter, params };
}

function vagaOf(job) {
  const vaga = {};
  for (const field of ["title", "company", "city", "state", "country", "workplace", "contract", "seniority", "category", "salaryMin", "salaryMax", "salaryCurrency", "tags"]) vaga[field] = job.get(field);
  vaga.description = plain(job.getString("description") || job.getString("summary")).slice(0, 8000);
  return vaga;
}

// fatos aprovados e ainda válidos da Mente
function menteOf(app, profileId) {
  const today = new Date().toISOString().replace("T", " ");
  return app
    .findRecordsByFilter("mind_facts", "profile = {:profile} && status = 'aprovado' && (validUntil = '' || validUntil >= {:today})", "-updatedAt", 60, 0, { profile: profileId, today })
    .map((fact) => ({ kind: fact.getString("kind"), text: fact.getString("text") }));
}

module.exports = { cvOf, vagaOf, menteOf, scopeOf };
