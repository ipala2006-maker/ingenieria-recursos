const crypto = require("node:crypto");
const fs = require("node:fs");

const confirmation = process.env.RUN_PRODUCTION_SECURITY_TEST;
if (confirmation !== "I_OWN_THIS_PROJECT") {
  throw new Error("Set RUN_PRODUCTION_SECURITY_TEST=I_OWN_THIS_PROJECT to run temporary account tests.");
}

loadEnv(process.argv[2]);

const base = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || "";
const secretKey = process.env.SUPABASE_SECRET_KEY || "";
if (!base || !publishableKey || !secretKey) throw new Error("Supabase production variables are missing.");

const runId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const users = [];

main().catch((error) => {
  console.error(`Security integration failed: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  try {
    const accountA = await createAccount(`qa-a-${runId}@example.invalid`);
    const accountB = await createAccount(`qa-b-${runId}@example.invalid`);
    users.push(accountA.id, accountB.id);
    const sessionA = await signIn(accountA.email, accountA.password);
    const sessionB = await signIn(accountB.email, accountB.password);

    await rest(sessionA, "/rest/v1/user_states", {
      method: "POST",
      body: { user_id: accountA.id, state: { values: { security_probe: "account-a-only" } } },
      expected: [201]
    });

    const anonymous = await rest(null, `/rest/v1/user_states?user_id=eq.${encodeURIComponent(accountA.id)}&select=user_id`, {
      expected: [401, 403]
    });
    assert(anonymous.status === 401 || anonymous.status === 403, "Anonymous state access was not blocked.");

    const crossRead = await rest(sessionB, `/rest/v1/user_states?user_id=eq.${encodeURIComponent(accountA.id)}&select=user_id,state`, {
      expected: [200]
    });
    assert(Array.isArray(crossRead.data) && crossRead.data.length === 0, "Account B could read Account A state.");

    const crossUpdate = await rest(sessionB, `/rest/v1/user_states?user_id=eq.${encodeURIComponent(accountA.id)}`, {
      method: "PATCH",
      body: { state: { values: { security_probe: "tampered" } } },
      prefer: "return=representation",
      expected: [200]
    });
    assert(Array.isArray(crossUpdate.data) && crossUpdate.data.length === 0, "Account B could update Account A state.");

    const forgedInsert = await rest(sessionB, "/rest/v1/user_states", {
      method: "POST",
      body: { user_id: accountA.id, state: {} },
      expected: [401, 403, 409]
    });
    assert([401, 403, 409].includes(forgedInsert.status), "Account B could insert data for Account A.");

    const folderId = crypto.randomUUID();
    await rest(sessionA, "/rest/v1/workspace_items", {
      method: "POST",
      body: { id: folderId, user_id: accountA.id, kind: "folder", name: "Private QA folder" },
      expected: [201]
    });
    const crossWorkspace = await rest(sessionB, `/rest/v1/workspace_items?id=eq.${encodeURIComponent(folderId)}&select=id,name`, {
      expected: [200]
    });
    assert(Array.isArray(crossWorkspace.data) && crossWorkspace.data.length === 0, "Account B could read Account A workspace.");

    const registry = await rest(sessionA, "/rest/v1/user_registry?select=email", { expected: [401, 403] });
    assert(registry.status === 401 || registry.status === 403, "A student could read the administrative registry.");

    console.log("Security integration passed: anonymous access and cross-account reads/writes are blocked.");
  } finally {
    await Promise.allSettled(users.map(deleteAccount));
  }
}

async function createAccount(email) {
  const password = `Qa!${crypto.randomBytes(18).toString("base64url")}`;
  const response = await fetch(`${base}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { automated_qa: true } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) throw new Error(`Could not create QA account (${response.status}).`);
  return { id: data.id, email, password };
}

async function signIn(email, password) {
  const response = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(`Could not sign in QA account (${response.status}).`);
  return data.access_token;
}

async function deleteAccount(userId) {
  await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: adminHeaders()
  });
}

async function rest(accessToken, path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: publishableKey,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.prefer ? { Prefer: options.prefer } : {})
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });
  const text = await response.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch (_) {}
  if (options.expected && !options.expected.includes(response.status)) {
    throw new Error(`Unexpected ${response.status} from ${options.method || "GET"} ${path}.`);
  }
  return { status: response.status, data };
}

function adminHeaders() {
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json"
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadEnv(file) {
  if (!file || !fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).replace(/\\n/g, "\n");
    }
    process.env[match[1]] = value;
  }
}
