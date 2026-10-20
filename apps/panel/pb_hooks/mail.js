/// <reference path="../pb_data/types.d.ts" />

// provedores comuns no Brasil; o resto tenta a base pública de autoconfiguração do Thunderbird
const KNOWN = {
  gmail: { domains: ["gmail.com", "googlemail.com"], smtpHost: "smtp.gmail.com", smtpPort: 465, imapHost: "imap.gmail.com", imapPort: 993, help: "https://myaccount.google.com/apppasswords" },
  outlook: { domains: ["outlook.com", "hotmail.com", "live.com", "msn.com", "outlook.com.br", "hotmail.com.br"], smtpHost: "smtp-mail.outlook.com", smtpPort: 587, imapHost: "outlook.office365.com", imapPort: 993, help: "https://account.live.com/proofs/AppPassword" },
  yahoo: { domains: ["yahoo.com", "yahoo.com.br", "ymail.com"], smtpHost: "smtp.mail.yahoo.com", smtpPort: 465, imapHost: "imap.mail.yahoo.com", imapPort: 993, help: "https://login.yahoo.com/account/security/app-passwords" },
  icloud: { domains: ["icloud.com", "me.com", "mac.com"], smtpHost: "smtp.mail.me.com", smtpPort: 587, imapHost: "imap.mail.me.com", imapPort: 993, help: "https://account.apple.com/account/manage" },
  zoho: { domains: ["zoho.com", "zohomail.com"], smtpHost: "smtp.zoho.com", smtpPort: 465, imapHost: "imap.zoho.com", imapPort: 993, help: "https://accounts.zoho.com/home#security/app_password" },
  uol: { domains: ["uol.com.br"], smtpHost: "smtps.uol.com.br", smtpPort: 465, imapHost: "imap.uol.com.br", imapPort: 993, help: "" },
  bol: { domains: ["bol.com.br"], smtpHost: "smtps.bol.com.br", smtpPort: 465, imapHost: "imap.bol.com.br", imapPort: 993, help: "" },
  terra: { domains: ["terra.com.br"], smtpHost: "smtp.terra.com.br", smtpPort: 587, imapHost: "imap.terra.com.br", imapPort: 993, help: "" },
};

// e-mail de domínio próprio: o MX diz quem hospeda (Google Workspace, Microsoft 365, Zoho, Hostinger...)
const BY_MX = [
  [/google\.com$|googlemail\.com$/, "gmail"],
  [/outlook\.com$|protection\.outlook\.com$/, "office365"],
  [/zoho\.(com|eu|in)$/, "zoho"],
  [/hostinger\.(com|io)$/, "hostinger"],
  [/titan\.email$/, "titan"],
  [/secureserver\.net$/, "godaddy"],
  [/locaweb\.com\.br$/, "locaweb"],
  [/umbler\.com$/, "umbler"],
  [/kinghost\.net$/, "kinghost"],
  [/icloud\.com$/, "icloud"],
];
const HOSTED = {
  office365: { smtpHost: "smtp.office365.com", smtpPort: 587, imapHost: "outlook.office365.com", imapPort: 993, help: "https://mysignins.microsoft.com/security-info" },
  hostinger: { smtpHost: "smtp.hostinger.com", smtpPort: 465, imapHost: "imap.hostinger.com", imapPort: 993, help: "" },
  titan: { smtpHost: "smtp.titan.email", smtpPort: 465, imapHost: "imap.titan.email", imapPort: 993, help: "" },
  godaddy: { smtpHost: "smtpout.secureserver.net", smtpPort: 465, imapHost: "imap.secureserver.net", imapPort: 993, help: "" },
  locaweb: { smtpHost: "email-ssl.com.br", smtpPort: 465, imapHost: "email-ssl.com.br", imapPort: 993, help: "" },
  umbler: { smtpHost: "smtp.umbler.com", smtpPort: 587, imapHost: "imap.umbler.com", imapPort: 993, help: "" },
  kinghost: { smtpHost: "smtpi.kinghost.net", smtpPort: 465, imapHost: "imap.kinghost.net", imapPort: 993, help: "" },
};

function fromMx(domain) {
  try {
    const res = $http.send({ url: `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`, method: "GET", timeout: 6 });
    const hosts = (JSON.parse(toString(res.body)).Answer || []).map((answer) => String(answer.data).split(" ").pop().replace(/\.$/, "").toLowerCase());
    for (const host of hosts) {
      const hit = BY_MX.find(([pattern]) => pattern.test(host));
      if (!hit) continue;
      const provider = hit[1];
      const known = KNOWN[provider];
      const info = known ? { smtpHost: known.smtpHost, smtpPort: known.smtpPort, imapHost: known.imapHost, imapPort: known.imapPort, help: known.help } : HOSTED[provider];
      return { provider: provider === "gmail" ? "workspace" : provider, ...info };
    }
  } catch {}
  return null;
}

function fromIspdb(domain) {
  try {
    const res = $http.send({ url: `https://autoconfig.thunderbird.net/v1.1/${encodeURIComponent(domain)}`, method: "GET", timeout: 6 });
    if (res.statusCode !== 200) return null;
    const xml = toString(res.body);
    const server = (type) => {
      const block = (xml.match(new RegExp(`<(?:incoming|outgoing)Server type="${type}">([\\s\\S]*?)</(?:incoming|outgoing)Server>`)) || [])[1] || "";
      return { host: (block.match(/<hostname>([^<]+)<\/hostname>/) || [])[1] || "", port: parseInt((block.match(/<port>(\d+)<\/port>/) || [])[1] || "0", 10) };
    };
    const smtp = server("smtp");
    const imap = server("imap");
    return smtp.host ? { smtpHost: smtp.host, smtpPort: smtp.port || 587, imapHost: imap.host, imapPort: imap.port || 993, help: "" } : null;
  } catch {
    return null;
  }
}

function detect(email) {
  const domain = String(email).split("@")[1]?.toLowerCase() ?? "";
  if (!domain) return null;
  for (const [provider, info] of Object.entries(KNOWN)) {
    if (info.domains.includes(domain)) return { provider, smtpHost: info.smtpHost, smtpPort: info.smtpPort, imapHost: info.imapHost, imapPort: info.imapPort, help: info.help };
  }
  // ponytail: sem achar, chuta smtp./imap. do domínio; o usuário corrige no "avançado"
  const hosted = fromMx(domain);
  if (hosted) return hosted;
  return { provider: "outro", ...(fromIspdb(domain) || { smtpHost: `smtp.${domain}`, smtpPort: 587, imapHost: `imap.${domain}`, imapPort: 993, help: "" }) };
}

// ponytail: senha cifrada com RADAR_SECRET do .env (fora do banco); trocar pelo cofre do Windows se precisar de mais
function key() {
  const secret = $os.getenv("RADAR_SECRET");
  if (!secret || secret.length !== 32) throw new Error("RADAR_SECRET ausente: feche e abra o uJob.");
  return secret;
}

const encrypt = (password) => $security.encrypt(password, key());

// e-mail é da conta, não da função: usa o da função se tiver, senão o primeiro configurado
function accountFor(app, profileId) {
  try {
    return app.findFirstRecordByFilter("mail_accounts", "profile = {:profile}", { profile: profileId });
  } catch {
    return app.findRecordsByFilter("mail_accounts", "", "-verifiedAt", 1, 0)[0] ?? null;
  }
}

function credentials(app, profileId) {
  const account = accountFor(app, profileId);
  return {
    email: account.getString("email"),
    name: account.getString("name"),
    smtpHost: account.getString("smtpHost"),
    smtpPort: account.getInt("smtpPort"),
    imapHost: account.getString("imapHost"),
    imapPort: account.getInt("imapPort"),
    password: $security.decrypt(account.getString("secret"), key()),
  };
}

module.exports = { detect, encrypt, credentials, accountFor };
