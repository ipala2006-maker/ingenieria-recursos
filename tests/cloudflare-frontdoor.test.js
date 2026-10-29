const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const load = () => import('../cloudflare/frontdoor.mjs');

test('stable frontdoor forwards the original API request only to its internal service binding', async () => {
  const { default: worker } = await load();
  const request = new Request('https://estudiemos.estudiemos-services.workers.dev/api/account-config?drive=status', { headers: { Authorization: 'Bearer fixture-only', Origin: 'https://estudiemos.estudiemos-services.workers.dev', Cookie: 'fixture=1' } });
  const response = new Response('fixture-response', { status: 200, headers: { 'Cache-Control': 'no-store' } });
  const actual = await worker.fetch(request, { BACKEND: { fetch: async value => { assert.equal(value, request); return response; } }, ASSETS: { fetch: async () => assert.fail('No static fallback for API') } });
  assert.equal(actual, response);
});

test('frontdoor preserves raw request bytes, callbacks, redirects, cookies and status without proxy rewrites', async () => {
  const { default: worker } = await load();
  const request = new Request('https://estudiemos.estudiemos-services.workers.dev/api/whatsapp-webhook', { method: 'POST', body: '{ "fixture": true }' });
  const response = new Response(null, { status: 303, headers: { Location: '/mi-espacio.html?drive=connected', 'Set-Cookie': '__Host-fixture=value; Secure; HttpOnly; Path=/' } });
  const actual = await worker.fetch(request, { BACKEND: { fetch: async value => { assert.equal(await value.text(), '{ "fixture": true }'); return response; } } });
  assert.equal(actual.status, 303); assert.equal(actual.headers.get('set-cookie'), response.headers.get('set-cookie')); assert.equal(actual.headers.get('location'), response.headers.get('location'));
});

test('friendly invitations remain dynamic while static assets never invoke the backend', async () => {
  const { default: worker } = await load();
  for (const route of ['/materia/FIXTURE', '/amistad/fixture']) {
    const response = await worker.fetch(new Request('https://estudiemos.estudiemos-services.workers.dev' + route), { BACKEND: { fetch: async () => new Response('dynamic') } });
    assert.equal(await response.text(), 'dynamic');
  }
  for (const route of ['/', '/mi-espacio.html', '/service-worker.js', '/assets/icon.png', '/apiary.html']) {
    const response = await worker.fetch(new Request('https://estudiemos.estudiemos-services.workers.dev' + route), { ASSETS: { fetch: async () => new Response('asset') }, BACKEND: { fetch: async () => assert.fail('Static request must not touch API') } });
    assert.equal(await response.text(), 'asset');
  }
});

test('missing or failing bindings expose no private errors and never fall back to an external proxy', async () => {
  const { default: worker } = await load();
  for (const env of [{}, { BACKEND: { fetch: async () => { throw Error('fixture-private'); } } }]) {
    const response = await worker.fetch(new Request('https://estudiemos.estudiemos-services.workers.dev/api/account-config'), env);
    assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.doesNotMatch(await response.text(), /fixture-private/);
  }
  const source = fs.readFileSync(path.join(__dirname, '../cloudflare/frontdoor.mjs'), 'utf8');
  assert.doesNotMatch(source, /process\.env|Authorization:|fetch\(['"`]|console\.|new URL\([^)]*,/);
});

test('production configurations preserve the existing secret-bearing worker and expose no keys in the stable frontend', () => {
  const root = path.join(__dirname, '..');
  const frontend = JSON.parse(fs.readFileSync(path.join(root, 'wrangler.frontdoor.jsonc'), 'utf8'));
  const backend = JSON.parse(fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8'));
  assert.equal(frontend.account_id, backend.account_id); assert.equal(frontend.name, 'estudiemos');
  assert.equal(frontend.services[0].service, backend.name); assert.equal(backend.name, 'estudiemos-candidate');
  assert.equal(frontend.vars, undefined); assert.equal(frontend.secrets, undefined);
  assert.equal(backend.vars.APP_ORIGIN, 'https://estudiemos.estudiemos-services.workers.dev');
  assert.equal(backend.vars.PUSH_DISPATCH_ENABLED, 'true', 'ordinary deployments preserve the already-authorized live transport');
  assert.deepEqual(frontend.assets, backend.assets);
});

test('one deployment command checks both workers and stops before frontend deployment when the backend fails', () => {
  const { commands, deploy } = require('../scripts/deploy-cloudflare.cjs');
  const dry = commands(true); assert.equal(dry.length, 2);
  assert.ok(dry.every(args => args.includes('--dry-run'))); assert.ok(dry[0].includes('wrangler.jsonc')); assert.ok(dry[1].includes('wrangler.frontdoor.jsonc'));
  assert.ok(commands(false).every(args => !args.includes('--dry-run') && !args.includes('--keep-vars')));
  const calls = [];
  deploy({ dryRun: true, buildAssets: () => calls.push('build'), run: (_node, args, options) => { calls.push(args.includes('wrangler.jsonc') ? 'backend' : 'frontend'); assert.equal(options.windowsHide, true); } });
  assert.deepEqual(calls, ['build', 'backend', 'frontend']);
  calls.length = 0;
  assert.throws(() => deploy({ buildAssets: () => {}, run: () => { calls.push('backend'); throw Error('fixture'); } }), /fixture/);
  assert.deepEqual(calls, ['backend']);
});
