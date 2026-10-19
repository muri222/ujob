/// <reference path="../pb_data/types.d.ts" />

onBootstrap((e) => {
  e.next();
  try {
    require(`${__hooks}/scout_account.js`)(e.app);
  } catch {}
});
