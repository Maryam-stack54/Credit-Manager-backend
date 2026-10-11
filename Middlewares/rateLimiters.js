const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

// Stops password guessing: after 10 failed logins for the same username
// from the same network within 15 minutes, further attempts are refused
// until the 15 minutes are up. Successful logins do not count.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${ipKeyGenerator(req.ip)}:${String(req.body?.username || "")
      .trim()
      .toLowerCase()}`,
  message: {
    message:
      "Too many failed login attempts. Please wait 15 minutes and try again.",
  },
});

// Stops one device from creating accounts in bulk
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many accounts created. Please try again in an hour.",
  },
});

module.exports = {
  loginLimiter,
  registerLimiter,
};
