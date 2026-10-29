const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../scripts/account.js'), 'utf8');
const lifecycle = source.slice(source.indexOf('  function openDialog(options'), source.indexOf('  function userIcon()'));

function harness() {
  const focused = [], tasks = [];
  const origin = { isConnected: true, getClientRects: () => [{}], focus: options => focused.push(['origin', options]) };
  const fallback = { focus: options => focused.push(['fallback', options]) };
  const shell = {
    hidden: true, open: false, opens: 0, closes: 0, attributes: {},
    showModal() { this.open = true; this.opens++; },
    close() { this.open = false; this.closes++; },
    setAttribute(key, value) { this.attributes[key] = value; },
    querySelector: () => ({ focus: options => focused.push(['form', options]) })
  };
  const classes = new Set();
  const context = {
    accountReturnFocus: null, session: null, COMMERCIAL_LAUNCH_ENABLED: false,
    document: { activeElement: origin, querySelector: selector => selector === '.account-shell' ? shell : fallback,
      body: { classList: { add: key => classes.add(key), remove: key => classes.delete(key) } } },
    window: { setTimeout: fn => tasks.push(fn) }, sessionStorage: { getItem: () => null },
    renderSyncUsage() {}, setStatus() {}, setupCaptcha() {}
  };
  vm.runInNewContext(lifecycle, context);
  return { context, shell, origin, focused, tasks, classes };
}

test('account uses the native top layer instead of competing with alarm z-index', () => {
  assert.match(source, /createElement\("dialog"\);\s*shell\.className = "account-shell"/);
  const h = harness(); h.context.openDialog();
  assert.equal(h.shell.opens, 1);
  assert.equal(h.shell.hidden, false);
  assert.equal(h.shell.attributes['aria-hidden'], 'false');
  assert.ok(h.classes.has('account-open'));
  h.context.openDialog();
  assert.equal(h.shell.opens, 1, 'repeated taps do not reopen or replace the originating focus');
  h.context.closeDialog();
  assert.equal(h.shell.closes, 1);
  assert.equal(h.shell.hidden, true);
  assert.equal(h.shell.attributes['aria-hidden'], 'true');
  assert.equal(h.classes.has('account-open'), false);
  assert.equal(h.focused.at(-1)[0], 'origin');
  assert.equal(h.focused.at(-1)[1].preventScroll, true);
});

test('closing before the deferred focus does not move focus back into a hidden account', () => {
  const h = harness(); h.context.openDialog(); h.context.closeDialog();
  for (const task of h.tasks) task();
  assert.deepEqual(h.focused.map(entry => entry[0]), ['origin']);
  h.context.closeDialog();
  assert.equal(h.shell.closes, 1);
});

test('account dismissal can recover when its original permission button was removed', () => {
  const h = harness(); h.context.openDialog(); h.origin.isConnected = false;
  h.context.closeDialog();
  assert.equal(h.focused.at(-1)[0], 'fallback');
});

test('the note-specific style preserves vertical scrolling and contains scroll chaining', () => {
  const css = fs.readFileSync(require.resolve('../styles/dashboard.css'), 'utf8');
  const rule = css.match(/\.quick-panel:not\(\.quick-panel--assistant\)\{([^}]+)\}/)[1];
  assert.match(rule, /overflow-y:auto/);
  assert.doesNotMatch(rule, /overflow:hidden/);
  assert.match(css, /\.quick-panel\{[^}]*overscroll-behavior:contain/s);
});
