const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const rules=require('../shared/pomodoro-sync');
const control=(writer,updatedAt,extra={})=>({config:{study:25,break:5,blocks:4},phase:'study',currentBlock:1,remaining:1500,running:false,endAt:0,writer,updatedAt,...extra});
test('timer control projection excludes credentials, local credit, alert and position preferences',()=>{
  const value=rules.normalize(control('device-a',100,{access_token:'secret',pendingStudySeconds:500,alarmVolume:2,position:{x:10}}));
  assert.ok(!JSON.stringify(value).includes('secret'));
  assert.equal(value.pendingStudySeconds,undefined);assert.equal(value.alarmVolume,undefined);assert.equal(value.position,undefined);
  for(const invalid of [null,[],{},'broken',control('bad actor!',10),control('a',-1)])assert.equal(rules.normalize(invalid),null);
});
test('shared clock is absolute, ticks do not create changes and control conflicts converge',()=>{
  const a=control('a',100,{running:true,endAt:1500000});
  assert.equal(rules.signature(a),rules.signature({...a,remaining:1400,updatedAt:200,pendingStudySeconds:60}));
  assert.equal(rules.choose(a,control('b',101)).writer,'b');
  assert.equal(rules.choose(control('a',100),control('b',100)).writer,'b');
  assert.equal(rules.choose(control('b',100),control('a',100)).writer,'b');
  assert.notEqual(rules.signature(a),rules.signature({...a,running:false,endAt:0,remaining:1400}));
});
test('cloud merges use the timer revision rather than unrelated device change timestamps',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../scripts/account.js'),'utf8');
  const keys=source.slice(source.indexOf('  const SYNC_KEYS'),source.indexOf('  const LINKED_USER_KEY'));
  const functions=source.slice(source.indexOf('  function createEmptyAccountState()'),source.indexOf('  function readKeyChangedAt()'));
  const c={localStorage:{getItem:()=>null},window:{EstudiemosPomodoroSync:rules,EstudiemosStudyGoal:require('../shared/study-goal')}};
  vm.createContext(c);vm.runInContext(keys+functions,c);
  const state=(timer,stamp)=>({values:{[rules.KEY]:JSON.stringify(timer)},changedAt:{[rules.KEY]:stamp}});
  const a=c.mergeAccountStates(state(control('a',200),1),state(control('b',100),999999));
  assert.equal(JSON.parse(a.values[rules.KEY]).writer,'a');
  assert.equal(a.changedAt[rules.KEY],200);
  assert.ok(vm.runInContext('PRIVATE_SYNC_KEYS.includes("estudiemos_pomodoro_sync")',c));
  assert.equal(c.normalizeAccountState({values:{},changedAt:{}},99999).changedAt[rules.KEY],0);
});

test('remote observers and accounts still loading never replay private study credit',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../scripts/pomodoro.js'),'utf8');
  const functions=source.slice(source.indexOf('  function captureStudyProgress('),source.indexOf('  function streakSummary('));
  let captures=0,records=0,takes=0;
  const c={timerAccountId:'user-a',timerDeviceId:'device-a',sharedTimer:{writer:'device-b'},state:{},
    window:{EstudiemosAccount:{isSynchronized:()=>true},EstudiemosStudyCredit:{capture:()=>++captures,take:()=>{takes++;return {'2026-10-21':60};}}},
    recordStudyPresenceSeconds:()=>records++};
  vm.createContext(c);vm.runInContext(functions,c);
  assert.equal(c.captureStudyProgress(),0);c.flushStudyCredit();
  assert.equal(captures,0);assert.equal(records,0);assert.equal(takes,1);
  c.sharedTimer={writer:'device-a'};
  c.window.EstudiemosAccount.isSynchronized=()=>false;
  assert.equal(c.captureStudyProgress(),0);
  c.window.EstudiemosAccount.isSynchronized=()=>true;
  c.captureStudyProgress();c.flushStudyCredit();
  assert.equal(captures,1);assert.equal(records,1);
});
