const test = require('node:test'), assert = require('node:assert/strict');
const { verifyRecipher } = require('../api/_lib/drive-recipher-check');
const { run } = require('../scripts/verify-drive-oauth-build.cjs');
const now = Date.parse('2026-10-28T21:30:00Z');
const keys = ['DRIVE_RECIPHER_ENABLED', 'DRIVE_RECIPHER_EXPIRES_AT', 'DRIVE_RECIPHER_MODE', 'DRIVE_RECIPHER_TARGET_KEY_ID', 'DRIVE_REKEY_ENABLED', 'DRIVE_TOKEN_ACTIVE_KEY_ID', 'DRIVE_TOKEN_KEYRING'];
async function fixture(fn) {
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, { DRIVE_RECIPHER_ENABLED: 'true', DRIVE_RECIPHER_EXPIRES_AT: new Date(now + 600000).toISOString(), DRIVE_RECIPHER_TARGET_KEY_ID: 'fixture', DRIVE_TOKEN_ACTIVE_KEY_ID: 'fixture', DRIVE_TOKEN_KEYRING: JSON.stringify({ fixture: 'ab'.repeat(32) }) });
  try { await fn(); } finally { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
}
const batch = extra => ({ dryRun: true, target: 'fixture', scanned: 1, current: 0, wouldChange: 1, changed: 0, conflicts: 0, failed: 0, hasMore: false, retryRequired: false, nextCursor: '00000000-0000-4000-8000-000000000001', ...extra });

test('recipher operator is disabled, expiring, preview-only by default and requires a matching explicit target', () => fixture(async () => {
  let called = 0; const execute = async () => { called++; return batch(); };
  process.env.DRIVE_RECIPHER_ENABLED = 'false'; assert.equal((await verifyRecipher({ now, execute })).code, 'CHECK_DISABLED');
  process.env.DRIVE_RECIPHER_ENABLED = 'true';
  for (const expires of ['', new Date(now).toISOString(), new Date(now + 3600001).toISOString()]) { process.env.DRIVE_RECIPHER_EXPIRES_AT = expires; assert.equal((await verifyRecipher({ now, execute })).code, 'CHECK_DISABLED'); }
  process.env.DRIVE_RECIPHER_EXPIRES_AT = new Date(now + 600000).toISOString();
  process.env.DRIVE_RECIPHER_TARGET_KEY_ID = 'other'; assert.equal((await verifyRecipher({ now, execute })).code, 'CHECK_NOT_CONFIGURED');
  process.env.DRIVE_RECIPHER_TARGET_KEY_ID = 'fixture'; process.env.DRIVE_RECIPHER_MODE = 'commit';
  assert.equal((await verifyRecipher({ now, execute })).code, 'CHECK_DISABLED'); assert.equal(called, 0);
}));

test('preview receives a bounded non-writing batch and exposes only safe counters', () => fixture(async () => {
  const result = await verifyRecipher({ now, execute: async options => { assert.deepEqual(options, { limit: 25, commit: false }); return batch({ credentials: 'never-output' }); } });
  assert.equal(result.ok, true); assert.equal(result.code, 'DRIVE_RECIPHER_PREVIEW_VERIFIED'); assert.equal(result.dryRun, true);
  assert.doesNotMatch(JSON.stringify(result), /fixture|00000000|credentials|target|nextCursor|never-output/);
}));

test('commit requires two explicit switches and reports only confirmed changes', () => fixture(async () => {
  process.env.DRIVE_RECIPHER_MODE = 'commit'; process.env.DRIVE_REKEY_ENABLED = 'true';
  const result = await verifyRecipher({ now, execute: async options => { assert.deepEqual(options, { limit: 25, commit: true }); return batch({ dryRun: false, changed: 1 }); } });
  assert.equal(result.code, 'DRIVE_RECIPHER_COMMITTED'); assert.equal(result.changed, 1); assert.equal(result.ok, true);
  assert.equal((await verifyRecipher({ now, execute: async () => batch({ dryRun: false, current: 1, wouldChange: 0 }) })).ok, true);
}));

test('conflicts, failures and additional pages cannot be reported as a complete recipher', () => fixture(async () => {
  for (const extra of [{ hasMore: true }, { failed: 1, wouldChange: 0, retryRequired: true }]) {
    const result = await verifyRecipher({ now, execute: async () => batch(extra) }); assert.equal(result.ok, false); assert.equal(result.code, 'DRIVE_RECIPHER_INCOMPLETE');
  }
  process.env.DRIVE_RECIPHER_MODE = 'commit'; process.env.DRIVE_REKEY_ENABLED = 'true';
  assert.equal((await verifyRecipher({ now, execute: async () => batch({ dryRun: false, conflicts: 1, retryRequired: true }) })).ok, false);
}));

test('malformed results and private errors fail closed without returning diagnostic data', () => fixture(async () => {
  for (const extra of [{ scanned: 26 }, { changed: 1 }, { retryRequired: true }, { failed: -1 }, { target: 'other' }, { current: 2 }]) {
    assert.deepEqual(await verifyRecipher({ now, execute: async () => batch(extra) }), { ok: false, code: 'DRIVE_RECIPHER_FAILED' });
  }
  assert.deepEqual(await verifyRecipher({ now, execute: async () => { throw Error('private-grant'); } }), { ok: false, code: 'DRIVE_RECIPHER_FAILED' });
}));

test('isolated build strips grant identifiers and validates recipher success consistently', async () => {
  const env = { VERCEL: '1', VERCEL_ENV: 'production', SUPABASE_URL: 'https://gxilgicgxhkdjmmyhrdd.supabase.co', GOOGLE_DRIVE_CLIENT_ID: '835849509868-nbidpe7k5of5a6dd69k2k60l1vsverai.apps.googleusercontent.com', DRIVE_PROBE_MODE: 'recipher' };
  const good = { ok: true, code: 'DRIVE_RECIPHER_PREVIEW_VERIFIED', dryRun: true, scanned: 1, current: 0, wouldChange: 1, changed: 0, conflicts: 0, failed: 0, hasMore: false, retryRequired: false };
  assert.deepEqual(await run({ env, verify: async () => ({ ...good, nextCursor: 'private', credentials: 'private' }) }), good);
  for (const extra of [{ scanned: 26 }, { changed: 1 }, { hasMore: true }, { code: 'DRIVE_RECIPHER_COMMITTED' }, { current: 2 }]) assert.equal((await run({ env, verify: async () => ({ ...good, ...extra }) })).code, 'CHECK_FAILED');
});
