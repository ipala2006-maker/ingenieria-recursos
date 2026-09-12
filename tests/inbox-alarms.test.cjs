const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const rules = require('../shared/inbox-alarms');
const root = path.resolve(__dirname, '..');
const alarm = (repeat = 'none', date = '2026-09-11', time = '18:00') => ({ date, time, repeat, windows: true });
const plain = value => JSON.parse(JSON.stringify(value));
test('optional alarms reject impossible dates, times, recurrence and extra data', () => {
  assert.equal(rules.normalize(null), null);
  for (const a of [alarm('hourly'), alarm('none','2026-02-30'), alarm('none','2026-09-11','24:00'), alarm('none','0001-01-01')]) assert.equal(rules.normalize(a), null);
  assert.deepEqual(rules.normalize({ ...alarm(), command: 'bad', secret: 'bad' }), alarm());
  assert.equal(rules.next(alarm(), new Date('2026-09-11T18:00:00')), null);
});
test('daily, weekly, weekdays and monthly respect local calendar dates', () => {
  const next = (a, now) => rules.next(a, new Date(now));
  assert.equal(rules.dateKey(next(alarm('daily'), '2026-09-11T19:00:00')), '2026-09-12');
  assert.equal(rules.dateKey(next(alarm('weekdays'), '2026-09-11T19:00:00')), '2026-09-14');
  assert.equal(rules.dateKey(next(alarm('weekly'), '2026-09-11T19:00:00')), '2026-09-18');
  assert.equal(rules.dateKey(next(alarm('monthly','2026-01-31'), '2026-01-31T19:00:00')), '2026-03-31');
  assert.equal(next(alarm('daily'), '2026-09-11T19:00:00').getHours(), 18);
});
test('completed, removed, old and future alarms cannot trigger; midnight catchup works', () => {
  const now = new Date('2026-09-12T00:03:00');
  const base = { id:'pilot', title:'Resolver guia', alarm:alarm('none','2026-09-11','23:59') };
  assert.equal(rules.due([base], now).length,1);
  assert.equal(rules.due([{...base, done:true}],now).length,0);
  assert.equal(rules.due([{...base, alarm:null}],now).length,0);
  assert.equal(rules.due([base], new Date('2026-09-12T00:20:00')).length,0);
  assert.equal(rules.due([base], new Date('2026-09-11T23:58:00')).length,0);
});
const file = path.join(root, 'api/agenda-ai.js');
const sandbox = { require:createRequire(file), module:{exports:{}}, process:{env:{}}, Date, URL, setTimeout, clearTimeout };
vm.runInNewContext(fs.readFileSync(file,'utf8') + '\nmodule.exports.test = {sanitizePlan, sanitizeAgendaItem, buildModelRequest};', sandbox);
const ai = sandbox.module.exports.test;
function input(instruction, agenda=[]) { return {instruction, agenda, subjects:[], today:'2026-09-11', dateFrom:'2026-09-11', dateUntil:'2026-10-11',timezone:'America/Argentina/Buenos_Aires'}; }
function raw(alarmValue) { return {createEvents:[{title:'Resolver guia',eventType:'Tarea',date:'',horaInicio:'',horaFin:'',alarm:alarmValue}]}; }
test('AI keeps one recurring alarm without generating duplicate tasks or requiring a time range', () => {
  const p = ai.sanitizePlan(raw(alarm('weekly')),input('Avisame todos los viernes a las 18 para resolver guia'));
  assert.equal(p.createEvents.length,1); assert.equal(p.createSchedules.length,0); assert.equal(p.clarification,'');
  assert.equal(p.createEvents[0].alarm.repeat,'weekly'); assert.equal(p.createEvents[0].horaFin,'');
  assert.equal(p.createEvents[0].alarm.windows,false,'AI cannot activate native execution on its own');
});
test('AI cannot invent alarm consent or silently choose an unmentioned time', () => {
  const ordinary = ai.sanitizePlan(raw(alarm()),input('Anota resolver guia'));
  assert.equal(Object.hasOwn(ordinary.createEvents[0],'alarm'),false);
  assert.match(ai.sanitizePlan(raw(alarm()),input('Poneme una alarma para resolver guia')).clarification,/hora/);
  assert.ok(ai.sanitizePlan(raw({...alarm(),repeat:'every-second'}),input('Alarma a las 18')).clarification);
});
test('AI edits and removes existing alarms but cannot edit foreign IDs; unrelated edits retain alarm', () => {
  const item = ai.sanitizeAgendaItem({id:'a',title:'Guia',alarm:alarm(),date:''});
  assert.deepEqual(plain(item.alarm),alarm());
  const changed=ai.sanitizePlan({updates:[{id:'a',alarm:alarm('daily','2026-09-11','09:00')},{id:'foreign',alarm:null}]},input('Cambia la alarma de la guia a todos los dias',[item]));
  assert.equal(changed.updates.length,1); assert.equal(changed.updates[0].alarm.windows,true);
  assert.equal(changed.updates[0].alarm.time,'18:00','recurrence-only edits preserve the existing time');
  const retimed=ai.sanitizePlan({updates:[{id:'a',alarm:alarm('daily','2026-09-11','09:00')}]},input('Cambia la alarma de la guia a las 9',[item]));
  assert.equal(retimed.updates[0].alarm.time,'09:00');
  const removed=ai.sanitizePlan({updates:[{id:'a',alarm:null}]},input('Quita la alarma de la guia',[item]));
  assert.equal(removed.updates[0].alarm,null);
  const renamed=ai.sanitizePlan({updates:[{id:'a',title:'Nueva guia',alarm:null}]},input('Cambia el titulo a Nueva guia',[item]));
  assert.equal(Object.hasOwn(renamed.updates[0],'alarm'),false);
  assert.match(JSON.stringify(ai.buildModelRequest(input('Cambia la alarma',[item]))),/alarma/);
});
test('normalizing Inbox and completing a task retains optional alarm fields', () => {
  const source = fs.readFileSync(path.join(root,'scripts/bandeja.js'),'utf8');
  const context={window:{DATA:null},module:{exports:{}},Object,Date};
  const exportable=source.replace('  addAgendaPanel();','  window.testAlarm = {normalizeAgendaItem}; return;\n  addAgendaPanel();').replace('if (!window.DATA || !Array.isArray(DATA.carreras)) return;','');
  context.localStorage={getItem:()=>null};context.document={body:{classList:{contains:()=>false}}};
  vm.runInNewContext(exportable,context);
  assert.deepEqual(plain(context.window.testAlarm.normalizeAgendaItem({id:'a',title:'Guia',alarm:alarm(),done:true}).alarm),alarm());
});
test('Windows scheduler evaluates the same snapshot without showing notices or changing system tasks', {skip:process.platform!=='win32'}, t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'estudiemos-alarm-test-'));
  t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.match(path.basename(dir),/^estudiemos-alarm-test-/);fs.rmSync(dir,{recursive:true,force:true});});
  const data={version:1,items:[{id:'a',title:'Guia piloto',alarm:alarm('weekdays')},{id:'done',title:'Hecha',done:true,alarm:alarm()},{id:'none',title:'Sin alarma'}]};
  const encoded=Buffer.from(JSON.stringify(data)).toString('base64');
  const snapshot=path.join(dir,'InboxAlarms.inc');fs.writeFileSync(snapshot,`[Alarms]\nCount=1\nChunk0=${encoded}\n`);
  const run=now=>{
    const p=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(root,'windows-installer/InboxAlarm.ps1'),'-InputPath',snapshot,'-StateDirectory',dir,'-Now',now,'-DryRun'],{encoding:'utf8',windowsHide:true});
    assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout);
  };
  assert.equal(run('2026-09-11T18:01:00').length,1);
  assert.equal(run('2026-09-12T18:01:00').length,0);
  assert.equal(run('2026-09-14T18:01:00').length,1);
  assert.equal(fs.existsSync(path.join(dir,'delivered.json')),false);
});
