const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const rules = require('../shared/timetable');
function harness() {
  const source = fs.readFileSync(path.join(__dirname, '../scripts/dashboard.js'), 'utf8');
  const data = new Map(), changes = [], window = {EstudiemosTimetableRules:rules, dispatchEvent:e=>changes.push(e.detail.key)};
  const storage = {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  vm.runInNewContext(source.replace('  addTopbarActions();', '  window.test = { calendarCleanupValues, writeCalendarCleanup }; return;'), {
    window,document:{body:{classList:{contains:()=>false}}},localStorage:storage,
    matchMedia:()=>({addEventListener(){}}),CustomEvent:class {constructor(type,options){this.detail=options.detail;}}
  });
  return {...window.test,data,changes,storage};
}
const dated={id:'dated',title:'Parcial',date:'2026-10-20',alarm:{date:'2026-10-20',time:'10:00'}};
const undated={id:'note',title:'Idea',date:'',alarm:{date:'2026-10-21',time:'11:00'}};
const weekly={id:'weekly',title:'Fisica',days:[1,3],start:'08:00',end:'10:00',color:'blue'};
const plain=value=>JSON.parse(JSON.stringify(value));
test('calendar cleanup archives dated entries and schedules but preserves undated alarms and unrelated state',()=>{
  const h=harness();
  h.data.set('estudiemos_pomodoro_streak','private progress');
  h.data.set('unrelated','private notes');
  const plan=h.calendarCleanupValues([dated,undated],[weekly],[],false,123);
  assert.deepEqual(plain(plan),{bandeja_calendario_papelera:[{createdAt:123,agenda:[dated],weekly:[weekly]}],bandeja_agenda:[undated],bandeja_horarios:[]});
  h.writeCalendarCleanup(plan);
  assert.equal(h.data.get('estudiemos_pomodoro_streak'),'private progress');
  assert.equal(h.data.get('unrelated'),'private notes');
  assert.deepEqual(h.changes,['bandeja_calendario_papelera','bandeja_agenda','bandeja_horarios']);
  const restored=h.calendarCleanupValues([undated],[],plan.bandeja_calendario_papelera,true);
  assert.deepEqual(plain(restored.bandeja_agenda),[dated,undated]);
  assert.deepEqual(plain(restored.bandeja_horarios),[weekly]);
  assert.deepEqual(plain(restored.bandeja_calendario_papelera),[]);
});
test('restore merges current edits, never duplicates an ID or silently truncates a full calendar',()=>{
  const h=harness(),backups=[{agenda:[dated],weekly:[weekly]}];
  const edited={...dated,title:'Parcial actualizado'};
  const plan=h.calendarCleanupValues([edited,undated],[{...weekly,title:'Nueva materia'}],backups,true);
  assert.deepEqual(plain(plan.bandeja_agenda),[edited,undated]);
  assert.equal(plan.bandeja_horarios.length,1);assert.equal(plan.bandeja_horarios[0].title,'Nueva materia');
  assert.throws(()=>h.calendarCleanupValues(Array.from({length:500},(_,i)=>({...undated,id:'n'+i})),[],backups,true),/espacio/);
  assert.throws(()=>h.calendarCleanupValues([],Array.from({length:100},(_,i)=>({...weekly,id:'s'+i})),backups,true),/espacio/);
});
test('empty cleanup retains its existing recovery copy and corrupt state fails closed',()=>{
  const h=harness();
  assert.equal(h.calendarCleanupValues([undated],[],[{agenda:[dated],weekly:[weekly]}],false),null);
  for(const args of [[null,[],[],false],[[],{},[],false],[[],[],null,false],[[],[],[],true],[[],[],[{}],true]])assert.throws(()=>h.calendarCleanupValues(...args));
});
test('partial storage failure rolls back all three keys before broadcasting any changes',()=>{
  const h=harness();
  h.data.set('bandeja_agenda',JSON.stringify([dated,undated]));
  h.data.set('bandeja_horarios',JSON.stringify([weekly]));
  const before=[...h.data],set=h.storage.setItem;let failed=false;
  h.storage.setItem=(key,value)=>{if(key==='bandeja_agenda'&&!failed){failed=true;throw new Error('Quota');}set(key,value);};
  assert.throws(()=>h.writeCalendarCleanup(h.calendarCleanupValues([dated,undated],[weekly],[],false)),/Quota/);
  assert.deepEqual([...h.data],before);assert.deepEqual(h.changes,[]);
});
test('recovery copy is privately synced, cleared on account switch, and never inherits a newer unrelated timestamp',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../scripts/account.js'),'utf8');
  const keys=source.slice(source.indexOf('  const SYNC_KEYS'),source.indexOf('  const LINKED_USER_KEY'));
  const capture=source.slice(source.indexOf('  function captureLocalState()'),source.indexOf('  function applyCloudState('));
  const c={localStorage:{getItem:key=>key==='changed'?'99999':null},LOCAL_CHANGED_KEY:'changed',readKeyChangedAt:()=>({bandeja_agenda:99999})};
  vm.runInNewContext(keys+capture+';this.result={keys:SYNC_KEYS,privateKeys:PRIVATE_SYNC_KEYS,state:captureLocalState()}',c);
  assert.ok(c.result.keys.includes('bandeja_calendario_papelera'));
  assert.ok(c.result.privateKeys.includes('bandeja_calendario_papelera'));
  assert.equal(c.result.state.changedAt.bandeja_calendario_papelera,0);
});
