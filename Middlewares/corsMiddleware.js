const cors = require("cors");

// Lets a website (the web version of Credit Manager) call this backend from
// a browser. Browsers refuse such calls unless the server says the website
// is allowed. The phone apps are not browsers and never send an Origin, so
// this does not change how they work.
//
// Which websites are allowed:
//  - Any page running on this computer (localhost), so the web app works
//    while it is being developed.
//  - Every address listed in the WEB_ORIGINS setting, separated by commas,
//    for example: https://my-credit-manager.netlify.app
//
// No other website can call the backend from a browser.
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// Turns a setting such as "https://a.com, https://b.com/" into a clean list
const parseOrigins = (value) =>
  String(value || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

const createCorsMiddleware = (env = process.env) => {
  const allowed = parseOrigins(env.WEB_ORIGINS);

  return cors({
    origin: (origin, callback) => {
      // No Origin means it is not a browser (the phone app, a tool)
      if (!origin) return callback(null, true);

      return callback(null, LOCAL_ORIGIN.test(origin) || allowed.includes(origin));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    // The app sends its token in the Authorization header, not in cookies
    credentials: false,
    // Browsers may remember the answer for 10 minutes
    maxAge: 600,
  });
};

module.exports = { createCorsMiddleware, parseOrigins };
