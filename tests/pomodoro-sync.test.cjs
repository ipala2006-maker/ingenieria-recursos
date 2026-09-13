const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../scripts/pomodoro.js'), 'utf8');
const persistence = source.slice(source.indexOf('  function readStoredTimer()'), source.indexOf('  function normalizeDailyCount()'));

function timer() {
  let now = 1000, writes = 0, nativeMessages = 0, ticker = false;
  const initial = {config:{blocks:4,study:25,break:5},phase:'study',remaining:1500,running:false,endAt:0,updatedAt:100};
  let stored = JSON.stringify(initial);
  const context = {
    state:structuredClone(initial), STORAGE_KEY:'timer', DEFAULT_CONFIG:initial.config,
    Date:{now:()=>now}, localStorage:{getItem:()=>stored,setItem:(_,value)=>{stored=value;writes++;}},
    positiveInteger:(value,fallback)=>Number(value)>0?Number(value):fallback,
    configInteger:(_,value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback,
    nonNegativeNumber:(value,fallback)=>Number.isFinite(Number(value))?Math.max(0,Number(value)):fallback,
    nonNegativeInteger:(value,fallback)=>Number.isFinite(Number(value))?Math.max(0,Math.floor(Number(value))):fallback,
    volumeNumber:(value,fallback)=>value??fallback, todayKey:()=>'2026-09-12',
    render:()=>{}, reconcileTimer:()=>{}, syncWakeLock:()=>{},
    stopTicker:()=>{ticker=false;},startTickerIfNeeded:()=>{if(context.state.running)ticker=true;},
    syncPomodoroWithAndroid:()=>{nativeMessages++;}
  };
  vm.runInNewContext(persistence, context);
  return {context, initial, setNow:value=>{now=value;}, remote:value=>{stored=JSON.stringify(value);}, stored:()=>JSON.parse(stored), writes:()=>writes, nativeMessages:()=>nativeMessages,ticker:()=>ticker};
}

test('a stale suspended tab cannot save a paused snapshot over a newer play',()=>{
  const t=timer();
  t.remote({...t.initial,running:true,endAt:1503000,studyCreditAt:3000,updatedAt:3000});
  t.setNow(9000);
  t.context.saveState();
  assert.equal(t.context.state.running,true);
  assert.equal(t.stored().endAt,1503000);
  assert.equal(t.writes(),0);
  assert.equal(t.ticker(),true);
  assert.equal(t.nativeMessages(),0,'receiving a snapshot must not echo it back with a newer timestamp');
});

test('delayed old snapshots are ignored and an intentional newer pause stops the ticker',()=>{
  const t=timer();
  t.context.adoptTimerState({...t.initial,running:true,endAt:1503000,updatedAt:3000});
  assert.equal(t.context.adoptTimerState({...t.initial,updatedAt:2000}),false);
  assert.equal(t.context.state.running,true);
  assert.equal(t.context.adoptTimerState({...t.initial,remaining:1490,updatedAt:4000}),true);
  assert.equal(t.context.state.remaining,1490);
  assert.equal(t.ticker(),false);
});

test('saving two actions in one millisecond still gives an ordered version',()=>{
  const t=timer();
  t.context.saveState();
  const first=t.stored().updatedAt;
  t.context.state.running=true;t.context.state.endAt=1501000;
  t.context.saveState();
  assert.equal(t.stored().updatedAt,first+1);
  assert.equal(t.stored().running,true);
});

test('missing or corrupt remote state does not pause the running in-memory timer',()=>{
  const t=timer();
  t.context.state.running=true;t.context.state.updatedAt=3000;
  for(const incoming of [null,[],{updatedAt:'bad'},{updatedAt:0}])assert.equal(t.context.adoptTimerState(incoming),false);
  assert.equal(t.context.state.running,true);
});
