const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const webpush = require('web-push');
const receiver = crypto.createECDH('prime256v1'); receiver.generateKeys();
const subscription = { endpoint: 'https://web.push.apple.com/Q/fixture-only', keys: {
  p256dh: receiver.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url')
} };
const vapid = { subject: 'https://example.test', ...webpush.generateVAPIDKeys() };
const transport = import('../cloudflare/push.mjs');

test('Workers encryption keeps fresh ciphertext and rejects untrusted destinations', async () => {
  const { preparePush } = await transport;
  const a = await preparePush(subscription, { title: 'Fixture' }, vapid), b = await preparePush(subscription, { title: 'Fixture' }, vapid);
  assert.equal(a.endpoint, subscription.endpoint);
  assert.equal(a.headers['content-encoding'], 'aes128gcm');
  assert.notDeepEqual(a.body, b.body);
  assert.match(a.headers.authorization, /^vapid /);
  assert.equal(a.headers.ttl, '600'); assert.equal(a.headers.urgency, 'high');
  assert.equal(a.body.byteLength, 4096);
  const decrypted = require('http_ece').decrypt(Buffer.from(a.body), {
    version: 'aes128gcm', privateKey: receiver, authSecret: subscription.keys.auth
  });
  assert.deepEqual(JSON.parse(decrypted.toString('utf8')), { title: 'Fixture' });
  await assert.rejects(preparePush({ ...subscription, endpoint: 'https://example.test/private' }, {}, vapid), /destination/);
});

test('Workers transport uses one fetch without redirects and classifies provider failures', async () => {
  const { sendPush } = await transport;
  const originalFetch = global.fetch, previous = { ...process.env };
  process.env.WEB_PUSH_PUBLIC_KEY = vapid.publicKey; process.env.WEB_PUSH_PRIVATE_KEY = vapid.privateKey;
  let calls = 0;
  try {
    for (const status of [201, 302, 410, 503]) {
      global.fetch = async (url, options) => {
        calls++; assert.equal(url, subscription.endpoint); assert.equal(options.redirect, 'manual');
        return new Response('', { status });
      };
      if (status === 201) await sendPush(subscription, { title: 'Fixture' });
      else await assert.rejects(sendPush(subscription, { title: 'Fixture' }), error => error.statusCode === status);
    }
    assert.equal(calls, 4);
  } finally { global.fetch = originalFetch; process.env = previous; }
});

test('live dispatch refuses unauthorized/disabled requests and ACKs only its single reserved job', async () => {
  const { dispatch } = await transport;
  const originalFetch = global.fetch, previous = { ...process.env };
  process.env.MOBILE_PUSH_CRON_SECRET = 'fixture-only-cron-authorization-'.repeat(2);
  process.env.SUPABASE_URL = 'https://database.example.test'; process.env.SUPABASE_SECRET_KEY = 'fixture-only-server-key';
  process.env.WEB_PUSH_PUBLIC_KEY = vapid.publicKey; process.env.WEB_PUSH_PRIVATE_KEY = vapid.privateKey;
  const authorized = () => new Request('https://example.test/api/widget-push?mobilePush=dispatch', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.MOBILE_PUSH_CRON_SECRET } });
  let calls = 0, acknowledged;
  try {
    global.fetch = async (url, options) => {
      calls++; assert.equal(options.redirect, 'manual');
      if (url.endsWith('/claim_mobile_push_batch')) {
        assert.equal(JSON.parse(options.body).p_limit, 1);
        return Response.json([{ id: 1, title: 'Fixture', subscription }]);
      }
      if (url.endsWith('/finish_mobile_push_jobs')) { acknowledged = JSON.parse(options.body).p_results; return Response.json(null); }
      assert.equal(url, subscription.endpoint); return new Response('', { status: 201 });
    };
    assert.equal((await dispatch(new Request('https://example.test/'), { PUSH_DISPATCH_ENABLED: 'true' })).status, 401);
    assert.equal((await dispatch(authorized(), { PUSH_DISPATCH_ENABLED: 'false' })).status, 503);
    assert.equal(calls, 0);
    process.env.WEB_PUSH_PRIVATE_KEY = '';
    assert.equal((await dispatch(authorized(), { PUSH_DISPATCH_ENABLED: 'true' })).status, 503);
    assert.equal(calls, 0, 'incomplete configuration cannot consume queue attempts');
    process.env.WEB_PUSH_PRIVATE_KEY = vapid.privateKey;
    const response = await dispatch(authorized(), { PUSH_DISPATCH_ENABLED: 'true' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { sent: 1, failed: 0, claimed: 1, batches: 1, subrequests: 3 });
    assert.equal(calls, 3); assert.equal(acknowledged.length, 1);
  } finally { global.fetch = originalFetch; process.env = previous; }
});
