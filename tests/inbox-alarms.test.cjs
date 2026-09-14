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
vm.runInNewContext(fs.readFileSync(file,'utf8') + '\nmodule.exports.test = {sanitizePlan, sanitizeAgendaItem, buildModelRequest, createSimpleAlarmPlan};', sandbox);
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
  const repaired=ai.sanitizePlan(raw({...alarm(),repeat:'every-second'}),{...input('Alarma a las 18'),localTime:'12:00'});
  assert.equal(repaired.clarification,'');
  assert.equal(repaired.createEvents[0].alarm.time,'18:00');
  assert.equal(repaired.createEvents[0].alarm.repeat,'none');
});

test('clear natural alarms survive an empty or malformed model plan', () => {
  const tomorrow=ai.sanitizePlan({clarification:'¿Qué día y hora querés?'},{...input('Recordame entregar el informe mañana a las 18:30'),localTime:'10:15'});
  assert.equal(tomorrow.clarification,'');
  assert.equal(tomorrow.createEvents.length,1);
  assert.equal(tomorrow.createEvents[0].title,'entregar el informe');
  assert.equal(tomorrow.createEvents[0].alarm.date,'2026-09-12');
  assert.equal(tomorrow.createEvents[0].alarm.time,'18:30');
  const relative=ai.sanitizePlan({}, {...input('Avisame en 20 minutos de repasar cálculo'),localTime:'23:50'});
  assert.equal(relative.createEvents[0].alarm.date,'2026-09-12');
  assert.equal(relative.createEvents[0].alarm.time,'00:10');
});

test('clear alarm commands bypass the model and understand compact am/pm times', () => {
  const tomorrow=ai.createSimpleAlarmPlan({...input('Avisame mañana a las 18 de entregar el trabajo'),localTime:'10:15'});
  assert.equal(tomorrow.clarification,'');
  assert.equal(tomorrow.createEvents[0].title,'entregar el trabajo');
  assert.equal(tomorrow.createEvents[0].alarm.date,'2026-09-12');
  assert.equal(tomorrow.createEvents[0].alarm.time,'18:00');
  const evening=ai.createSimpleAlarmPlan({...input('Recordame repasar hoy 8pm'),localTime:'10:15'});
  assert.equal(evening.createEvents[0].alarm.date,'2026-09-11');
  assert.equal(evening.createEvents[0].alarm.time,'20:00');
});

test('a partial event time never rejects the task', () => {
  const plan=ai.sanitizePlan({createEvents:[{title:'Preparar parcial',eventType:'Tarea',date:'',horaInicio:'18:00',horaFin:''}]},input('Anota preparar parcial'));
  assert.equal(plan.createEvents.length,1);
  assert.equal(plan.createEvents[0].horaInicio,'');
  assert.equal(plan.createEvents[0].horaFin,'');
});

test('natural alarm phrases route to Inbox and support hours written in words', () => {
  for(const phrase of ['Poneme una alarma','Recuérdame repasar','Avisame mañana a las seis de la tarde']) assert.equal(rules.hasIntent(phrase),true);
  assert.equal(rules.hasIntent('Crear carpeta Física'),false);
  const plan=ai.sanitizePlan(raw(alarm()),input('Recuérdame resolver guía a las seis de la tarde'));
  assert.equal(plan.clarification,'');
  assert.equal(plan.createEvents[0].alarm.time,'18:00');
  const without=ai.sanitizePlan(raw(alarm()),input('Anota resolver guia sin alarma'));
  assert.equal(without.clarification,'');
  assert.equal(Object.hasOwn(without.createEvents[0],'alarm'),false);
});

test('a model repeating the alarm hour as the start of an event does not discard the task', () => {
  const response=raw(alarm());response.createEvents[0].horaInicio='18:00';
  const plan=ai.sanitizePlan(response,input('Alarma para resolver guia a las 18'));
  assert.equal(plan.createEvents.length,1);
  assert.equal(plan.createEvents[0].horaInicio,'');
  assert.equal(plan.createEvents[0].alarm.time,'18:00');
});

test('relative alarm instructions need the device local time, not the server clock',()=>{
  const plan=ai.sanitizePlan(raw(alarm('none','2026-09-12','00:05')),{...input('Avisame en 10 minutos de resolver guia'),localTime:'23:55'});
  assert.equal(plan.clarification,'');
  assert.ok(ai.sanitizePlan(raw(alarm()),input('Avisame en 10 minutos de resolver guia')).clarification);
  assert.match(JSON.stringify(ai.buildModelRequest({...input('Avisame en 10 minutos'),localTime:'23:55'})),/horaLocalActual/);
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

test('AI alarms reuse Windows delivery only after the user opted in', () => {
  const source=fs.readFileSync(path.join(root,'scripts/bandeja.js'),'utf8');
  const fn=source.slice(source.indexOf('  function normalizeAssistantAlarm('),source.indexOf('  function normalizeAgendaAssistantUpdate('));
  let consent=false;
  const context={window:{EstudiemosAlarmRules:rules},localStorage:{getItem:()=>String(consent)}};
  vm.runInNewContext(fn,context);
  const proposed={...alarm(),windows:false};
  assert.equal(context.normalizeAssistantAlarm(proposed).windows,false);
  consent=true;
  assert.equal(context.normalizeAssistantAlarm(proposed).windows,true);
  assert.equal(proposed.windows,false,'does not mutate the model response');
  assert.equal(context.normalizeAssistantAlarm(null),null);
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

test('Windows alarm task uses headless console mode and stays hidden between checks', () => {
  const installer=fs.readFileSync(path.join(root,'windows-installer/InstallInboxAlarm.ps1'),'utf8');
  const packageSource=fs.readFileSync(path.join(root,'windows-installer/Estudiemos-Windows.iss'),'utf8');
  assert.match(installer,/Settings\.Hidden\s*=\s*\$true/);
  assert.match(installer,/System32\\conhost\.exe/);
  assert.match(installer,/--headless/);
  assert.doesNotMatch(installer,/action\.Path[^\r\n]+powershell/i);
  assert.doesNotMatch(packageSource,/InboxAlarmLauncher\.vbs/);
});

test('Windows keeps a hidden alarm bridge active without visible widgets', () => {
  const bridge=fs.readFileSync(path.join(root,'windows-rainmeter/Skins/Estudiemos/AlarmBridge/AlarmBridge.ini'),'utf8');
  const packageSource=fs.readFileSync(path.join(root,'windows-installer/Estudiemos-Windows.iss'),'utf8');
  const launcher=fs.readFileSync(path.join(root,'windows-installer/WidgetLauncher.vbs'),'utf8');
  assert.match(bridge,/WindowX=-10000/);
  assert.match(bridge,/ClickThrough=1/);
  assert.match(bridge,/refreshFromCloud/);
  assert.match(packageSource,/ActivateConfig \"Estudiemos\\AlarmBridge\"/);
  assert.match(launcher,/Estudiemos\\AlarmBridge/);
  assert.match(packageSource,/#define AppVersion \"1\.5\.0\"/);
});

test('due Windows alarms show their names in a dismissible full-screen alert with looping sound', () => {
  const source=fs.readFileSync(path.join(root,'windows-installer/InboxAlarm.ps1'),'utf8');
  assert.match(source,/FormBorderStyle\]::None/);
  assert.match(source,/PrimaryScreen\]::PrimaryScreen\.Bounds|Screen\]::PrimaryScreen\.Bounds/);
  assert.match(source,/\.TopMost\s*=\s*\$true/);
  assert.match(source,/\$alarmName\.Text\s*=\s*\(\$titles -join/);
  assert.match(source,/PlayLooping\(\)/);
  assert.match(source,/Media\\Ring05\.wav/);
  assert.match(source,/\$dismissButton\.Text\s*=\s*'Entendido'/);
  assert.match(source,/Keys\]::Escape/);
});
