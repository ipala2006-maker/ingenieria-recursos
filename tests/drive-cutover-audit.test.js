const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const vault = require('../api/_lib/drive-vault');
const { auditDriveConnections } = require('../api/_lib/drive-cutover-audit');
const { run } = require('../scripts/verify-drive-oauth-build.cjs');
const vars = ['DRIVE_AUDIT_ENABLED', 'DRIVE_AUDIT_EXPIRES_AT', 'DRIVE_TOKEN_ENCRYPTION_KEY', 'DRIVE_TOKEN_KEYRING', 'DRIVE_TOKEN_ACTIVE_KEY_ID'];
const now = Date.parse('2026-10-28T21:30:00Z');
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
async function fixture(fn) {
  const previous = Object.fromEntries(vars.map(key => [key, process.env[key]]));
  for (const key of vars) delete process.env[key];
  process.env.DRIVE_AUDIT_ENABLED = 'true'; process.env.DRIVE_AUDIT_EXPIRES_AT = new Date(now + 600000).toISOString();
  process.env.DRIVE_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  try { await fn(); } finally { for (const key of vars) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
}
test('Drive inventory is disabled or expired before reading schema or grants', () => fixture(async () => {
  let reads = 0; const io = { schema: async () => { reads++; }, listPage: async () => { reads++; } };
  for (const value of ['', 'false', '1']) { process.env.DRIVE_AUDIT_ENABLED = value; assert.equal((await auditDriveConnections(io, now)).code, 'CHECK_DISABLED'); }
  process.env.DRIVE_AUDIT_ENABLED = 'true';
  for (const expires of [now, now + 3600001, NaN]) { process.env.DRIVE_AUDIT_EXPIRES_AT = Number.isFinite(expires) ? new Date(expires).toISOString() : ''; assert.equal((await auditDriveConnections(io, now)).code, 'CHECK_DISABLED'); }
  assert.equal(reads, 0);
}));
test('Drive inventory verifies bounded pages, only returns counts and detects the service-only CAS schema entry', () => fixture(async () => {
  const rows = Array.from({ length: 27 }, (_, index) => ({ user_id: id(index + 1), credentials: vault.seal({ refreshToken: 'fixture-secret-' + index }, 'user:' + id(index + 1)) }));
  let pages = 0;
  const result = await auditDriveConnections({ schema: async () => ({ paths: { '/rpc/recipher_drive_connection': {} } }), listPage: async (after, limit) => { pages++; assert.equal(limit, 26); return rows.filter(row => row.user_id > after).slice(0, limit); } }, now);
  assert.deepEqual(result, { ok: true, code: 'DRIVE_AUDIT_COMPLETE', checked: 27, legacy: 27, versioned: 0, unreadable: 0, complete: true, schemaAvailable: true, casRegistered: true });
  assert.equal(pages, 2); assert.doesNotMatch(JSON.stringify(result), /fixture|credentials|user_id|00000000/);
}));
test('Drive inventory distinguishes missing CAS from unavailable metadata without guessing permissions', () => fixture(async () => {
  for (const [schema, available, registered] of [[async () => ({ paths: {} }), true, false], [async () => { throw new Error('fixture-private'); }, false, null], [async () => 'not schema', false, null]]) {
    const result = await auditDriveConnections({ schema, listPage: async () => [] }, now);
    assert.equal(result.schemaAvailable, available); assert.equal(result.casRegistered, registered); assert.equal(result.checked, 0);
  }
}));
test('Drive inventory rejects corrupt or wrong-user grants without deleting data or exposing identifiers', () => fixture(async () => {
  const source = vault.seal({ refreshToken: 'fixture-only' }, 'user:' + id(1));
  const rows = [{ user_id: id(1), credentials: 'corrupt' }, { user_id: id(2), credentials: source }];
  const result = await auditDriveConnections({ schema: async () => ({ paths: {} }), listPage: async () => rows }, now);
  assert.equal(result.ok, false); assert.equal(result.unreadable, 2); assert.equal(result.complete, true); assert.equal(result.code, 'DRIVE_AUDIT_INCOMPLETE');
  assert.equal(rows[1].credentials, source); assert.doesNotMatch(JSON.stringify(result), /fixture|corrupt|00000000/);
}));
test('Drive inventory sanitizes read errors and refuses unordered or oversized pages', () => fixture(async () => {
  const base = { schema: async () => ({ paths: {} }) };
  for (const listPage of [async () => { throw new Error('fixture-private'); }, async () => Array(27).fill({}), async () => [{ user_id: id(2), credentials: 'a' }, { user_id: id(1), credentials: 'b' }]]) {
    assert.deepEqual(await auditDriveConnections({ ...base, listPage }, now), { ok: false, code: 'DRIVE_AUDIT_READ_FAILED' });
  }
}));

test('Drive inventory never reports a capped scan as a complete migration audit', () => fixture(async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => ({ user_id: id(index + 1), credentials: vault.seal({ refreshToken: 'fixture-only' }, 'user:' + id(index + 1)) }));
  let pages = 0;
  const result = await auditDriveConnections({ schema: async () => ({ paths: {} }), listPage: async (after, limit) => { pages++; return rows.filter(row => row.user_id > after).slice(0, limit); } }, now);
  assert.equal(pages, 40); assert.equal(result.checked, 1000);
  assert.equal(result.ok, false); assert.equal(result.complete, false);
  assert.equal(result.code, 'DRIVE_AUDIT_INCOMPLETE'); assert.equal(result.unreadable, 0);
}));
test('build wrapper returns only bounded audit counters and cannot confuse audit success with a write permission', async () => {
  const env = { VERCEL: '1', VERCEL_ENV: 'production', SUPABASE_URL: 'https://gxilgicgxhkdjmmyhrdd.supabase.co', GOOGLE_DRIVE_CLIENT_ID: '835849509868-nbidpe7k5of5a6dd69k2k60l1vsverai.apps.googleusercontent.com', DRIVE_PROBE_MODE: 'audit' };
  const result = { ok: true, code: 'DRIVE_AUDIT_COMPLETE', checked: 2, legacy: 2, versioned: 0, unreadable: 0, complete: true, schemaAvailable: true, casRegistered: false };
  assert.deepEqual(await run({ env, verify: async () => ({ ...result, credentials: 'fixture-private' }) }), result);
  for (const extra of [{ checked: -1 }, { checked: 1001 }, { casRegistered: 'true' }, { schemaAvailable: false }, { unreadable: 1 }, { complete: false }]) assert.equal((await run({ env, verify: async () => ({ ...result, ...extra }) })).code, 'CHECK_FAILED');
});
