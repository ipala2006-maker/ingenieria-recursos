const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const scopes = require('../api/_lib/push-scope');
const { dispatchPush } = require('../api/_lib/push-dispatch');
const scope = { origin: scopes.CLOUDFLARE_ORIGIN, keyId: scopes.CLOUDFLARE_KEY_ID };

test('push identity derives only from fixed server origins and key versions', () => {
  assert.equal(scopes.scopeForEnvironment({}), null);
  assert.equal(scopes.scopeForEnvironment({ APP_ORIGIN: scopes.LEGACY_ORIGIN }), null);
  assert.deepEqual(scopes.scopeForEnvironment({ APP_ORIGIN: scope.origin, WEB_PUSH_KEY_ID: scope.keyId }), scope);
  for (const env of [{ APP_ORIGIN: scope.origin }, { APP_ORIGIN: scope.origin, WEB_PUSH_KEY_ID: 'legacy' },
    { APP_ORIGIN: 'https://attacker.invalid', WEB_PUSH_KEY_ID: scope.keyId }, { WEB_PUSH_KEY_ID: scope.keyId }]) {
    assert.throws(() => scopes.scopeForEnvironment(env), /INVALID_PUSH_SCOPE/);
  }
});

test('scoped dispatch reserves only the fixed origin and never falls back to a legacy claim', async () => {
  const calls = [];
  const result = await dispatchPush({ profile: 'cloudflare-free-single', scope, send: async () => {},
    rpc: async (name, body) => { calls.push({ name, body }); return name === 'claim_mobile_push_origin_batch' ? [{ id: 1 }] : null; } });
  assert.deepEqual(calls[0], { name: 'claim_mobile_push_origin_batch', body: { p_limit: 1, p_origin: scope.origin, p_key_id: scope.keyId } });
  assert.equal(result.sent, 1); assert.equal(result.subrequests, 3);
  const failedCalls = [];
  await assert.rejects(dispatchPush({ profile: 'vercel', scope, send: async () => {}, rpc: async name => {
    failedCalls.push(name); throw Object.assign(Error('Missing migration'), { status: 404, data: { code: 'PGRST202' } });
  } }), /Missing migration/);
  assert.deepEqual(failedCalls, ['claim_mobile_push_origin_batch']);
  await assert.rejects(dispatchPush({ profile: 'cloudflare-free-single', scope: { ...scope, keyId: 'legacy' },
    rpc: async () => assert.fail('Invalid scope must not call SQL'), send: async () => assert.fail() }), /INVALID_PUSH_SCOPE/);
});

function endpoint(env = {}, readiness = true) {
  const calls = [], source = fs.readFileSync(require.resolve('../api/_lib/mobile-push'), 'utf8');
  const context = { module: { exports: {} }, process: { env }, require: name => {
    if (name === 'node:crypto') return require(name);
    if (name === './push-scope') return { ...scopes, scopeForEnvironment: () => scopes.scopeForEnvironment(env) };
    if (name === './push-dispatch') return { dispatchPush };
    if (name === './push-credentials') return { validSubscription: () => true, validZone: () => true, cronAuthorized: () => false };
    if (name === './request-security') return { isSameOriginRequest: () => true, requireJsonRequest: () => true, enforceRateLimit: async () => true, rejectOversizedBody: () => false };
    if (name === './supabase-admin') return { authenticateBearer: async () => ({ id: 'verified-owner' }), adminRequest: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return url.includes('ready') ? readiness : 'expiry';
    } };
    throw Error('Unexpected test dependency');
  } };
  vm.runInNewContext(source, context);
  return { calls, run: async (method, body) => {
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await context.module.exports({ method, query: {}, headers: {}, body }, res);
    return JSON.parse(JSON.stringify(res));
  } };
}

test('Cloudflare cannot advertise notifications until its scoped dispatcher is enabled', async () => {
  for (const extra of [{}, { PUSH_DISPATCH_ENABLED: 'false' }, { PUSH_DISPATCH_ENABLED: 'true', WEB_PUSH_KEY_ID: 'legacy' }]) {
    const h = endpoint({ APP_ORIGIN: scope.origin, WEB_PUSH_KEY_ID: scope.keyId, WEB_PUSH_PUBLIC_KEY: 'fixture', WEB_PUSH_PRIVATE_KEY: 'fixture', MOBILE_PUSH_CRON_SECRET: 'fixture', ...extra });
    assert.deepEqual((await h.run('GET')).body, { enabled: false, publicKey: null });
    assert.equal((await h.run('POST', { subscription: {}, timezone: 'UTC' })).code, 503);
    assert.equal(h.calls.length, 0);
  }
});

test('new subscriptions use authenticated owner and server scope, never caller-supplied identities', async () => {
  const h = endpoint({ APP_ORIGIN: scope.origin, WEB_PUSH_KEY_ID: scope.keyId, PUSH_DISPATCH_ENABLED: 'true', WEB_PUSH_PUBLIC_KEY: 'fixture', WEB_PUSH_PRIVATE_KEY: 'fixture', MOBILE_PUSH_CRON_SECRET: 'fixture' });
  assert.deepEqual((await h.run('GET')).body, { enabled: true, publicKey: 'fixture' });
  const result = await h.run('POST', { subscription: { endpoint: 'fixture' }, timezone: 'UTC', origin: scopes.LEGACY_ORIGIN, keyId: 'legacy', userId: 'attacker-supplied' });
  assert.equal(result.code, 200);
  const registration = h.calls.at(-1);
  assert.ok(registration.url.endsWith('/register_mobile_push_for_origin'));
  assert.deepEqual(registration.body, { p_user: 'verified-owner', p_subscription: { endpoint: 'fixture' }, p_timezone: 'UTC', p_origin: scope.origin, p_key_id: scope.keyId });
  const unavailable = endpoint({ APP_ORIGIN: scope.origin, WEB_PUSH_KEY_ID: scope.keyId, PUSH_DISPATCH_ENABLED: 'true', WEB_PUSH_PUBLIC_KEY: 'fixture', WEB_PUSH_PRIVATE_KEY: 'fixture', MOBILE_PUSH_CRON_SECRET: 'fixture' }, false);
  assert.equal((await unavailable.run('POST', { subscription: {}, timezone: 'UTC' })).code, 503);
  assert.equal(unavailable.calls.length, 1);
});

test('old servers retain the exact legacy readiness and registration signatures', async () => {
  const h = endpoint({ WEB_PUSH_PUBLIC_KEY: 'fixture', WEB_PUSH_PRIVATE_KEY: 'fixture', MOBILE_PUSH_CRON_SECRET: 'fixture' });
  await h.run('GET'); await h.run('POST', { subscription: {}, timezone: 'UTC' });
  assert.deepEqual(h.calls.map(call => call.url.split('/').at(-1)), ['mobile_push_ready', 'mobile_push_ready', 'register_mobile_push']);
  assert.deepEqual(h.calls.at(-1).body, { p_user: 'verified-owner', p_subscription: {}, p_timezone: 'UTC' });
});
