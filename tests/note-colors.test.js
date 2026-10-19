const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rules = require('../shared/timetable');
const source = fs.readFileSync(path.join(__dirname, '../scripts/note-colors.js'), 'utf8');
const saveSource = source.slice(source.indexOf('  function save('), source.indexOf('  window.EstudiemosNoteColors ='));

test('note color controls escape titles and IDs and never interpolate untrusted CSS classes', () => {
  const context = { rules, item: { id: '" onclick="bad', title: '<img src=x onerror=bad> & "text"', color: 'rose injected' } };
  vm.runInNewContext(source.slice(source.indexOf('  const escape ='), source.indexOf('  function mount(')) + '\nresult = button(item);', context);
  assert.match(context.result, /class="note-color-trigger is-neutral"/);
  assert.match(context.result, /&lt;img src=x onerror=bad&gt; &amp; &quot;text&quot;/);
  assert.match(context.result, /data-note-color-id="&quot; onclick=&quot;bad"/);
  assert.doesNotMatch(context.result, /<img|timetable-color--rose injected/);
});

function harness(original, identity = 'owner', failure = false) {
  let stored = JSON.stringify(original), writes = 0, closed = 0, events = 0;
  const status = { textContent: '' };
  const context = {
    currentId: 'note', owner: 'owner', key: 'bandeja_agenda', identity: () => identity,
    valid: value => value === '' || rules.COLORS.includes(value),
    items: () => JSON.parse(stored), close: () => { closed++; },
    localStorage: { setItem(key, value) { if (failure) throw new Error('Quota exceeded'); writes++; stored = value; } },
    dialog: { querySelector: () => status },
    CustomEvent: class { constructor(name, detail) { this.type = name; this.detail = detail.detail; } },
    window: { dispatchEvent(event) { assert.equal(event.detail.key, 'bandeja_agenda'); events++; } }
  };
  vm.runInNewContext(saveSource, context);
  return { save: context.save, read: () => JSON.parse(stored), state: () => ({ writes, closed, events, status: status.textContent }) };
}

for (const type of ['Tarea', 'Clase', 'Parcial', 'Entrega', 'Estudio', 'Recordatorio']) {
  test(`recoloring ${type} only changes color, preserving alarm, completion and every other field`, () => {
    const item = { id: 'note', title: 'Original', type, color: 'rose', done: true, date: '', alarm: { date: '2030-12-20', time: '18:30', repeat: 'weekly' }, note: 'Personal', createdAt: 123, unknownFutureField: 42 };
    const other = { id: 'other', title: 'Other user task' };
    const app = harness([item, other]);
    app.save('teal');
    assert.deepEqual(app.read(), [{ ...item, color: 'teal' }, other]);
    assert.deepEqual(app.state(), { writes: 1, closed: 1, events: 1, status: '' });
    app.save('');
    const { color, ...uncolored } = item;
    assert.deepEqual(app.read()[0], uncolored);
  });
}

test('untrusted colors, changed account, removed notes and failed writes cannot silently change data', () => {
  const item = { id: 'note', title: 'Original' };
  for (const invalid of ['red', 'rose extra-class', '<script>', null, undefined]) {
    const app = harness([item]); app.save(invalid);
    assert.equal(app.state().writes, 0); assert.equal(app.state().events, 0);
  }
  const switched = harness([item], 'someone-else'); switched.save('amber');
  assert.equal(switched.state().writes, 0); assert.equal(switched.state().closed, 1);
  const removed = harness([]); removed.save('blue'); assert.equal(removed.state().writes, 0);
  const failed = harness([item], 'owner', true); failed.save('violet');
  assert.deepEqual(failed.read(), [item]); assert.equal(failed.state().events, 0);
  assert.match(failed.state().status, /No se pudo guardar/);
});
