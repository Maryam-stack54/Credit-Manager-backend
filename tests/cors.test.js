// Tests for letting the web version of the app call the backend (CORS).
// Run with:  npm test
//
// No database is needed. Each test starts a tiny server with the same
// CORS middleware the real backend uses.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const { createCorsMiddleware, parseOrigins } = require("../Middlewares/corsMiddleware");

// Starts a server that uses the middleware with the given settings
const startServer = async (env) => {
  const app = express();
  app.use(createCorsMiddleware(env));
  app.get("/health", (req, res) => res.json({ status: "ok" }));
  app.patch("/api/staff/1/status", (req, res) => res.json({ changed: true }));

  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });

  return { server, url: `http://127.0.0.1:${server.address().port}` };
};

const ask = (url, path, { method = "GET", origin, headers = {} } = {}) =>
  fetch(`${url}${path}`, {
    method,
    headers: { ...(origin ? { Origin: origin } : {}), ...headers },
  });

describe("Website access (CORS)", () => {
  let local;
  let configured;

  before(async () => {
    // No WEB_ORIGINS set: only this computer is allowed
    local = await startServer({});
    // Two websites listed, one with a trailing slash and extra spaces
    configured = await startServer({
      WEB_ORIGINS: " https://shop.netlify.app/ , https://creditmanager.example.com ",
    });
  });

  after(async () => {
    await Promise.all([local, configured].map(({ server }) => new Promise((resolve) => server.close(resolve))));
  });

  it("cleans up the WEB_ORIGINS setting", () => {
    assert.deepEqual(parseOrigins(" https://a.com/ , https://b.com,, "), ["https://a.com", "https://b.com"]);
    assert.deepEqual(parseOrigins(""), []);
    assert.deepEqual(parseOrigins(undefined), []);
  });

  it("allows the web app while it runs on this computer, on any port", async () => {
    for (const origin of ["http://localhost:8081", "http://localhost:19006", "http://127.0.0.1:4173", "http://localhost"]) {
      const response = await ask(local.url, "/health", { origin });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("access-control-allow-origin"), origin, origin);
    }
  });

  it("does not allow any other website unless it is listed", async () => {
    for (const origin of [
      "https://evil.example",
      "https://shop.netlify.app",
      "http://localhost.evil.com",
      "https://localhost:8081.evil.com",
    ]) {
      const response = await ask(local.url, "/health", { origin });

      assert.equal(response.headers.get("access-control-allow-origin"), null, origin);
    }
  });

  it("allows exactly the websites listed in WEB_ORIGINS", async () => {
    for (const origin of ["https://shop.netlify.app", "https://creditmanager.example.com"]) {
      const response = await ask(configured.url, "/health", { origin });
      assert.equal(response.headers.get("access-control-allow-origin"), origin, origin);
    }

    for (const origin of ["https://other.netlify.app", "http://shop.netlify.app", "https://shop.netlify.app.evil.com"]) {
      const response = await ask(configured.url, "/health", { origin });
      assert.equal(response.headers.get("access-control-allow-origin"), null, origin);
    }
  });

  it("answers the browser's permission check for PATCH with a token, before the real request", async () => {
    const response = await ask(configured.url, "/api/staff/1/status", {
      method: "OPTIONS",
      origin: "https://shop.netlify.app",
      headers: {
        "Access-Control-Request-Method": "PATCH",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://shop.netlify.app");
    assert.match(response.headers.get("access-control-allow-methods"), /PATCH/);
    assert.match(response.headers.get("access-control-allow-methods"), /DELETE/);
    assert.match(response.headers.get("access-control-allow-headers"), /Authorization/i);
    assert.match(response.headers.get("access-control-allow-headers"), /Content-Type/i);
  });

  it("refuses the permission check from a website that is not allowed", async () => {
    const response = await ask(configured.url, "/api/staff/1/status", {
      method: "OPTIONS",
      origin: "https://evil.example",
      headers: {
        "Access-Control-Request-Method": "PATCH",
        "Access-Control-Request-Headers": "authorization",
      },
    });

    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(response.headers.get("access-control-allow-methods"), null);
  });

  it("does not change anything for the phone apps, which send no Origin", async () => {
    const response = await ask(configured.url, "/health");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });

  it("never allows cookies to be sent with the requests", async () => {
    const response = await ask(local.url, "/health", { origin: "http://localhost:8081" });

    assert.equal(response.headers.get("access-control-allow-credentials"), null);
  });
});
