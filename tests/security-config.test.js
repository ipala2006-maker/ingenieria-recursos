const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { isPublicSupabaseKey } = require("../api/_lib/public-config");

const source = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const legacyKey = role => [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ role, iss: "supabase" })).toString("base64url"),
  Buffer.from("test-signature-not-a-real-key").toString("base64url")
].join(".");
const publicKey = "sb_publishable_" + "example".repeat(5);

test("administrative credentials reject Unicode lookalikes without throwing", () => {
  const sandbox = { module: { exports: {} }, Buffer, require: () => crypto,
    process: { env: { USER_REGISTRY_EXPORT_TOKEN: "a".repeat(48) } } };
  vm.runInNewContext(source("api/_lib/admin-auth.js"), sandbox);
  const validate = value => sandbox.module.exports.hasValidAdminToken({ headers: { authorization: value } });
  assert.equal(validate("Bearer " + "a".repeat(48)), true);
  assert.equal(validate("Bearer " + "b".repeat(48)), false);
  assert.equal(validate("Bearer " + "\u00e9".repeat(48)), false);
  assert.equal(validate("Bearer " + "a".repeat(10000)), false);
  assert.equal(validate("Basic " + "a".repeat(48)), false);
  assert.equal(validate(""), false);
  sandbox.process.env.USER_REGISTRY_EXPORT_TOKEN = "short";
  assert.equal(validate("Bearer short"), false);
});

test("only publishable or legacy anon Supabase keys can be disclosed", () => {
  assert.equal(isPublicSupabaseKey(publicKey), true);
  assert.equal(isPublicSupabaseKey(legacyKey("anon")), true);
  for (const key of ["sb_secret_" + "example".repeat(5), legacyKey("service_role"),
    legacyKey("authenticated"), "malformed", "a.invalid.c", "", null, "a".repeat(3000)]) {
    assert.equal(isPublicSupabaseKey(key), false);
  }
});

test("public config fails closed when a private key is accidentally configured", async () => {
  for (const key of [publicKey, legacyKey("anon"), "sb_secret_" + "example".repeat(5), legacyKey("service_role")]) {
    const sandbox = { module: { exports: {} }, process: { env: {
      SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: key
    } }, require(name) {
      if (name === "./_lib/public-config") return { isPublicSupabaseKey };
      if (name === "./_lib/request-security") return { setSecurityHeaders() {}, enforceRateLimit: async () => true };
      throw new Error("Unexpected dependency");
    } };
    vm.runInNewContext(source("api/account-config.js"), sandbox);
    let status, body;
    const response = { status(code) { status = code; return this; }, json(value) { body = value; } };
    await sandbox.module.exports({ method: "GET", query: {} }, response);
    assert.equal(status, isPublicSupabaseKey(key) ? 200 : 503);
    assert.equal(body.enabled, isPublicSupabaseKey(key));
    if (!isPublicSupabaseKey(key)) {
      assert.equal(JSON.stringify(body).includes(key), false);
      assert.equal("publishableKey" in body, false);
    }
  }
});

test("Supabase CDN fallback verifies the same pinned library as the server proxy", async () => {
  const account = source("scripts/account.js");
  const cdn = account.match(/const SUPABASE_CDN = "([^"]+)"/)[1];
  const integrity = account.match(/const SUPABASE_INTEGRITY = "([^"]+)"/)[1];
  const digest = source("api/supabase-client.js").match(/const SUPABASE_CLIENT_SHA256 = "([^"]+)"/)[1];
  assert.equal(integrity, "sha256-" + Buffer.from(digest, "hex").toString("base64"));
  const implementation = account.slice(account.indexOf("  function loadScript(source)"), account.indexOf("  async function signIn()"));
  let appended;
  const sandbox = { SUPABASE_CDN: cdn, SUPABASE_INTEGRITY: integrity, Promise,
    window: { supabase: { createClient() {} } },
    document: { createElement: () => ({ dataset: {} }), head: { appendChild(script) { appended = script; queueMicrotask(script.onload); } } } };
  vm.runInNewContext(implementation, sandbox);
  await sandbox.loadScript(cdn);
  assert.equal(appended.integrity, integrity);
  assert.equal(appended.crossOrigin, "anonymous");
  await sandbox.loadScript("/api/supabase-client");
  assert.equal(appended.integrity, undefined);
});
