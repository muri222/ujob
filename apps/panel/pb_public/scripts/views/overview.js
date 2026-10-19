import { list } from "../core/api.js";
import { CATEGORIES, STAGES, STATES, WORKPLACES } from "../core/catalog.js";
import { asMap, ctx, stats } from "../core/context.js";
import { flowChart, hbars, stackBar, brazilMap } from "../core/charts.js";
import { cat, h, icon, logo } from "../core/dom.js";
import { ago, greeting, number, today } from "../core/format.js";
import { blurText, reveal, tilt } from "../core/fx.js";
import { countUp } from "../core/motion.js";
import { listen } from "../core/realtime.js";
import { runSearch } from "./search.js";
import { welcome } from "./welcome.js";

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

export default async function overview(root, { signal }) {
  const profile = ctx.profile ?? {};
  const [data, arrivals] = await Promise.all([
    stats(true),
    list("jobs", { filter: "status = 'open'", sort: "-firstSeenAt", perPage: 14, expand: "source", fields: "id,title,company,companyLogo,city,state,workplace,firstSeenAt,expand.source.name,expand.source.logoUrl" }),
  ]);

  const big = h("strong", { className: "hello__number num" }, "0");
  const radar = [
    profile.categories?.length ? profile.categories.map((key) => CATEGORIES[key]).join(", ") : "todas as áreas",
    profile.city || STATES[profile.state] || "todo o Brasil",
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
        h("p", { className: "eyebrow" }, icon("radar"), "Seu radar"),
        h("p", { className: "hello__profile" }, radar.join(" · ")),
        h(
          "div",
          { className: "hello__actions" },
          h("button", { className: "btn btn--primary", onclick: () => runSearch({ category: profile.categories?.[0], state: profile.state, city: profile.city, workplace: profile.workplace }) }, icon("radar"), "Buscar agora"),
          h("button", { className: "btn btn--ghost", onclick: () => welcome({ force: true }) }, icon("edit"), "Ajustar"),
        ),
      ),
    ),
  );
  requestAnimationFrame(() => countUp(big, data.open, { duration: 1400 }));

  const rail = h("div", { className: "arrivals-rail" }, arrivals.items.map(arrivalCard));
  root.append(
    h(
      "section",
      { className: "section" },
      h("header", { className: "section__head" }, h("h2", {}, h("i", { className: "dot dot--live" }), " Chegando agora"), h("a", { href: "#ao-vivo" }, "Ao vivo", icon("arrow"))),
      arrivals.items.length ? rail : h("div", { className: "empty card" }, h("strong", {}, "O radar está esquentando"), "A primeira coleta traz as vagas em alguns minutos."),
    ),
  );

  const workplace = asMap(data.workplace);
  const stages = asMap(data.stage);
  root.append(
    h(
      "div",
      { className: "dash" },
      card("Entrada e saída de vagas", "#historico", flowChart(data.opened, data.closed)),
      card(
        "Áreas que mais contratam",
        "#areas",
        hbars(data.category.filter((row) => row.key), {
          href: (row) => `#vagas?category=${row.key}`,
          render: (row) => h("span", { className: "hbars__label" }, cat(row.key, 26), CATEGORIES[row.key] ?? row.key),
        }),
      ),
      card(
        "Onde estão as vagas",
        "#areas",
        brazilMap(asMap(data.state), { onPick: (code) => (location.hash = `#vagas?state=${code}`) }),
      ),
      card(
        "Como trabalhar",
        "#vagas",
        stackBar(Object.entries(WORKPLACES).map(([key, label]) => ({ label, total: workplace[key] ?? 0 }))),
        h(
          "div",
          { className: "funnel-mini" },
          STAGES.slice(0, 5).map(([key, label]) => h("a", { href: "#funil" }, h("strong", { className: "num" }, number(stages[key] ?? 0)), h("span", {}, label))),
        ),
      ),
      card(
        "Empresas com mais vagas",
        "#empresas",
        h(
          "ul",
          { className: "logos stagger" },
          data.topCompanies.map((company, index) =>
            h("li", { style: { "--i": index } }, h("a", { href: `#vagas?company=${encodeURIComponent(company.name)}`, title: company.name }, logo(company.name, company.logo, "lg"), h("span", {}, company.name), h("b", { className: "num" }, number(company.total)))),
          ),
        ),
      ),
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
      const { items } = await list("jobs", { filter: "status = 'open'", sort: "-firstSeenAt", perPage: 6, expand: "source" }).catch(() => ({ items: [] }));
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
