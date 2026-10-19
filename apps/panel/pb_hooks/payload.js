/// <reference path="../pb_data/types.d.ts" />

// o que o Claude recebe sobre o candidato e a vaga; usado pela nota (job_fit) e pela candidatura (apply_kit)
const plain = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function cvOf(profile) {
  const cv = {};
  for (const field of ["name", "headline", "email", "phone", "about", "skills", "experiences", "education", "languages", "links", "seniority", "city", "state", "workplace", "salary", "categories", "countries", "portfolio"]) {
    cv[field] = profile.get(field);
  }
  return cv;
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

module.exports = { cvOf, vagaOf, menteOf };
