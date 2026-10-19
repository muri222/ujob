const relative = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto", style: "short" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const dayMonth = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });
const integer = new Intl.NumberFormat("pt-BR");
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export const parseDate = (value) => (value ? new Date(String(value).replace(" ", "T")) : null);

export function ago(value) {
  const date = parseDate(value);
  if (!date) return "";
  const minutes = Math.round((date - Date.now()) / 60000);
  if (Math.abs(minutes) < 1) return "agora";
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  if (Math.abs(minutes) < 1440) return relative.format(Math.round(minutes / 60), "hour");
  if (Math.abs(minutes) < 43200) return relative.format(Math.round(minutes / 1440), "day");
  return dayMonth.format(date);
}

export const formatDateTime = (value) => (parseDate(value) ? dateTime.format(parseDate(value)) : "");
export const formatDay = (value) => (parseDate(value) ? dayMonth.format(parseDate(value)) : "");
export const number = (value) => integer.format(Math.round(value || 0));
export const short = (value) => (value >= 10000 ? compact.format(value) : integer.format(value || 0));
export const plural = (total, one, many) => `${number(total)} ${total === 1 ? one : many}`;

export const stamp = (date) => date.toISOString().replace("T", " ");
export const since = (hours) => `'${stamp(new Date(Date.now() - hours * 3600e3))}'`;

export function salary(job) {
  if (!job.salaryMin) return "";
  const currency = /^[A-Z]{3}$/.test(job.salaryCurrency) ? job.salaryCurrency : "BRL";
  const format = new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 0 });
  const period = { hora: "/h", mes: "/mês", ano: "/ano" }[job.salaryPeriod] ?? "";
  const range = job.salaryMax && job.salaryMax !== job.salaryMin ? `${format.format(job.salaryMin)} a ${format.format(job.salaryMax)}` : format.format(job.salaryMin);
  return `${range}${period}`;
}

export function initials(name = "") {
  return (
    String(name)
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "?"
  );
}

export function phoneLabel(digits) {
  const value = String(digits).replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (value.length === 11) return `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
  if (value.length === 10) return `(${value.slice(0, 2)}) ${value.slice(2, 6)}-${value.slice(6)}`;
  return value;
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Madrugada produtiva";
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export const today = () => new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
