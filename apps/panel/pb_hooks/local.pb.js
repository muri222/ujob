/// <reference path="../pb_data/types.d.ts" />

// Radar roda só no PC de quem instalou: sem tela de login, a interface pega a sessão local aqui.
// Só responde pra própria página servida em 127.0.0.1/localhost, nunca pra outro site aberto no navegador.
routerAdd("GET", "/api/radar/session", (e) => {
  const host = e.request.host;
  const local = /^(127\.0\.0\.1|localhost):\d+$/.test(host) && ["127.0.0.1", "::1"].includes(e.realIP());
  const origin = e.request.header.get("Origin");
  const site = e.request.header.get("Sec-Fetch-Site");
  if (!local || (origin && origin !== `http://${host}`) || (site && !["same-origin", "none"].includes(site))) {
    return e.json(403, { message: "Só no PC do Radar." });
  }
  const owner = require(`${__hooks}/local_account.js`)($app);
  return e.json(200, { token: owner.newAuthToken(), record: { id: owner.id, email: owner.email() } });
});
