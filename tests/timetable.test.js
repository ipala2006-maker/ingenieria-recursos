const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rules = require('../shared/timetable');
const entry = (extra = {}) => ({ id:'class-1', title:'Algebra', days:[1,3,5], start:'08:00', end:'10:00', place:'Aula 2', color:'teal', ...extra });

test('recurring periods include their boundaries and never leak outside the semester', () => {
  const item=entry({startDate:'2026-10-20',endDate:'2026-10-30'});
  assert.deepEqual(rules.normalize(item),item);
  assert.deepEqual(rules.occurrences([item],'2026-10-18','2026-11-02').map(i=>i.date),['2026-10-21','2026-10-23','2026-10-26','2026-10-28','2026-10-30']);
  assert.equal(rules.occurrences([item],'2026-11-01','2026-11-30').length,0);
  assert.equal(rules.occurrences([entry({days:[0,1,2,3,4,5,6],startDate:'2028-02-28',endDate:'2028-03-01'})],'2028-02-01','2028-03-10').length,3);
  for(const bad of [{startDate:'2026-02-30'},{endDate:'2026-13-01'},{startDate:'2026-10-30',endDate:'2026-10-20'},{startDate:{}},{endDate:7}])assert.equal(rules.normalize(entry(bad)),null);
  assert.equal(rules.normalize(entry()).startDate,undefined,'legacy unbounded weeks remain unbounded');
  assert.equal(rules.overlaps([item],entry({id:'later',startDate:'2026-11-01'})).length,0);
});

test('chosen colors apply to one-off activities too, without making them recurring', () => {
  assert.equal(rules.eventClass({id:'note',color:'rose'}),'is-colored timetable-color--rose');
  assert.equal(rules.eventClass({id:'note',color:'<script>'}),'');
  const source=fs.readFileSync(path.join(__dirname,'../scripts/bandeja.js'),'utf8');
  const fn=source.slice(source.indexOf('  function normalizeAgendaItem('),source.indexOf('  function compareAgendaItems('));
  const context={window:{EstudiemosTimetableRules:rules},normalizeAgendaType:t=>t};
  vm.runInNewContext(fn+';this.normalize=normalizeAgendaItem;',context);
  assert.equal(context.normalize({id:'once',title:'Parcial',type:'Tarea',color:'rose'}).color,'rose');
  assert.equal(context.normalize({id:'once',title:'Parcial',type:'Tarea',color:'bad'}).color,'');
});

test('one weekly schedule holds several days without expanding dated notes or alarms', () => {
  assert.deepEqual(rules.normalize(entry({ days:[5,1,1,3,0,99,'2'] })), entry({ days:[1,3,5,0] }));
  assert.equal(rules.forDay([entry()],1).length,1);
  assert.equal(rules.forDay([entry()],2).length,0);
  assert.equal(rules.list([entry()])[0].date,undefined);
  assert.equal(rules.list([entry()])[0].alarm,undefined);
  assert.equal(rules.normalize(entry({ color:'invalid' })).color,'blue');
});

test('invalid hours, missing days, reversed intervals and oversized lists are bounded', () => {
  for (const extra of [{title:''},{id:''},{days:[]},{days:[7]},{start:'25:00'},{end:'8:00'},{start:'10:00'},{end:'07:00'},{start:null}]) assert.equal(rules.normalize(entry(extra)),null);
  assert.equal(rules.list(Array.from({length:120},(_,i)=>entry({id:'id-'+i}))).length,100);
  assert.equal(rules.list([entry(),entry({title:'Edited'})]).length,1);
  assert.equal(rules.normalize(entry({title:'x'.repeat(500),place:'a'.repeat(500)})).title.length,90);
});

test('weekly blocks are chronologically sorted and overlapping sessions are identified, not silently removed', () => {
  const items = [entry(), entry({id:'late',start:'10:00',end:'11:00'}), entry({id:'first',start:'07:00',end:'08:00'})];
  assert.deepEqual(rules.forDay(items,3).map(item=>item.id),['first','class-1','late']);
  assert.equal(rules.overlaps(items,entry()).length,0);
  assert.deepEqual(rules.overlaps(items,entry({id:'new',start:'09:30',end:'10:30'})).map(item=>item.id),['class-1','late']);
  assert.equal(rules.overlaps(items,entry({id:'new',days:[2]})).length,0);
});

test('weekly schedules join the existing private account sync, switch and logout boundaries', () => {
  const source = fs.readFileSync(path.join(__dirname,'../scripts/account.js'),'utf8');
  const keys = source.slice(source.indexOf('  const SYNC_KEYS'),source.indexOf('  const LINKED_USER_KEY'));
  const functions = source.slice(source.indexOf('  function createEmptyAccountState()'),source.indexOf('  function mergeAccountStates('));
  const context = { localStorage:{getItem:()=>null}, Set, JSON };
  vm.runInNewContext(keys + functions + '\nthis.result={keys:SYNC_KEYS,privateKeys:PRIVATE_SYNC_KEYS,empty:createEmptyAccountState(),normalize:normalizeAccountState};',context);
  assert.ok(context.result.privateKeys.includes(rules.KEY));
  const normalized = context.result.normalize({values:{[rules.KEY]:[entry()],bandeja_agenda:[{id:'note',title:'Parcial',date:'2026-10-18'}]},changedAt:{[rules.KEY]:123}});
  assert.equal(normalized.values[rules.KEY][0].title,'Algebra'); assert.equal(normalized.changedAt[rules.KEY],123);
  assert.equal(normalized.values.bandeja_agenda.length,1);
  assert.equal(context.result.empty.values[rules.KEY].length,0);
  assert.equal(context.result.normalize({values:{[rules.KEY]:'not a list'}}).values[rules.KEY].length,0);
});

test('a newly upgraded device cannot overwrite a saved week with an unrelated local timestamp', () => {
  const source = fs.readFileSync(path.join(__dirname,'../scripts/account.js'),'utf8');
  const keys = source.slice(source.indexOf('  const SYNC_KEYS'),source.indexOf('  const LINKED_USER_KEY'));
  const fn = source.slice(source.indexOf('  function captureLocalState()'),source.indexOf('  function applyCloudState('));
  const values = { changed:'99999' };
  const context = { localStorage:{getItem:key=>values[key]??null}, Set, JSON, LOCAL_CHANGED_KEY:'changed', readKeyChangedAt:()=>({bandeja_agenda:99999}) };
  vm.runInNewContext(keys + fn + '\nthis.capture=captureLocalState;',context);
  assert.equal(context.capture().changedAt.bandeja_horarios,0);
  context.readKeyChangedAt=()=>({bandeja_horarios:123});
  assert.equal(context.capture().changedAt.bandeja_horarios,123);
});

test('calendar occurrences cover month/week/year boundaries without changing stored schedules', () => {
  const schedule = entry({days:[0,1,2,3,4,5,6]});
  const before = JSON.stringify(schedule);
  const events = rules.occurrences([schedule], '2026-12-30', '2027-01-03');
  assert.deepEqual(events.map(event=>event.date),['2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
  assert.equal(new Set(events.map(event=>event.id)).size,5);
  assert.equal(events[0].scheduleId,schedule.id); assert.equal(events[0].color,'teal');
  assert.equal(events[0].horaInicio,'08:00'); assert.equal(events[0].horaFin,'10:00');
  assert.equal(events[0].alarm,undefined); assert.equal(JSON.stringify(schedule),before);
  assert.equal(rules.occurrences([schedule],'2028-02-28','2028-03-01').length,3);
});

test('calendar projection is bounded, rejects invalid dates and uses the original chosen colors only', () => {
  const schedule = entry({days:[0,1,2,3,4,5,6]});
  assert.equal(rules.occurrences([schedule],'2026-01-01','2027-01-01').length,62);
  for (const [from,until] of [['2026-02-30','2026-03-01'],['2026-03-10','2026-03-01'],['<img>','2026-03-01']]) assert.equal(rules.occurrences([schedule],from,until).length,0);
  assert.equal(rules.eventClass({scheduleId:'one',color:'teal'}),'is-recurring timetable-color--teal');
  assert.equal(rules.eventClass({scheduleId:'one',color:'blue" onload="alert(1)'}),'');
  const events=rules.occurrences([entry({days:[1,3,5]})],'2026-10-19','2026-10-25');
  assert.deepEqual(events.map(event=>event.date),['2026-10-19','2026-10-21','2026-10-23']);
  assert.deepEqual(rules.read({getItem:()=>'{malformed'}),[]);
});
