import { ctx } from "./context.js";
import { fold } from "./places.js";

export const SKILLS = [
  "Excel", "Excel avançado", "Power BI", "SQL", "Python", "JavaScript", "TypeScript", "React", "Node.js", "Java", "C#", ".NET", "PHP", "Go", "AWS", "Azure", "Docker", "Kubernetes", "Git", "Linux", "Figma", "Photoshop", "Illustrator", "Canva", "UX", "UI",
  "SAP", "TOTVS", "ERP", "CRM", "Salesforce", "HubSpot", "Google Ads", "Meta Ads", "SEO", "Copywriting", "Redes sociais", "Marketing digital", "Inglês", "Espanhol",
  "Vendas", "Negociação", "Prospecção", "Atendimento ao cliente", "Telemarketing", "Pós-venda", "Varejo", "Caixa", "Reposição", "Estoque", "Logística", "Empilhadeira", "CNH B", "CNH D", "CNH E", "Direção defensiva",
  "Pacote Office", "Word", "Rotinas administrativas", "Faturamento", "Contas a pagar", "Contas a receber", "Conciliação bancária", "Fiscal", "Contabilidade", "Departamento pessoal", "Folha de pagamento", "Recrutamento", "eSocial",
  "Enfermagem", "COREN", "Primeiros socorros", "Cuidador", "Farmácia", "Instrumentação", "Atendimento humanizado",
  "Docência", "Pedagogia", "Libras", "Educação infantil",
  "AutoCAD", "Revit", "SolidWorks", "NR-10", "NR-35", "NR-12", "Elétrica", "Mecânica", "Manutenção", "Solda", "Torno", "CLP", "Lean", "5S", "Qualidade", "ISO 9001",
  "Cozinha", "Confeitaria", "Barista", "Garçom", "Limpeza", "Portaria", "Vigilância", "CFTV", "Jardinagem",
  "Gestão de equipes", "Liderança", "Scrum", "Kanban", "Gestão de projetos", "Análise de dados", "Comunicação", "Organização", "Proatividade",
];

const LEVELS = ["estagio", "junior", "pleno", "senior", "especialista", "lideranca"];

const hasTerm = (text, skill) => {
  const term = fold(skill);
  return term.length <= 3 ? new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text) : text.includes(term);
};

const plain = (html) => String(html ?? "").replace(/<[^>]+>/g, " ");

export function jobText(job) {
  return fold([job.title, job.company, (job.tags ?? []).join(" "), job.summary, plain(job.description).slice(0, 6000)].join(" "));
}

export function match(job, profile = ctx.profile) {
  if (!profile) return null;
  const text = jobText(job);
  const mine = (profile.skills ?? []).filter(Boolean);
  const wanted = SKILLS.filter((skill) => hasTerm(text, skill));
  const hits = mine.filter((skill) => hasTerm(text, skill));
  const misses = wanted.filter((skill) => !mine.some((own) => fold(own) === fold(skill))).slice(0, 6);

  const parts = [];
  const areas = profile.categories ?? [];
  parts.push([30, !areas.length || areas.includes(job.category) ? 1 : 0]);
  if (mine.length) parts.push([35, Math.min(1, hits.length / Math.max(1, Math.min(wanted.length || 3, 5)))]);
  const sameState = profile.state && job.state === profile.state;
  const sameCity = profile.city && fold(job.city) === fold(profile.city);
  parts.push([20, job.workplace === "remoto" ? 1 : !profile.state ? 0.7 : sameCity ? 1 : sameState ? 0.75 : job.state ? 0.1 : 0.5]);
  parts.push([10, !profile.workplace || !job.workplace ? 0.6 : profile.workplace === job.workplace ? 1 : 0.3]);
  if (profile.seniority && job.seniority) parts.push([5, Math.max(0, 1 - Math.abs(LEVELS.indexOf(profile.seniority) - LEVELS.indexOf(job.seniority)) * 0.5)]);

  const weight = parts.reduce((sum, [w]) => sum + w, 0);
  const score = Math.round((parts.reduce((sum, [w, v]) => sum + w * v, 0) / weight) * 100);
  const reasons = [
    areas.includes(job.category) && "Na sua área",
    sameCity ? "Na sua cidade" : sameState ? "No seu estado" : job.workplace === "remoto" ? "Dá pra fazer de casa" : null,
    profile.workplace && profile.workplace === job.workplace && "Do jeito que você prefere trabalhar",
  ].filter(Boolean);
  return { score, hits, misses, reasons };
}

export const tone = (score) => (score >= 80 ? "high" : score >= 60 ? "mid" : "low");
