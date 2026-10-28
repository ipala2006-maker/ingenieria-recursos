const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');

test('theme defaults to dark even with invalid settings and retains explicit light choice', () => {
  const source = fs.readFileSync(require.resolve('../scripts/theme-init.js'), 'utf8');
  const read = source.match(/function readTheme\(\) \{[\s\S]*?\n  \}/)[0];
  for (const [stored, expected] of [[null, 'dark'], ['', 'dark'], ['unexpected', 'dark'], ['dark', 'dark'], ['light', 'light']]) {
    assert.equal(vm.runInNewContext(read + ';readTheme()', { DEFAULT_THEME: 'dark', STORAGE_KEY: 'theme', localStorage: { getItem: () => stored } }), expected);
  }
});

test('completion feedback is gesture-only, bounded, nonblocking and respects reduced motion', () => {
  const source = fs.readFileSync(require.resolve('../scripts/app-feedback.js'), 'utf8');
  function boot(reduced = false, optOut = false) {
    let listener, pulses = 0, vibrations = 0;
    const window = { matchMedia: () => ({ matches: reduced }) };
    const context = { window, Date, navigator: { vibrate: value => { assert.equal(value, 8); vibrations++; } },
      localStorage: { getItem: () => optOut ? 'false' : null }, setTimeout() {},
      document: { addEventListener: (_, fn, capture) => { assert.equal(capture, true); listener = fn; },
        body: { appendChild: () => pulses++ }, createElement: () => ({ style: {}, setAttribute() {} }) } };
    vm.runInNewContext(source, context);
    const input = { checked: true, getBoundingClientRect: () => ({ width: 20, height: 20, left: 10, top: 10 }) };
    return { click(trusted, checked = true) { input.checked = checked; listener({ isTrusted: trusted, target: { closest: () => input } }); }, counts: () => ({ pulses, vibrations }) };
  }
  const h = boot(); h.click(false); h.click(true, false);
  assert.deepEqual(h.counts(), { pulses: 0, vibrations: 0 });
  h.click(true); h.click(true); assert.deepEqual(h.counts(), { pulses: 1, vibrations: 1 });
  const quiet = boot(true); quiet.click(true); assert.deepEqual(quiet.counts(), { pulses: 0, vibrations: 0 });
  const noHaptics = boot(false, true); noHaptics.click(true); assert.deepEqual(noHaptics.counts(), { pulses: 1, vibrations: 0 });
});
