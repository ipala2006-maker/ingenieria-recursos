const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rules = require('../shared/inbox-alarms');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function functionSource(file, start, end) {
  const text = source(file);
  const first = text.indexOf(start), last = text.indexOf(end, first);
  assert.ok(first >= 0 && last > first);
  return text.slice(first, last);
}

function dateReader() {
  const context = { rules };
  vm.runInNewContext(functionSource('scripts/inbox-alarms.js', '  function readDate(', '  function mount('), context);
  return context.readDate;
}

test('an annotation date is absent until explicitly enabled', () => {
  const read = dateReader();
  assert.equal(read(null), '');
  assert.equal(read({ elements: {} }), '');
  assert.equal(read({ elements: { inboxDateEnabled: { checked: false }, inboxNoteDate: { value: '2030-12-20' } } }), '');
});

test('optional annotation dates accept real dates including the past, not impossible dates', () => {
  const read = dateReader();
  const form = { elements: { inboxDateEnabled: { checked: true }, inboxNoteDate: { value: '' } } };
  for (const date of ['2030-12-20', '2024-02-29', '2020-01-01']) {
    form.elements.inboxNoteDate.value = date;
    assert.equal(read(form), date);
  }
  for (const date of ['', '2030-02-30', '2019-12-31', '2101-01-01', '<script>']) {
    form.elements.inboxNoteDate.value = date;
    assert.throws(() => read(form), /fecha v/);
  }
});

test('a calendar date alone never schedules an alarm', () => {
  const context = { rules };
  vm.runInNewContext(functionSource('scripts/inbox-alarms.js', '  function readForm(', '  function readDate('), context);
  const form = { elements: { inboxAlarmEnabled: { checked: false }, inboxAlarmDate: { value: '2030-12-20' }, inboxAlarmTime: { value: '18:30' } } };
  assert.equal(context.readForm(form), null);
  assert.equal(rules.due([{ id: 'date-only', date: '2030-12-20', alarm: null }], new Date(2030, 11, 20, 18, 30)).length, 0);
});

const modes = [
  { name: 'title only', date: '', alarm: null },
  { name: 'calendar date without alarm', date: '2030-12-20', alarm: null },
  { name: 'calendar date and alarm', date: '2030-12-20', alarm: rules.normalize({ date: '2030-12-20', time: '18:30', repeat: 'weekly' }) }
];

for (const mode of modes) {
  test(`Home saves ${mode.name} without inventing optional data`, () => {
    const previous = { id: 'existing', title: 'Existing task', date: '', alarm: null };
    let saved, resets = 0, closed = 0;
    const button = { disabled: false };
    const form = { elements: { title: { value: '  Repasar  ' } }, reset() { resets++; }, querySelector: () => button };
    const context = {
      window: { EstudiemosInboxAlarms: { readDate: () => mode.date, readForm: () => mode.alarm } },
      readAgenda: () => [previous], writeAgenda: value => { saved = value; },
      randomId: () => 'test', MAX_AGENDA_ITEMS: 500, closeActivePanel: () => { closed++; }
    };
    vm.runInNewContext(functionSource('scripts/dashboard.js', '  function saveQuickNote(', '  async function routeGeneralAssistant('), context);
    context.saveQuickNote({ currentTarget: form, preventDefault() {} });
    assert.equal(saved[0].title, 'Repasar');
    assert.equal(saved[0].date, mode.date);
    assert.equal(saved[0].alarm, mode.alarm);
    assert.equal(saved[1], previous);
    assert.equal(resets, 1); assert.equal(closed, 1); assert.equal(button.disabled, true);
  });

  test(`Inbox saves ${mode.name} and shows new undated tasks in pending`, () => {
    let saved, resets = 0, rendered = 0;
    const title = { value: '  Repasar  ' }, form = { reset() { resets++; } };
    const context = {
      document: { getElementById: id => ({ agendaTitle: title, agendaForm: form }[id] || null) },
      window: { EstudiemosInboxAlarms: { readDate: () => mode.date, readForm: () => mode.alarm } },
      STORAGE_KEYS: { agenda: 'bandeja_agenda' }, MAX_AGENDA_ITEMS: 500,
      selectedAgendaDate: '2026-10-01', agendaFilter: 'day', readList: () => [],
      cryptoRandomId: () => 'test',
      writeList: (key, value) => { assert.equal(key, 'bandeja_agenda'); saved = value; },
      updateAgendaSubmitState() {}, renderAgenda: () => { rendered++; }
    };
    vm.runInNewContext(functionSource('scripts/bandeja.js', '  function addAgendaItem(', '  function openAgendaAssistant('), context);
    context.addAgendaItem();
    assert.equal(saved[0].date, mode.date);
    assert.equal(saved[0].alarm, mode.alarm);
    assert.equal(saved[0].title, 'Repasar');
    assert.equal(context.agendaFilter, 'pending');
    assert.equal(resets, 1); assert.equal(rendered, 1);
  });
}
