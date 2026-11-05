const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const load = () => import('../cloudflare/frontdoor.mjs');
const appPaths = ['/', '/index.html', '/mi-espacio', '/mi-espacio/', '/mi-espacio.html', '/materias', '/materias/', '/materias.html'];

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
  assert.deepEqual(frontend.routes,[{pattern:'estudiemos.ar',custom_domain:true}]);
  assert.equal(frontend.workers_dev,true,'custom domain does not disable existing clients or callbacks');
  assert.equal(backend.routes,undefined,'the private service worker is not the custom-domain entrypoint');
  assert.equal(frontend.services[0].service, backend.name); assert.equal(backend.name, 'estudiemos-candidate');
  assert.equal(frontend.vars, undefined); assert.equal(frontend.secrets, undefined);
  assert.equal(backend.vars.APP_ORIGIN, 'https://estudiemos.estudiemos-services.workers.dev');
  assert.equal(backend.vars.PUSH_DISPATCH_ENABLED, 'true', 'ordinary deployments preserve the already-authorized live transport');
  const consentPaths = ['/consentimiento', '/consentimiento/', '/consentimiento.html'];
  assert.deepEqual(frontend.assets, {...backend.assets, run_worker_first: [...backend.assets.run_worker_first, ...consentPaths, ...appPaths]});
});

test('the standalone CMP settings page excludes ad hosts and cannot be indexed', async () => {
  const { default: worker } = await load();
  const env = { ASSETS: { fetch: async () => new Response('asset', {
    headers: {'Content-Type':'text/html', 'Content-Security-Policy':"default-src 'self'"}
  }) }, BACKEND: { fetch: async () => assert.fail('CMP must not use the backend') } };
  const request = url => worker.fetch(new Request(url), env);
  for (const pathname of ['/consentimiento','/consentimiento/','/consentimiento.html']) {
    const preview = await request('https://estudiemos.ar' + pathname);
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.equal(preview.headers.get('cache-control'), 'no-store');
    const policy = preview.headers.get('content-security-policy');
    assert.match(policy, /script-src 'self' https:\/\/cmp\.inmobi\.com/);
    assert.doesNotMatch(policy, /googlesyndication|doubleclick|supabase|unsafe-eval/);
    const mirror = await request('https://estudiemos.estudiemos-services.workers.dev' + pathname);
    assert.equal(mirror.status, 404);
  }
});

test('app pages keep every baseline CSP source and enable CMP only on the canonical origin', async () => {
  const { default: worker } = await load();
  const baseline = require('../vercel.json').headers.find(rule => rule.source === '/(.*)').headers;
  const policy = baseline.find(h => h.key === 'Content-Security-Policy').value;
  const env = { ASSETS: { fetch: async () => new Response('asset', { headers: { 'Content-Type': 'text/html' } }) } };
  for (const route of appPaths) {
    const page = await worker.fetch(new Request('https://estudiemos.ar' + route), env);
    const updated = page.headers.get('content-security-policy');
    assert.match(updated, /script-src [^;]+https:\/\/cmp\.inmobi\.com/);
    for (const directive of policy.split('; ')) assert.ok(updated.includes(directive), directive);
    for (const {key, value} of baseline) if (key !== 'Content-Security-Policy') assert.equal(page.headers.get(key), value);
    const mirror = await worker.fetch(new Request('https://estudiemos.estudiemos-services.workers.dev' + route), env);
    assert.equal(mirror.headers.get('content-security-policy'), null);
  }
  for (const route of ['/instalar', '/widgets/inbox.html', '/scripts/inmobi-choice-tag.js']) {
    const other = await worker.fetch(new Request('https://estudiemos.ar' + route), env);
    assert.equal(other.headers.get('content-security-policy'), null);
  }
  const cached = await worker.fetch(new Request('https://estudiemos.ar/'), { ASSETS: { fetch: async () => new Response(null, {status:304}) } });
  assert.equal(cached.status, 304);
  assert.match(cached.headers.get('content-security-policy'), /https:\/\/cmp\.inmobi\.com/);
});

test('custom domain preserves its host and request identity across static and private service bindings',async()=>{
  const {default:worker}=await load();
  for(const pathname of ['/','/api/account-config','/materia/ABCDEFGHJK','/amistad/example']){
    const request=new Request('https://estudiemos.ar'+pathname,{headers:{Origin:'https://estudiemos.ar'}});
    const target=pathname==='/'?'ASSETS':'BACKEND';
    const response=await worker.fetch(request,{[target]:{fetch:async received=>{
      assert.equal(received,request);assert.equal(new URL(received.url).host,'estudiemos.ar');
      assert.equal(received.headers.get('origin'),'https://estudiemos.ar');return new Response('ok');
    }}});
    assert.equal(await response.text(),'ok');
  }
});

test('HTTP on the custom domain upgrades before bindings and preserves path, query and POST semantics',async()=>{
  const {default:worker}=await load();
  for(const [route,method] of [['/','GET'],['/styles/app.css?v=fixture','HEAD'],['/api/account-config?drive=status','POST'],['/materia/ABCDEFGHJK?unirme=1','GET'],['/ads.txt','GET']]){
    const response=await worker.fetch(new Request('http://estudiemos.ar'+route,{method}),{
      ASSETS:{fetch:()=>assert.fail('HTTP must never serve HTML/assets')},
      BACKEND:{fetch:()=>assert.fail('HTTP must never reach private handlers')}
    });
    assert.equal(response.status,308);assert.equal(response.headers.get('location'),'https://estudiemos.ar'+route);
    assert.equal(await response.text(),'');
  }
  for(const host of ['127.0.0.1:8190','example.org','estudiemos.ar.example.org']){
    const response=await worker.fetch(new Request('http://'+host+'/'),{ASSETS:{fetch:async()=>new Response('local')}});
    assert.equal(response.status,200,'no arbitrary-host redirects or broken local development');
  }
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
