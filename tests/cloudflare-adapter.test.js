const test = require('node:test');
const assert = require('node:assert/strict');
const { allowed } = require('../scripts/build-cloudflare.cjs');
const adapter = import('../cloudflare/http-adapter.mjs');

test('Workers adapts JSON, duplicate query fields, trusted host and Cloudflare IP', async () => {
  const { invokeHandler } = await adapter;
  const request = new Request('https://candidate.workers.dev/api/account-config?classes=1&action=a&action=b', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://candidate.workers.dev',
      'CF-Connecting-IP': '192.0.2.1', 'X-Forwarded-Host': 'evil.test', 'X-Vercel-Forwarded-For': 'spoof' },
    body: JSON.stringify({ title: 'A' })
  });
  const response = await invokeHandler(request, (req, res) => {
    assert.deepEqual(req.body, { title: 'A' });
    assert.deepEqual(req.query.action, ['a', 'b']);
    assert.equal(req.headers.host, 'candidate.workers.dev');
    assert.equal(req.headers['x-forwarded-host'], undefined);
    assert.equal(req.headers['x-vercel-forwarded-for'], undefined);
    assert.equal(req.socket.remoteAddress, '192.0.2.1');
    res.setHeader('Set-Cookie', ['first=a; Secure', 'second=b; Secure']);
    return res.status(201).json({ saved: true });
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.getSetCookie().length, 2);
  assert.deepEqual(await response.json(), { saved: true });
});

test('Workers retains exact webhook bytes and redirect / HEAD semantics', async () => {
  const { invokeHandler } = await adapter;
  const raw = '{ "x": 1 }';
  const result = await invokeHandler(new Request('https://app.test/api/whatsapp-webhook', {
    method: 'POST', body: raw, headers: { 'Content-Type': 'application/json' }
  }), async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString(), raw);
    res.statusCode = 303; res.setHeader('Location', '/'); res.end();
  });
  assert.equal(result.status, 303); assert.equal(result.headers.get('Location'), '/');
  const head = await invokeHandler(new Request('https://app.test/', { method: 'HEAD' }), (_, res) => res.send('hidden'));
  assert.equal(await head.text(), '');
});

test('Workers rejects invalid/oversized bodies before handlers and never leaks an error', async () => {
  const { invokeHandler } = await adapter;
  for (const [body, expected] of [['{', 400], ['x'.repeat(512 * 1024 + 1), 413]]) {
    let called = false;
    const response = await invokeHandler(new Request('https://app.test/api/account-config', {
      method: 'POST', body, headers: { 'Content-Type': 'application/json' }
    }), () => { called = true; });
    assert.equal(called, false); assert.equal(response.status, expected);
  }
  const failed = await invokeHandler(new Request('https://app.test/'), () => { throw new Error('private token'); });
  assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /private token/);
});

test('public build allowlist never publishes server, operational code or secrets', () => {
  for (const file of ['.env', '.env.example', 'api/account-config.js', 'cloudflare/worker.mjs', 'package.json',
    'tmp/key.json', 'scripts/backup-database.cjs', 'scripts/verify-drive-oauth-build.cjs', 'scripts/security-check.js', '.backups/db.age', 'api/_lib/drive-rekey.js', 'api/_lib/drive-oauth-check.js', 'api/_lib/drive-cutover-audit.js', 'api/_lib/drive-recipher-check.js',
    'assets/.env', 'assets/../secret.json', 'docs/report.md', 'output/pdf/Guia-Legal-y-ARCA-Estudiemos.pdf']) assert.equal(allowed(file), false, file);
  for (const file of ['index.html', 'service-worker.js', 'site.webmanifest', '.well-known/assetlinks.json',
    'downloads/Estudiemos-Para-Windows.exe', 'scripts/app-feedback.js', 'pages/bandeja.html']) assert.equal(allowed(file), true, file);
});

test('migration origins are explicit and never taken from request host or arbitrary URLs', () => {
  const { appOrigin } = require('../api/_lib/app-origin');
  const old = process.env.APP_ORIGIN;
  try {
    process.env.APP_ORIGIN = 'https://candidate.workers.dev'; assert.equal(appOrigin(), 'https://candidate.workers.dev');
    for (const value of ['http://example.test', 'https://user@example.test', 'https://example.test:444', 'https://example.test/path', 'https://example.test/#x']) {
      process.env.APP_ORIGIN = value; assert.throws(appOrigin, /INVALID_APP_ORIGIN/);
    }
  } finally { if (old === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = old; }
});
