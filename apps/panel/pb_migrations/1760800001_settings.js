/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const settings = app.settings();

  settings.meta.appName = "ujob";
  settings.meta.hideControls = true;
  settings.trustedProxy.headers = ["X-Forwarded-For"];
  settings.trustedProxy.useLeftmostIP = false;
  settings.batch.enabled = false;

  settings.rateLimits.enabled = true;
  settings.rateLimits.rules = [
    { label: "*:auth", audience: "@guest", maxRequests: 5, duration: 60 },
    { label: "*:create", audience: "@guest", maxRequests: 10, duration: 60 },
  ];

  app.save(settings);

  const superusers = app.findCollectionByNameOrId("_superusers");
  superusers.authToken.duration = 28800;
  app.save(superusers);
});
