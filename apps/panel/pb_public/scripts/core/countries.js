// países que o Radar busca: código ISO, nome em PT (tela) e em EN (o que portais e coletores entendem)
// "WW" = mundo todo (vagas remotas de qualquer lugar)
export const COUNTRIES = [
  ["WW", "Mundo todo (remoto)", "Worldwide", "🌍"],
  ["BR", "Brasil", "Brazil", "🇧🇷"],
  ["PT", "Portugal", "Portugal", "🇵🇹"],
  ["US", "Estados Unidos", "United States", "🇺🇸"],
  ["CA", "Canadá", "Canada", "🇨🇦"],
  ["GB", "Reino Unido", "United Kingdom", "🇬🇧"],
  ["IE", "Irlanda", "Ireland", "🇮🇪"],
  ["DE", "Alemanha", "Germany", "🇩🇪"],
  ["NL", "Holanda", "Netherlands", "🇳🇱"],
  ["ES", "Espanha", "Spain", "🇪🇸"],
  ["FR", "França", "France", "🇫🇷"],
  ["IT", "Itália", "Italy", "🇮🇹"],
  ["BE", "Bélgica", "Belgium", "🇧🇪"],
  ["CH", "Suíça", "Switzerland", "🇨🇭"],
  ["AT", "Áustria", "Austria", "🇦🇹"],
  ["SE", "Suécia", "Sweden", "🇸🇪"],
  ["NO", "Noruega", "Norway", "🇳🇴"],
  ["DK", "Dinamarca", "Denmark", "🇩🇰"],
  ["FI", "Finlândia", "Finland", "🇫🇮"],
  ["PL", "Polônia", "Poland", "🇵🇱"],
  ["CZ", "Tchéquia", "Czech Republic", "🇨🇿"],
  ["RO", "Romênia", "Romania", "🇷🇴"],
  ["UA", "Ucrânia", "Ukraine", "🇺🇦"],
  ["LU", "Luxemburgo", "Luxembourg", "🇱🇺"],
  ["MT", "Malta", "Malta", "🇲🇹"],
  ["CY", "Chipre", "Cyprus", "🇨🇾"],
  ["MX", "México", "Mexico", "🇲🇽"],
  ["AR", "Argentina", "Argentina", "🇦🇷"],
  ["CL", "Chile", "Chile", "🇨🇱"],
  ["CO", "Colômbia", "Colombia", "🇨🇴"],
  ["PE", "Peru", "Peru", "🇵🇪"],
  ["UY", "Uruguai", "Uruguay", "🇺🇾"],
  ["CR", "Costa Rica", "Costa Rica", "🇨🇷"],
  ["AU", "Austrália", "Australia", "🇦🇺"],
  ["NZ", "Nova Zelândia", "New Zealand", "🇳🇿"],
  ["JP", "Japão", "Japan", "🇯🇵"],
  ["KR", "Coreia do Sul", "South Korea", "🇰🇷"],
  ["CN", "China", "China", "🇨🇳"],
  ["SG", "Singapura", "Singapore", "🇸🇬"],
  ["IN", "Índia", "India", "🇮🇳"],
  ["AE", "Emirados Árabes", "United Arab Emirates", "🇦🇪"],
  ["IL", "Israel", "Israel", "🇮🇱"],
  ["ZA", "África do Sul", "South Africa", "🇿🇦"],
];

// ponytail: Windows não desenha bandeira em emoji (vira "BR"); lá fica só o nome (o 🌍 funciona em todo lugar)
const FLAGS = typeof navigator === "undefined" || !/Windows/.test(navigator.userAgent);
export const COUNTRY = Object.fromEntries(COUNTRIES.map(([code, pt, en, flag]) => [code, { code, pt, en, flag: FLAGS || code === "WW" ? flag : "" }]));
export const countryName = (code) => COUNTRY[code]?.pt ?? code;
export const countryLabel = (code) => (COUNTRY[code] ? `${COUNTRY[code].flag} ${COUNTRY[code].pt}`.trim() : code);

// autorização de trabalho (igual AiApply): ajuda a filtrar vaga que exige visto
export const AUTH = [
  ["", "Selecione…"],
  ["cidadao", "Sou cidadão"],
  ["residente", "Residente permanente"],
  ["visto", "Tenho visto de trabalho"],
  ["patrocinio", "Preciso de patrocínio de visto"],
  ["remoto", "Só remoto (contratado de fora)"],
  ["nao", "Ainda não autorizado"],
];

// os países da função (em ordem), com "WW" quando aceita remoto de qualquer lugar
export function profileCountries(profile) {
  const codes = (Array.isArray(profile?.countries) ? profile.countries : []).map((place) => place.code).filter((code) => COUNTRY[code]);
  if (profile?.prefs?.worldwide && !codes.includes("WW")) codes.push("WW");
  return codes.length ? codes : ["BR"];
}

// filtro do PocketBase pra vagas de um país: Brasil tem estado; o resto vem no texto do campo country
export function countryFilter(code, quote) {
  if (code === "BR") return "(state != '' || country ~ 'brasil' || country ~ 'brazil')";
  if (code === "WW") return "(workplace = 'remoto' && state = '')";
  const { pt, en } = COUNTRY[code] ?? { pt: code, en: code };
  return `(state = '' && (country ~ ${quote(en)} || country ~ ${quote(pt)}))`;
}
