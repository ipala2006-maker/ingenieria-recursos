const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function calendarHarness() {
  const source = fs.readFileSync(path.join(__dirname, '../scripts/dashboard.js'), 'utf8');
  const window = {};
  const document = { body: { classList: { contains: () => false } } };
  assert.ok(source.includes('  addTopbarActions();'));
  vm.runInNewContext(source.replace('  addTopbarActions();', '  window.calendarTest = { monthCapacity, weekCapacity, renderWeekDay, renderMonthDay, renderCalendarDetail }; return;'), {
    window, document, localStorage: { getItem: () => null },
    matchMedia: () => ({ addEventListener() {} })
  });
  return { ...window.calendarTest, window, document };
}

test('calendar preview density respects actual month rows and narrow tools', () => {
  const calendar = calendarHarness();
  const grid = { clientWidth: 900, clientHeight: 360, dataset: { weeks: '5' } };
  assert.equal(calendar.monthCapacity(grid), 1);
  grid.dataset.weeks = '6';
  assert.equal(calendar.monthCapacity(grid), 0);
  grid.clientHeight = 900;
  assert.equal(calendar.monthCapacity(grid), 3);
  grid.clientWidth = 350;
  assert.equal(calendar.monthCapacity(grid), 0);
  assert.equal(calendar.weekCapacity({ clientHeight: 700 }), 2);
  assert.equal(calendar.weekCapacity({ clientHeight: 350 }), 1);
});

test('weekly previews show the activity title rather than replacing it with the subject', () => {
  const calendar = calendarHarness();
  const items = [
    {title:'Preparar el parcial', subject:'Fisica', horaInicio:'08:00', horaFin:'10:00', type:'Parcial'},
    {title:'Entregar informe', type:'Tarea', done:true},
    {title:'Consulta', type:'Clase'}
  ];
  const html = calendar.renderWeekDay(new Date(2026,9,5), items, 2);
  assert.match(html, /08:00-10:00/);
  assert.match(html, /Preparar el parcial/);
  assert.match(html, /Entregar informe/);
  assert.match(html, /is-done/);
  assert.match(html, /dashboard-calendar__more">\+1/);
  assert.doesNotMatch(html, /Consulta/);
});

test('empty days have no misleading dots or counts and compact days expose a count', () => {
  const calendar = calendarHarness();
  assert.equal(calendar.renderMonthDay([], 2), '');
  assert.match(calendar.renderMonthDay([{title:'Uno'}, {title:'Dos'}], 0), /2<span> act/);
  assert.match(calendar.renderWeekDay(new Date(), [], 1), /Sin actividades/);
});

test('user text remains escaped in month, week and complete day details', () => {
  const calendar = calendarHarness();
  const item = {id:'test', title:'<img src=x onerror=alert(1)>', subject:'<script>evil()</script>', type:'Tarea', note:'<iframe src=x>\nSegunda linea', horaInicio:'08:00', alarm:{time:'08:00'}};
  assert.doesNotMatch(calendar.renderMonthDay([item], 1), /<img/);
  assert.doesNotMatch(calendar.renderWeekDay(new Date(), [item], 1), /<img/);
  const nodes = { '#calendarDayTitle': {}, '[data-calendar-day-count]': {}, '[data-calendar-day-items]': {contains:() => false} };
  const dialog = {open:true, querySelector:selector => nodes[selector]};
  calendar.document.querySelector = () => dialog;
  calendar.window.EstudiemosAlarmRules = {describe:() => '<svg onload=alert(1)>'};
  calendar.renderCalendarDetail(Array.from({length:30}, (_, i) => ({...item, id:String(i)})));
  const html = nodes['[data-calendar-day-items]'].innerHTML;
  assert.equal((html.match(/<article /g) || []).length, 30);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script/);
  assert.match(html, /&lt;iframe.*\nSegunda linea/);
  assert.match(html, /&lt;svg/);
  assert.doesNotMatch(html, /<(img|script|iframe|svg)\b/);
});
