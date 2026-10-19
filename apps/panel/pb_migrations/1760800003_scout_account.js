/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  require(`${__hooks}/scout_account.js`)(app);
});
