const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const token = 'a'.repeat(32);

function server() {
  const calls = [];
  const context = { module: { exports: {} }, __dirname: path.join(root, 'api/_lib'), require: name => {
    if (name === './request-security') return { enforceRateLimit: async (...args) => { calls.push(args[2]); return true; } };
    return require(name.startsWith('./') ? path.join(root, 'api/_lib', name) : name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'api/_lib/friend-invitation.js'), 'utf8'), context);
  return { handler: context.module.exports, calls };
}
function response() {
  return { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, send(body) { this.body = body; return this; }, json(body) { return this.send(body); } };
}

test('preview has server-rendered identity, full invitation URL and no account lookup', async () => {
  const { handler, calls } = server(), res = response();
  await handler({ method: 'GET', query: { friendInvitation: token }, headers: { host: 'malicious.example' } }, res);
  assert.equal(res.code, 200);
  assert.match(res.body, /og:title" content="Solicitud de amistad en Estudiemos/);
  assert.match(res.body, new RegExp(`og:url" content="https://estudiemos-app.vercel.app/amistad/${token}"`));
  assert.match(res.body, /og:image:width" content="1200/);
  assert.match(res.body, /og:image:height" content="630/);
  assert.ok(!res.body.includes('__INVITATION_URL__') && !res.body.includes('malicious.example'));
  assert.equal(res.headers['Content-Type'], 'text/html; charset=utf-8');
  assert.ok(!res.headers['Content-Security-Policy'].includes('unsafe-inline'));
  assert.equal(calls[0].distributed, false, 'preview cannot consume a database request');
});
test('preview rejects malformed, injected and repeated tokens, and mutation requests', async () => {
  const { handler } = server();
  for (const value of ['', null, [token, token], '<script>alert(1)</script>', token+'"', 'A'.repeat(32), 'a'.repeat(33)]) {
    const res = response(); await handler({ method: 'GET', query: { friendInvitation: value } }, res);
    assert.equal(res.code, 404); assert.equal(typeof res.body, 'object');
  }
  const post = response(); await handler({ method: 'POST', query: { friendInvitation: token } }, post);
  assert.equal(post.code, 405); assert.equal(post.headers.Allow, 'GET, HEAD');
  const head = response(); await handler({ method: 'HEAD', query: { friendInvitation: token } }, head);
  assert.equal(head.code, 200); assert.equal(head.body, '');
});
test('opening a friendly invitation forwards only its token into the existing app flow', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/friend-invitation.js'), 'utf8');
  const status = {}, link = {};
  const run = pathname => {
    let destination = '';
    vm.runInNewContext(source, { URL, document: { querySelector: s => s.includes('status') ? status : link }, location: { pathname, href: `https://estudiemos-app.vercel.app${pathname}?redirect=https://malicious.example`, replace: url => { destination = url; } } });
    return destination;
  };
  assert.equal(run('/amistad/'+token), 'https://estudiemos-app.vercel.app/#friend='+token);
  assert.equal(link.href, 'https://estudiemos-app.vercel.app/#friend='+token);
  assert.equal(run('/amistad/not-a-token'), '');
  assert.equal(run('/amistad/'+token+'/extra'), '');
});
