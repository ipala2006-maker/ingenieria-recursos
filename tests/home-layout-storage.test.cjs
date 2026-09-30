const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const createLayout = require('../shared/home-layout-storage');

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}
const legacy = 'estudiemos_home_layout';
const local = 'estudiemos_home_layout_local';

test('each device retains an independent layout across reloads', () => {
  const pc = storage(), phone = storage(), tablet = storage();
  const layouts = [pc, phone, tablet].map(createLayout);
  layouts[0].write({visible: {calendar: false}, placement: {width: 1400}});
  layouts[1].write({sizes: {focus: {mobileHeight: 360}}});
  layouts[2].write({density: 'compact'});
  [pc, phone, tablet].forEach((s, i) => assert.deepEqual(createLayout(s).read(), layouts[i].read()));
  assert.equal(layouts[1].read().visible, undefined);
  assert.equal(layouts[2].read().placement, undefined);
  assert.equal(pc.getItem(legacy), null);
});

test('legacy migration snapshots this device once; later cloud writes cannot replace it', () => {
  const original = {visible: {progress: false}, placement: {width: 1000}};
  const s = storage({[legacy]: JSON.stringify(original)});
  assert.deepEqual(createLayout(s).read(), original);
  s.setItem(legacy, JSON.stringify({visible: {inbox: false}}));
  assert.deepEqual(createLayout(s).read(), original);
  const fresh = storage();
  createLayout(fresh);
  fresh.setItem(legacy, JSON.stringify(original));
  assert.deepEqual(createLayout(fresh).read(), {});
});

test('malformed preferences fall back safely; an existing local layout wins', () => {
  for (const raw of ['null', '[]', 'false', '42', '{broken']) {
    assert.deepEqual(createLayout(storage({[legacy]: raw})).read(), {});
  }
  const s = storage({[legacy]: '{"density":"compact"}', [local]: '{"density":"comfortable"}'});
  assert.equal(createLayout(s).read().density, 'comfortable');
  s.removeItem(local);
  assert.deepEqual(createLayout({getItem() { throw Error('blocked'); }}).read(), {});
});

test('account upload, merge and restore exclude layout but still synchronize tasks', () => {
  const source = fs.readFileSync(require.resolve('../scripts/account.js'), 'utf8');
  const keys = source.slice(source.indexOf('  const SYNC_KEYS'), source.indexOf('  const LINKED_USER_KEY'));
  const functions = source.slice(source.indexOf('  function captureLocalState()'), source.indexOf('  function prepareLocalAccountSwitch'));
  const s = storage({[local]: '{"visible":{"calendar":false}}', [legacy]: '{"density":"compact"}', keys: JSON.stringify({[legacy]: 100})});
  const context = vm.createContext({localStorage: s, window: {dispatchEvent() {}}, CustomEvent: function () {},
    LINKED_USER_KEY: 'user', LOCAL_CHANGED_KEY: 'changed', KEY_CHANGED_KEY: 'keys', DIRTY_KEY: 'dirty', applyingCloud: false});
  vm.runInContext(keys + functions + '\nthis.api={captureLocalState,applyCloudState,mergeAccountStates,clearLocalAccountData};', context);
  const remote = {values: {[legacy]: '{"visible":{"inbox":false}}', [local]: '{}', bandeja_agenda: [{id: 'task-1', title: 'Repasar'}]}, changedAt: {bandeja_agenda: 123}};
  const merged = context.api.mergeAccountStates(context.api.captureLocalState(), remote);
  assert.equal(legacy in context.api.captureLocalState().changedAt, false);
  assert.equal(legacy in merged.values, false);
  assert.equal(local in merged.values, false);
  context.api.applyCloudState(merged);
  assert.equal(JSON.parse(s.getItem('bandeja_agenda'))[0].id, 'task-1');
  assert.equal(JSON.parse(s.getItem(local)).visible.calendar, false);
  context.api.clearLocalAccountData();
  assert.equal(JSON.parse(s.getItem(local)).visible.calendar, false);
});

test('home initializes local migration before dynamically loading account and navigation', () => {
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  assert.ok(html.indexOf('shared/home-layout-storage.js') < html.indexOf('scripts/global-search.js'));
  const customizer = fs.readFileSync(require.resolve('../scripts/home-customizer.js'), 'utf8');
  assert.ok(!customizer.includes('estudiemos:data-change'));
  assert.match(customizer, /layoutStorage\.write\(value\)/);
});
