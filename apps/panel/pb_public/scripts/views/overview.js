import { count, list, update } from "../core/api.js";
import { CATEGORIES, STAGES, STATES, WORKPLACES } from "../core/catalog.js";
import { asMap, ctx, mine, stats } from "../core/context.js";
import { flowChart, hbars, stackBar, brazilMap } from "../core/charts.js";
import { cat, h, icon, logo, modal } from "../core/dom.js";
import { ago, greeting, number, today } from "../core/format.js";
import { blurText, reveal, tilt } from "../core/fx.js";
import { countUp } from "../core/motion.js";
import { listen } from "../core/realtime.js";
import { candidatesFilter } from "./marathon.js";
import { countryLabel, profileCountries } from "../core/countries.js";
import { runSearch } from "./search.js";

const card = (title, href, ...content) =>
  h("section", { className: "panel" }, h("header", { className: "section__head" }, h("h2", {}, title), href && h("a", { href }, "Ver tudo", icon("arrow"))), content);

function arrivalCard(job) {
  return tilt(h(
    "a",
    { className: "arrival", href: `#vaga/${job.id}` },
    h("div", { className: "arrival__top" }, logo(job.company || job.expand?.source?.name, job.companyLogo || job.expand?.source?.logoUrl), h("time", {}, ago(job.firstSeenAt))),
    h("strong", {}, job.title),
    h("span", {}, job.company || job.expand?.source?.name),
    h("small", {}, [job.city, job.state].filter(Boolean).join("/") || (job.workplace === "remoto" ? "Remoto" : "Brasil")),
  ));
}

// "Hoje": o que fazer agora, cada número leva pra sua fila
async function todayPlan(profile) {
  if (!profile.id) return null;
  const now = `'${new Date().toISOString().replace("T", " ")}'`;
  const since = `'${new Date(Date.now() - 864e5).toISOString().replace("T", " ")}'`;
  const [jobs, leads, followups, ready, mind] = await Promise.all([
    count("jobs", `${candidatesFilter(profile)} && firstSeenAt >= ${since}`),
    count("leads", mine("status = 'enriquecido' && (email != '' || phone != '' || instagram != '')")),
    count("applications", mine(`nextAt != '' && nextAt <= ${now} && stage != 'contratado' && stage != 'encerrada' && stage != 'recusada'`)),
    count("messages", mine("status = 'pronta'")),
    count("mind_facts", mine("status = 'pendente'")),
  ]).catch(() => [0, 0, 0, 0, 0]);
  const items = [
    [jobs, "vagas novas pra revisar", "#maratona", "bolt"],
    [ready, "prontas pra enviar", "#envios", "send"],
    [leads, "leads pra contatar", "#leads", "building"],
    [followups, "follow-ups vencidos", "#funil", "kanban"],
    [mind, "aprendizados pra aprovar", "#mente", "brain"],
  ];
  return h(
    "section",
    { className: "panel today" },
    h("header", { className: "section__head" }, h("h2", {}, "Hoje"), h("small", {}, "Um clique leva pra cada fila")),
    h("div", { className: "today__grid" }, items.map(([total, label, href, iconName]) => h("a", { className: `today__item${total ? "" : " is-done"}`, href }, icon(iconName), h("strong", { className: "num" }, number(total)), h("span", {}, label)))),
  );
}

// cada função escolhe o que aparece no painel dela
const WIDGETS = [
  ["semana", "Sua semana (resumo, atividade, alta compatibilidade, sequência)"],
  ["chegando", "Chegando agora"],
  ["hoje", "Hoje (filas do dia)"],
  ["fluxo", "Entrada e saída de vagas"],
  ["areas", "Áreas que mais contratam"],
  ["mapa", "Onde estão as vagas"],
  ["modalidade", "Como trabalhar e funil"],
  ["empresas", "Empresas com mais vagas"],
];

// "Sua semana" (igual AiApply): resumo, atividade, alta compatibilidade e sequência de dias
const STAGE_TEXT = { salva: "Salvou", aplicada: "Candidatou-se", entrevista: "Entrevista", teste: "Teste", proposta: "Proposta", contratado: "Contratado", encerrada: "Encerrou", recusada: "Recusou" };
const iso = (ms) => new Date(ms).toISOString().replace("T", " ");

async function weekBlock(profile) {
  if (!profile.id) return null;
  const day = 864e5;
  const midnight = new Date().setHours(0, 0, 0, 0);
  const [apps, messages, fits] = await Promise.all([
    list("applications", { filter: mine(`updated >= '${iso(Date.now() - 30 * day)}'`), sort: "-updated", perPage: 300, fields: "id,job,title,company,stage,appliedAt,updated" }),
    list("messages", { filter: mine(`createdAt >= '${iso(Date.now() - 30 * day)}' && lead = ''`), sort: "-createdAt", perPage: 300, fields: "id,title,company,status,sentAt,createdAt" }),
    list("ai_tasks", { filter: mine("type = 'job_fit' && status = 'done'"), sort: "-updatedAt", perPage: 200, fields: "ref,result" }),
  ]).catch(() => [{ items: [] }, { items: [] }, { items: [] }]);
  const applied = (since) => apps.items.filter((item) => item.appliedAt && item.appliedAt >= iso(since)).length + messages.items.filter((item) => item.status === "enviada" && item.sentAt >= iso(since) && !apps.items.some((app) => app.title === item.title && app.appliedAt)).length;
  const sentToday = applied(midnight);
  const week = applied(Date.now() - 7 * day);
  const interviews = apps.items.filter((item) => item.stage === "entrevista").length;

  // sequência: dias seguidos (até hoje ou ontem) com alguma ação
  const days = new Set([...apps.items.map((item) => item.updated), ...messages.items.map((item) => item.createdAt)].map((stamp) => new Date(stamp.replace(" ", "T")).setHours(0, 0, 0, 0)));
  let streak = 0;
  for (let cursor = days.has(midnight) ? midnight : midnight - day; days.has(cursor); cursor -= day) streak++;

  const activity = [
    ...apps.items.map((item) => ({ at: item.updated, text: `${STAGE_TEXT[item.stage] ?? "Atualizou"}: ${item.title}`, sub: item.company, href: "#funil" })),
    ...messages.items.map((item) => ({ at: item.createdAt, text: `${item.status === "enviada" ? "Candidatura enviada" : item.status === "pronta" ? "Kit pronto" : "Kit"}: ${item.title || "vaga"}`, sub: item.company, href: "#kits" })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 7);

  const tracked = new Set(apps.items.map((item) => item.job));
  const best = fits.items.filter((fit) => (fit.result?.score ?? 0) >= 60 && !tracked.has(fit.ref)).sort((a, b) => b.result.score - a.result.score).slice(0, 4);
  const bestJobs = best.length ? (await list("jobs", { filter: best.map((fit) => `id = '${fit.ref}'`).join(" || "), perPage: 4, fields: "id,title,company,companyLogo" })).items : [];

  const panel = (title, href, ...content) => h("section", { className: "panel week__card" }, h("header", { className: "section__head" }, h("h2", {}, title), href ? h("a", { href }, "Ver", icon("arrow")) : null), content);
  return h(
    "div",
    { className: "week" },
    panel(
      "Resumo",
      "#auto?aba=vagas",
      h("div", { className: "week__nums" }, [["Hoje", sentToday], ["Esta semana", week], ["Entrevistas", interviews]].map(([text, value]) => h("div", {}, h("small", {}, text), h("strong", { className: "num" }, number(value))))),
    ),
    panel(
      "Atividade",
      null,
      activity.length
        ? h("ul", { className: "week__feed" }, activity.map((item) => h("li", {}, h("a", { href: item.href }, h("time", {}, ago(item.at)), h("span", {}, item.text, item.sub ? h("small", {}, ` · ${item.sub}`) : null)))))
        : h("p", { className: "settings__help" }, "Sem atividade nos últimos 30 dias. Comece pela Candidatura automática."),
    ),
    panel(
      "Alta compatibilidade",
      "#auto",
      bestJobs.length
        ? h("ul", { className: "week__feed" }, bestJobs.map((job) => h("li", {}, h("a", { href: `#vaga/${job.id}` }, logo(job.company, job.companyLogo, "sm"), h("span", {}, job.title, h("small", {}, ` · ${job.company || ""}`)), h("b", { className: "num" }, best.find((fit) => fit.ref === job.id)?.result.score)))))
        : h("p", { className: "settings__help" }, "Nenhuma vaga com nota 60+ ainda. Complete o currículo (ferramentas e skills) e peça novas avaliações."),
    ),
    panel("Sequência", null, h("div", { className: "week__streak" }, h("span", { "aria-hidden": "true" }, streak ? "🔥" : "💤"), h("strong", { className: "num" }, `${streak} ${streak === 1 ? "dia" : "dias"}`), h("small", {}, streak ? "seguidos cuidando da sua busca" : "Faça uma ação hoje pra começar"))),
  );
}

async function customize(profile) {
  const hidden = new Set(profile.dashboard?.hidden ?? []);
  const boxes = WIDGETS.map(([key, text]) => h("label", { className: "check" }, h("input", { type: "checkbox", value: key, checked: !hidden.has(key) }), h("span", {}, text)));
  const dialog = h(
    "dialog",
    { className: "confirm" },
    h(
      "form",
      { method: "dialog" },
      h("p", {}, h("strong", {}, `Painel de ${profile.label || "Principal"}`), h("br"), h("small", {}, "Escolha o que aparece. Cada função tem o seu.")),
      h("div", { className: "field" }, boxes),
      h("div", { className: "confirm__actions" }, h("button", { className: "btn btn--ghost", value: "no", formNoValidate: true }, "Cancelar"), h("button", { className: "btn btn--primary", value: "yes" }, "Salvar")),
    ),
  );
  if (!(await modal(dialog, (value) => value === "yes"))) return;
  const off = boxes.map((box) => box.querySelector("input")).filter((input) => !input.checked).map((input) => input.value);
  ctx.profile = await update("profile", profile.id, { dashboard: { ...(profile.dashboard ?? {}), hidden: off } });
  dispatchEvent(new HashChangeEvent("hashchange"));
}

export default async function overview(root, { signal }) {
  const profile = ctx.profile ?? {};
  const hidden = new Set(profile.dashboard?.hidden ?? []);
  const show = (key, node) => (hidden.has(key) ? null : node);
  // "Chegando agora" da função: só vagas da área/cargos dela (sem função configurada, mostra tudo)
  const scoped = profile.id && (profile.categories?.length || profile.prefs?.roles?.length);
  const arrivalsFilter = scoped ? candidatesFilter(profile) : "status = 'open'";
  const [data, arrivals] = await Promise.all([
    stats(true),
    list("jobs", { filter: arrivalsFilter, sort: "-firstSeenAt", perPage: 14, expand: "source", fields: "id,title,company,companyLogo,city,state,workplace,firstSeenAt,expand.source.name,expand.source.logoUrl" }),
  ]);

  const big = h("strong", { className: "hello__number num" }, "0");
  const radar = [
    profile.prefs?.roles?.length ? profile.prefs.roles.slice(0, 3).join(", ") : profile.categories?.length ? profile.categories.map((key) => CATEGORIES[key]).join(", ") : "todas as áreas",
    profile.city || STATES[profile.state] || profileCountries(profile).map((code) => countryLabel(code)).join(", "),
    WORKPLACES[profile.workplace],
  ].filter(Boolean);

  const stat = (label, value, href, hot) => {
    const node = h("strong", { className: "num" }, "0");
    requestAnimationFrame(() => countUp(node, value));
    return h("a", { className: hot && value ? "mini is-hot" : "mini", href }, node, h("span", {}, label));
  };

  root.append(
    h(
      "section",
      { className: "hello" },
      h(
        "div",
        { className: "hello__main" },
        h("p", { className: "eyebrow" }, `${greeting()}${profile.name ? `, ${profile.name}` : ""} · ${today()}`),
        h("h1", { className: "hello__title" }, big, blurText("vagas abertas no seu radar agora", { delay: 300 })),
        h(
          "div",
          { className: "minis" },
          stat("novas nas últimas 24h", data.fresh, "#vagas?period=24h", true),
          stat("empresas contratando", data.companies, "#empresas"),
          stat("remotas", data.remote, "#vagas?workplace=remoto"),
          stat("com salário", data.withSalary, "#vagas?salary=1"),
        ),
      ),
      h(
        "aside",
        { className: "hello__radar" },
        h("p", { className: "eyebrow" }, icon("radar"), profile.label ? `Função: ${profile.label}` : "Seu radar"),
        h("p", { className: "hello__profile" }, radar.join(" · ")),
        h(
          "div",
          { className: "hello__actions" },
          h("button", { className: "btn btn--primary", onclick: () => runSearch({ category: profile.categories?.[0], state: profile.state, city: profile.city, workplace: profile.workplace }) }, icon("radar"), "Buscar agora"),
          h("a", { className: "btn btn--ghost", href: "#preferencias?aba=vaga" }, icon("edit"), "Ajustar"),
          profile.id ? h("button", { className: "btn btn--ghost", onclick: () => customize(profile) }, icon("gear"), "Personalizar painel") : null,
        ),
      ),
    ),
  );
  requestAnimationFrame(() => countUp(big, data.open, { duration: 1400 }));
  if (!hidden.has("semana")) {
    const week = await weekBlock(profile).catch(() => null);
    if (week) root.append(week);
  }

  const rail = h("div", { className: "arrivals-rail" }, arrivals.items.map(arrivalCard));
  root.append(
    show("chegando", h(
      "section",
      { className: "section" },
      h("header", { className: "section__head" }, h("h2", {}, h("i", { className: "dot dot--live" }), " Chegando agora"), h("a", { href: "#ao-vivo" }, "Ao vivo", icon("arrow"))),
      arrivals.items.length ? rail : h("div", { className: "empty card" }, h("strong", {}, "O radar está esquentando"), scoped ? "Nenhuma vaga nova da sua função ainda. Rode uma busca ou ajuste os cargos nas Preferências." : "A primeira coleta traz as vagas em alguns minutos."),
    )),
  );

  const workplace = asMap(data.workplace);
  const stages = asMap(data.stage);
  const plan = await todayPlan(profile);
  if (plan && !hidden.has("hoje")) root.append(plan);
  root.append(
    h(
      "div",
      { className: "dash" },
      show("fluxo", card("Entrada e saída de vagas", "#historico", flowChart(data.opened, data.closed))),
      show("areas", card(
        "Áreas que mais contratam",
        "#areas",
        hbars(data.category.filter((row) => row.key), {
          href: (row) => `#vagas?category=${row.key}`,
          render: (row) => h("span", { className: "hbars__label" }, cat(row.key, 26), CATEGORIES[row.key] ?? row.key),
        }),
      )),
      show("mapa", card(
        "Onde estão as vagas",
        "#areas",
        brazilMap(asMap(data.state), { onPick: (code) => (location.hash = `#vagas?state=${code}`) }),
      )),
      show("modalidade", card(
        "Como trabalhar",
        "#vagas",
        stackBar(Object.entries(WORKPLACES).map(([key, label]) => ({ label, total: workplace[key] ?? 0 }))),
        h(
          "div",
          { className: "funnel-mini" },
          STAGES.slice(0, 5).map(([key, label]) => h("a", { href: "#funil" }, h("strong", { className: "num" }, number(stages[key] ?? 0)), h("span", {}, label))),
        ),
      )),
      show("empresas", card(
        "Empresas com mais vagas",
        "#empresas",
        h(
          "ul",
          { className: "logos stagger" },
          data.topCompanies.map((company, index) =>
            h("li", { style: { "--i": index } }, h("a", { href: `#vagas?company=${encodeURIComponent(company.name)}`, title: company.name }, logo(company.name, company.logo, "lg"), h("span", {}, company.name), h("b", { className: "num" }, number(company.total)))),
          ),
        ),
      )),
    ),
    h(
      "p",
      { className: "guard" },
      icon("shield"),
      data.honeypot
        ? `${number(data.honeypot)} ${data.honeypot === 1 ? "curioso tentou" : "curiosos tentaram"} entrar pela porta dos fundos hoje. Todos foram reprovados na triagem.`
        : "Ninguém tentou invadir nas últimas 24h. A segurança está de plantão.",
    ),
  );

  reveal(root.querySelectorAll(".dash > .panel"));

  listen(
    "runs",
    async ({ record }) => {
      if (!record.created) return;
      const fresh = await stats(true).catch(() => null);
      if (fresh) countUp(big, fresh.open);
      const { items } = await list("jobs", { filter: arrivalsFilter, sort: "-firstSeenAt", perPage: 6, expand: "source" }).catch(() => ({ items: [] }));
      const known = new Set([...rail.querySelectorAll("a")].map((node) => node.getAttribute("href")));
      for (const job of items.reverse()) {
        if (known.has(`#vaga/${job.id}`)) continue;
        const node = arrivalCard(job);
        rail.prepend(node);
        node.animate([{ opacity: 0, transform: "translateX(-20px) scale(0.96)" }, { opacity: 1, transform: "none" }], { duration: 520, easing: "cubic-bezier(0.34, 1.5, 0.64, 1)" });
      }
    },
    signal,
  );
}
