const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const vault = require('../api/_lib/drive-vault');
const { verifyNextOAuthSecret } = require('../api/_lib/drive-oauth-check');

const vars = ['DRIVE_OAUTH_CHECK_ENABLED', 'DRIVE_OAUTH_CHECK_EXPIRES_AT', 'DRIVE_OAUTH_CHECK_USER_ID',
  'GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_CLIENT_SECRET_NEXT',
  'DRIVE_TOKEN_ENCRYPTION_KEY', 'DRIVE_TOKEN_KEYRING', 'DRIVE_TOKEN_ACTIVE_KEY_ID'];
const now = Date.parse('2026-10-28T22:00:00Z');
const id = '00000000-0000-4000-8000-000000000001';

async function fixture(run) {
  const before = Object.fromEntries(vars.map(key => [key, process.env[key]]));
  for (const key of vars) delete process.env[key];
  Object.assign(process.env, {
    DRIVE_OAUTH_CHECK_ENABLED: 'true', DRIVE_OAUTH_CHECK_EXPIRES_AT: new Date(now + 600000).toISOString(),
    DRIVE_OAUTH_CHECK_USER_ID: id, GOOGLE_DRIVE_CLIENT_ID: '123456-fixture.apps.googleusercontent.com',
    GOOGLE_DRIVE_CLIENT_SECRET: 'fixture-old-secret', GOOGLE_DRIVE_CLIENT_SECRET_NEXT: 'fixture-next-secret',
    DRIVE_TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex')
  });
  const grant = { refreshToken: 'fixture-refresh-token', accessToken: 'fixture-old-access', expiresAt: now - 1000 };
  const ciphertext = vault.seal(grant, 'user:' + id);
  let reads = 0, refreshes = 0;
  const io = {
    readGrant: async target => { reads++; assert.equal(target, id); return [{ credentials: ciphertext }]; },
    refresh: async args => {
      refreshes++;
      assert.deepEqual(args, { clientId: process.env.GOOGLE_DRIVE_CLIENT_ID, clientSecret: 'fixture-next-secret', refreshToken: grant.refreshToken });
      return { access_token: 'fixture-new-access', expiry_date: now + 3600000, refresh_token: grant.refreshToken };
    }
  };
  try { await run({ io, grant, ciphertext, counts: () => ({ reads, refreshes }) }); }
  finally { for (const key of vars) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; } }
}

test('OAuth check is off by default and rejects expired or unbounded windows before any IO', () => fixture(async ({ io, counts }) => {
  for (const value of [undefined, 'false', '1']) {
    if (value === undefined) delete process.env.DRIVE_OAUTH_CHECK_ENABLED; else process.env.DRIVE_OAUTH_CHECK_ENABLED = value;
    assert.equal((await verifyNextOAuthSecret(io, now)).code, 'CHECK_DISABLED');
  }
  process.env.DRIVE_OAUTH_CHECK_ENABLED = 'true';
  for (const value of ['', 'invalid', new Date(now).toISOString(), new Date(now + 3600001).toISOString()]) {
    process.env.DRIVE_OAUTH_CHECK_EXPIRES_AT = value;
    assert.equal((await verifyNextOAuthSecret(io, now)).code, 'CHECK_DISABLED');
  }
  assert.deepEqual(counts(), { reads: 0, refreshes: 0 });
}));

test('OAuth check requires a fixed valid test account and a separate well-formed next secret', () => fixture(async ({ io, counts }) => {
  for (const [key, value] of [['DRIVE_OAUTH_CHECK_USER_ID', '../another-account'], ['GOOGLE_DRIVE_CLIENT_ID', 'invalid'],
    ['GOOGLE_DRIVE_CLIENT_SECRET_NEXT', ''], ['GOOGLE_DRIVE_CLIENT_SECRET_NEXT', 'fixture-old-secret'],
    ['GOOGLE_DRIVE_CLIENT_SECRET_NEXT', ' value '], ['GOOGLE_DRIVE_CLIENT_SECRET_NEXT', 'value\n'],
    ['GOOGLE_DRIVE_CLIENT_SECRET_NEXT', 'x'.repeat(2049)]]) {
    const previous = process.env[key]; process.env[key] = value;
    assert.equal((await verifyNextOAuthSecret(io, now)).code, 'CHECK_NOT_CONFIGURED'); process.env[key] = previous;
  }
  assert.deepEqual(counts(), { reads: 0, refreshes: 0 });
}));

test('OAuth check refreshes one existing encrypted grant without saving or returning credentials', () => fixture(async ({ io, counts, ciphertext }) => {
  const result = await verifyNextOAuthSecret(io, now);
  assert.deepEqual(result, { ok: true, code: 'OAUTH_REFRESH_VERIFIED' });
  assert.deepEqual(counts(), { reads: 1, refreshes: 1 });
  assert.doesNotMatch(JSON.stringify(result), /fixture-|refreshToken|access_token|credentials/);
  assert.equal(vault.unseal(ciphertext, 'user:' + id).accessToken, 'fixture-old-access');
}));

test('OAuth check does not refresh when the grant is missing, corrupt or belongs to another account', () => fixture(async ({ io, counts, grant }) => {
  for (const rows of [null, [], [{ credentials: 'a' }, { credentials: 'b' }], [{}]]) {
    assert.equal((await verifyNextOAuthSecret({ ...io, readGrant: async () => rows }, now)).code, 'TEST_GRANT_UNAVAILABLE');
  }
  for (const credentials of ['corrupt', vault.seal(grant, 'user:00000000-0000-4000-8000-000000000002')]) {
    assert.equal((await verifyNextOAuthSecret({ ...io, readGrant: async () => [{ credentials }] }, now)).code, 'TEST_GRANT_UNREADABLE');
  }
  const missing = vault.seal({ accessToken: 'fixture-only' }, 'user:' + id);
  assert.equal((await verifyNextOAuthSecret({ ...io, readGrant: async () => [{ credentials: missing }] }, now)).code, 'TEST_GRANT_UNAVAILABLE');
  assert.equal(counts().refreshes, 0);
}));

test('OAuth provider errors and unexpected credentials are reduced to static safe results', () => fixture(async ({ io }) => {
  for (const [provider, expected] of [['invalid_client', 'NEXT_SECRET_REJECTED'], ['unauthorized_client', 'NEXT_SECRET_REJECTED'],
    ['invalid_grant', 'TEST_GRANT_REJECTED'], ['private-token-value', 'OAUTH_PROVIDER_UNAVAILABLE']]) {
    const result = await verifyNextOAuthSecret({ ...io, refresh: async () => { throw { message: 'fixture-secret', response: { data: { error: provider, access_token: 'fixture-private' } } }; } }, now);
    assert.deepEqual(result, { ok: false, code: expected }); assert.doesNotMatch(JSON.stringify(result), /fixture-|private-token/);
  }
  assert.equal((await verifyNextOAuthSecret({ ...io, readGrant: async () => { throw new Error('fixture-private'); } }, now)).code, 'TEST_GRANT_READ_FAILED');
  for (const tokens of [null, {}, { access_token: 'fixture-access', expiry_date: now }, { access_token: 'fixture-access', expiry_date: 'future' },
    { access_token: 'fixture-access', expiry_date: now + 10000, refresh_token: '' }]) {
    assert.equal((await verifyNextOAuthSecret({ ...io, refresh: async () => tokens }, now)).code, 'REFRESH_RESPONSE_INVALID');
  }
  assert.equal((await verifyNextOAuthSecret({ ...io, refresh: async () => ({ access_token: 'fixture-access', expiry_date: now + 10000, refresh_token: 'fixture-rotated' }) }, now)).code, 'TEST_GRANT_ROTATED_REVIEW_REQUIRED');
}));

test('default adapters use one read-only query and Google library timeout without retries or database writes', () => fixture(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../api/_lib/drive-oauth-check.js'), 'utf8');
  const calls = [], module = { exports: {} };
  class FakeOAuth {
    constructor(options) { calls.push(['client', options]); }
    setCredentials(tokens) { assert.equal(tokens.refresh_token, 'fixture-refresh-token'); }
    async refreshAccessToken() { return { credentials: { access_token: 'fixture-new-access', expiry_date: now + 10000 } }; }
  }
  vm.runInNewContext(source, { module, exports: module.exports, process, Date, Number, require: name => {
    if (name === 'google-auth-library') return { OAuth2Client: FakeOAuth };
    if (name === './drive-vault') return vault;
    if (name === './supabase-admin') return { adminRequest: async (url, options) => {
      assert.equal(options, undefined); calls.push(['read', url]); return [{ credentials: vault.seal({ refreshToken: 'fixture-refresh-token' }, 'user:' + id) }];
    } };
    throw new Error('Unexpected dependency');
  } });
  assert.equal((await module.exports.verifyNextOAuthSecret(undefined, now)).ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1], '/rest/v1/drive_connections?select=credentials&user_id=eq.' + id + '&limit=1');
  const options = calls[1][1];
  assert.equal(options.clientId, process.env.GOOGLE_DRIVE_CLIENT_ID); assert.equal(options.clientSecret, 'fixture-next-secret');
  assert.equal(options.transporterOptions.timeout, 12000); assert.equal(options.transporterOptions.retry, false);
}));
