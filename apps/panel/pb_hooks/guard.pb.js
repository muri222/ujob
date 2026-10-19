/// <reference path="../pb_data/types.d.ts" />

routerUse((e) => {
  const path = e.request.url.path;
  const headers = e.response.header();
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");

  if ($os.getenv("PB_DASHBOARD") === "1") return e.next();

  const OPEN_API = [
    /^\/api\/health$/,
    /^\/api\/realtime$/,
    /^\/api\/scout\//,
    /^\/api\/ujob\//,
    /^\/api\/radar\//,
    /^\/api\/collections\/(_superusers|bots)\/(auth-with-password|auth-refresh)$/,
    /^\/api\/collections\/(jobs|sources|runs|applications|searches|profile|ai_tasks|ai_log)\/records(\/[a-z0-9]{15})?$/,
    /^\/api\/files\/token$/,
    /^\/api\/files\/profile\/[a-z0-9]{15}\/[\w.-]+$/,
  ];
  const TRAPS = [/^\/_\/?/, /^\/(wp-admin|wp-login\.php|xmlrpc\.php|phpmyadmin|administrator|\.env|\.git)/i];
  const REPLIES = [
    "Vaga de invasor encerrada. Nem chegou a abrir.",
    "Currículo recebido. Infelizmente seguimos com outros candidatos.",
    "Essa porta é de enfeite. A de verdade tem crachá.",
    "Processo seletivo pra hacker: reprovado na triagem.",
  ];

  if (TRAPS.some((rule) => rule.test(path))) {
    try {
      const hit = new Record($app.findCollectionByNameOrId("honeypot_hits"));
      hit.load({ ip: e.realIP(), method: e.request.method, path: path.slice(0, 200), userAgent: e.request.header.get("User-Agent").slice(0, 300) });
      $app.save(hit);
    } catch {}
    const reply = REPLIES[Math.floor(Math.random() * REPLIES.length)];
    return e.html(404, `<!doctype html><meta charset=utf-8><title>404</title><p>${reply}</p>`);
  }

  if (path.startsWith("/api/") && !OPEN_API.some((rule) => rule.test(path))) {
    return e.json(404, { message: "Essa vaga não existe. Nem a rota." });
  }

  // cada conta de serviço só enxerga a própria API
  const role = e.auth?.collection().name === "bots" ? e.auth.getString("role") : "";
  if ((role !== "scout" && role && path.startsWith("/api/scout/")) || (role !== "brain" && role && path.startsWith("/api/radar/tasks"))) {
    return e.json(403, { message: "Crachá errado pra essa porta." });
  }

  if (!path.startsWith("/api/")) {
    headers.set("Cache-Control", "no-store");
    headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "img-src 'self' data: https:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
    );
  }
  return e.next();
});
