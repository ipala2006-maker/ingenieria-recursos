const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../scripts/account.js'), 'utf8');
const functions = source.slice(source.indexOf('  function setupCaptcha()'), source.indexOf('  async function updatePassword()'));
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness() {
  const nodes = new Map([
    ['.account-shell', { hidden: false }],
    ['[data-account-auth]', { hidden: false }],
    ['[data-account-security]', { hidden: true, scrollIntoView() {} }],
    ['[data-account-captcha]', { clientWidth: 350 }],
    ['[data-account-captcha-status]', { textContent: '' }],
    ['[data-account-captcha-retry]', { hidden: true }]
  ]);
  const scripts = [], timers = new Map(), renders = [], resets = [], messages = [];
  let nextTimer = 0;
  const context = {
    captchaToken: '', captchaWidgetId: null, captchaLoading: false, captchaIssue: '',
    session: null, accountConfig: { captchaSiteKey: 'fixture-sitekey' }, TURNSTILE_SCRIPT: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    setStatus: (message, type) => messages.push({ message, type }),
    document: {
      documentElement: { classList: { contains: () => false } },
      querySelector: selector => selector.startsWith('script[') ? scripts.find(script => !script.removed) : nodes.get(selector),
      head: { appendChild: script => scripts.push(script) },
      createElement: () => {
        const listeners = new Map();
        return {
          dataset: {}, removed: false,
          addEventListener: (name, callback) => listeners.set(name, callback),
          removeEventListener: name => listeners.delete(name),
          remove() { this.removed = true; },
          fire: name => listeners.get(name)?.()
        };
      }
    },
    window: {
      setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; },
      clearTimeout: id => timers.delete(id),
      turnstile: {
        render: (container, options) => { renders.push({ container, options }); return 'fixture-widget'; },
        reset: id => resets.push(id)
      }
    }
  };
  vm.runInNewContext(functions, context);
  return { context, nodes, scripts, timers, renders, resets, messages,
    load: async () => { const ready = context.setupCaptcha(); scripts.at(-1).fire('load'); await ready; } };
}

test('captcha waits for the visible sign-in form and skips authenticated sessions', async () => {
  const h = harness();
  h.nodes.get('.account-shell').hidden = true;
  h.context.setupCaptcha();
  h.nodes.get('.account-shell').hidden = false;
  h.nodes.get('[data-account-auth]').hidden = true;
  h.context.setupCaptcha();
  h.nodes.get('[data-account-auth]').hidden = false;
  h.context.session = { user: { id: 'fixture' } };
  h.context.setupCaptcha();
  assert.equal(h.scripts.length, 0);
  assert.equal(h.renders.length, 0);
});

test('captcha renders visibly once, coalesces loading, and does not retry challenges in the background', async () => {
  const h = harness(), pending = h.context.setupCaptcha();
  h.context.setupCaptcha();
  assert.equal(h.scripts.length, 1);
  h.scripts[0].fire('load'); await pending;
  h.context.setupCaptcha();
  assert.equal(h.renders.length, 1);
  const options = h.renders[0].options;
  assert.equal(options.appearance, 'always');
  assert.equal(options.retry, 'never');
  assert.equal(options['refresh-expired'], 'manual');
  assert.equal(options['refresh-timeout'], 'manual');
  assert.equal(h.nodes.get('[data-account-security]').hidden, false);
  assert.equal(h.timers.size, 0);
});

test('closing during script loading defers rendering until the next opening', async () => {
  const h = harness(), pending = h.context.setupCaptcha();
  h.nodes.get('.account-shell').hidden = true;
  h.scripts[0].fire('load'); await pending;
  assert.equal(h.renders.length, 0);
  h.nodes.get('.account-shell').hidden = false;
  await h.context.setupCaptcha();
  assert.equal(h.renders.length, 1);
});

test('the compact provider layout fits narrow phone forms without clipping the challenge', async () => {
  const h = harness(); h.nodes.get('[data-account-captcha]').clientWidth = 240;
  await h.load();
  assert.equal(h.renders[0].options.size, 'compact');
});

test('only a provider success token allows submission; errors, expiration and timeouts invalidate it', async () => {
  const h = harness(); await h.load();
  const callbacks = h.renders[0].options;
  assert.equal(h.context.getCaptchaOptions(), null);
  callbacks.callback('fixture-token');
  assert.equal(h.context.getCaptchaOptions().captchaToken, 'fixture-token');
  for (const name of ['error-callback', 'expired-callback', 'timeout-callback']) {
    callbacks.callback('fixture-token'); callbacks[name]('300030');
    assert.equal(h.context.getCaptchaOptions(), null);
    assert.equal(h.context.captchaToken, '');
    assert.equal(h.nodes.get('[data-account-captcha-retry]').hidden, false);
    assert.equal(h.messages.at(-1).message, h.context.captchaIssue);
    assert.doesNotMatch(h.messages.at(-1).message, /300030|fixture-token/);
  }
});

test('a failed challenge can be reset without clearing credentials or reloading the page', async () => {
  const h = harness(); await h.load();
  h.renders[0].options['error-callback']('300030');
  h.context.resetCaptcha();
  assert.deepEqual(h.resets, ['fixture-widget']);
  assert.equal(h.context.captchaToken, '');
  assert.equal(h.nodes.get('[data-account-captcha-retry]').hidden, true);
  assert.match(h.nodes.get('[data-account-captcha-status]').textContent, /Comprobando/);
});

test('failed script requests are removed so a manual retry starts a fresh load', async () => {
  const h = harness(), pending = h.context.setupCaptcha();
  h.scripts[0].fire('error'); await pending;
  assert.equal(h.scripts[0].removed, true);
  assert.equal(h.timers.size, 0);
  assert.equal(h.nodes.get('[data-account-captcha-retry]').hidden, false);
  h.context.resetCaptcha();
  assert.equal(h.scripts.length, 2);
  h.scripts[1].fire('load'); await flush();
  assert.equal(h.renders.length, 1);
});

test('a blocked script times out instead of hanging forever, and cannot bypass verification', async () => {
  const h = harness(), pending = h.context.setupCaptcha();
  [...h.timers.values()][0](); await pending;
  assert.equal(h.context.captchaLoading, false);
  assert.equal(h.scripts[0].removed, true);
  assert.equal(h.renders.length, 0);
  assert.equal(h.nodes.get('[data-account-captcha-retry]').hidden, false);
  assert.equal(h.context.captchaToken, '');
});

test('provider reset exceptions remain fail-closed with actionable feedback', async () => {
  const h = harness(); await h.load();
  h.context.window.turnstile.reset = () => { throw new Error('fixture-only'); };
  h.context.resetCaptcha();
  assert.equal(h.context.getCaptchaOptions(), null);
  assert.match(h.messages.at(-1).message, /Recargá/);
  assert.equal(h.nodes.get('[data-account-captcha-retry]').hidden, false);
});

test('only deployments without a configured captcha retain the existing no-captcha path', () => {
  const h = harness(); h.context.accountConfig.captchaSiteKey = '';
  assert.equal(Object.keys(h.context.getCaptchaOptions()).length, 0);
  assert.equal(h.scripts.length, 0);
});
