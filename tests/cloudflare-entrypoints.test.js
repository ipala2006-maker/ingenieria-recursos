const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../vercel.json');
const origin = 'https://estudiemos.estudiemos-services.workers.dev';

test('only public old entry points redirect to the exact stable origin, with reversible status', () => {
  const redirects = config.redirects.filter(rule => rule.destination.startsWith(origin));
  assert.equal(redirects.length, 4);
  const expected = {
    '/instalar.html': '/instalar.html', '/instalar': '/instalar.html',
    '/materia/:code': '/materia/:code', '/amistad/:token': '/amistad/:token'
  };
  for (const rule of redirects) {
    assert.equal(rule.destination, origin + expected[rule.source]);
    assert.equal(rule.permanent, false);
    assert.equal(rule.has, undefined);
  }
});

test('legacy sessions, native handoff redemption and old notification transport are not blanket-redirected', () => {
  const redirects = config.redirects.filter(rule => rule.destination.startsWith(origin));
  for (const pathname of ['/', '/api/widget-push', '/api/widget-link', '/api/account-config', '/widget.html']) {
    assert.ok(!redirects.some(rule => rule.source === pathname || rule.source === '/:path*' || rule.source === '/api/:path*'));
  }
  const retired = config.redirects.find(rule => rule.source === '/api/widget-link');
  assert.equal(retired.destination, '/.well-known/windows-alarms-retired.json');
  assert.equal(retired.missing[0].key, 'alarmSetup');
});
