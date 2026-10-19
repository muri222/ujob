/// <reference path="../pb_data/types.d.ts" />

// retrato do momento do usuário, montado na hora de cada resposta do chat (sempre atualizado)
const json = (record, field) => JSON.parse(record.getString(field) || "null");
const clip = (value, max) => String(value ?? "").slice(0, max);

module.exports = function chatContext(app, profileId) {
  const profile = app.findRecordById("profile", profileId);
  const rows = (collection, filter, sort, limit, params = {}) => {
    try {
      return app.findRecordsByFilter(collection, filter, sort, limit, 0, { p: profileId, ...params });
    } catch {
      return [];
    }
  };
  const count = (collection, where, params = {}) => app.countRecords(collection, $dbx.exp(where, { p: profileId, ...params }));

  const experiences = (json(profile, "experiences") || []).map((item) => `${item.role} · ${item.company} (${[item.start, item.end || "atual"].filter(Boolean).join(" a ")})`);
  const stages = {};
  for (const stage of ["salva", "aplicada", "entrevista", "teste", "proposta", "contratado", "encerrada", "recusada"]) stages[stage] = count("applications", "profile = {:p} AND stage = {:s}", { s: stage });

  const fits = rows("ai_tasks", "profile = {:p} && type = 'job_fit' && status = 'done'", "-updatedAt", 40)
    .map((task) => ({ task, result: json(task, "result") || {}, vaga: (json(task, "payload") || {}).vaga || {} }))
    .filter(({ result }) => result.score >= 65)
    .slice(0, 8)
    .map(({ result, vaga, task }) => `${vaga.title} · ${vaga.company} · nota ${result.score} (vaga ${task.getString("ref")})`);

  const leads = rows("leads", "profile = {:p} && status != 'descartado'", "-updatedAt", 12).map((lead) => {
    const dossier = json(lead, "dossier") || {};
    return [lead.getString("name"), lead.getString("domain"), lead.getString("status"), dossier.fit != null ? `fit ${dossier.fit}` : "", clip(dossier.servico_recomendado, 120)].filter(Boolean).join(" · ");
  });

  return {
    hoje: new Date().toISOString().slice(0, 10),
    perfil: {
      nome: profile.getString("name"),
      titulo: profile.getString("headline"),
      resumo: clip(profile.getString("about"), 700),
      nivel: profile.getString("seniority"),
      local: [profile.getString("city"), profile.getString("state")].filter(Boolean).join("/"),
      pretensao: profile.getInt("salary") || null,
      skills: json(profile, "skills") || [],
      experiencias: experiences.slice(0, 6),
      idiomas: json(profile, "languages") || [],
      links: json(profile, "links") || [],
      areas: json(profile, "categories") || [],
    },
    mente: rows("mind_facts", "profile = {:p} && status = 'aprovado'", "-updatedAt", 30).map((fact) => `${fact.getString("kind")}: ${fact.getString("text")}`),
    funil: {
      por_etapa: stages,
      recentes: rows("applications", "profile = {:p} && stage != 'recusada'", "-updated", 10).map((item) =>
        [item.getString("title"), item.getString("company"), item.getString("stage"), item.getString("nextAt") ? `próximo passo ${item.getString("nextAt").slice(0, 10)}` : ""].filter(Boolean).join(" · "),
      ),
    },
    vagas_bem_avaliadas: fits,
    buscas_salvas: rows("searches", "profile = {:p} && saved = true", "-finishedAt", 6).map((item) => item.getString("name") || item.getString("prompt") || item.getString("term") || item.getString("category")),
    envios: { prontas: count("messages", "profile = {:p} AND status = 'pronta'"), enviadas_7d: count("messages", "profile = {:p} AND status = 'enviada' AND sentAt >= {:d}", { d: new Date(Date.now() - 7 * 864e5).toISOString().replace("T", " ") }) },
    leads: { total: count("leads", "profile = {:p} AND status != 'descartado'"), contatados: count("leads", "profile = {:p} AND status = 'contatado'"), recentes: leads },
    campanhas: rows("campaigns", "profile = {:p}", "-createdAt", 5).map((item) => `${item.getString("name")} · ${item.getString("source")} · ${item.getInt("found")} empresas · ${item.getString("status")}`),
  };
};
