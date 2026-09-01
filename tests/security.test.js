const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { requireJsonRequest } = require("../api/_lib/request-security");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("JSON endpoints reject non-JSON content", () => {
  let status = 0;
  let payload = null;
  const response = {
    status(value) { status = value; return this; },
    json(value) { payload = value; return this; }
  };
  assert.equal(requireJsonRequest({ headers: { "content-type": "text/plain" } }, response), false);
  assert.equal(status, 415);
  assert.match(payload.message, /JSON/);
  assert.equal(requireJsonRequest({ headers: { "content-type": "application/json; charset=utf-8" } }, response), true);
});

test("database tables enforce RLS and workspace uploads are constrained", () => {
  for (const file of ["schema.sql", "plans.sql", "security.sql", "user-registry.sql", "whatsapp.sql", "workspace.sql"]) {
    assert.match(read(`supabase/${file}`), /force row level security/i, file);
  }
  const workspace = read("supabase/workspace.sql");
  assert.match(workspace, /file_size_limit[^;]+52428800/is);
  assert.match(workspace, /allowed_mime_types/i);
  assert.match(workspace, /IMMUTABLE_WORKSPACE_FIELDS/);
  assert.match(workspace, /workspace_storage_upload_allowed/);
});

test("Android widget credentials use the platform keystore", () => {
  const source = read("android-app/app/src/main/java/com/estudiemos/app/WidgetSyncManager.java");
  assert.match(source, /AndroidKeyStore/);
  assert.match(source, /AES\/GCM\/NoPadding/);
  assert.match(source, /encryptSecret\(accessToken\)/);
});

test("global web responses include the expected security policy", () => {
  const config = read("vercel.json");
  for (const header of [
    "Strict-Transport-Security",
    "Content-Security-Policy",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Cross-Origin-Resource-Policy",
    "Permissions-Policy"
  ]) assert.match(config, new RegExp(header));
});
