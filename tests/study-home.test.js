const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../scripts/pomodoro.js'),'utf8');
const snapshotCode = source.slice(source.indexOf('  function homeSnapshot()'), source.indexOf('  function addButton()'));
const controlsCode = source.slice(source.indexOf('  function setRemaining('), source.indexOf('  function openPomodoroFromUrl()'));

function snapshot(overrides = {}) {
  const context = {
    state:{remaining:1500,running:false,phase:'study',currentBlock:1,config:{blocks:4}},
    streakState:{days:{'day0':35,'day-1':60,'day-2':25}}, alarmActive:false,
    streakSummary:()=>({todayMinutes:35,currentStreak:3}),
    preciseRemainingSeconds:()=>1220.5, durationSeconds:()=>1500,
    dateKey:offset=>'day'+offset, adoptTimerState:()=>false, ...overrides
  };
  vm.createContext(context);
  vm.runInContext(snapshotCode,context);
  vm.runInContext(controlsCode,context);
  return {context, value:context.homeSnapshot()};
}

test('home uses the existing timer and real seven-day study total', () => {
  const {value}=snapshot();
  assert.equal(value.remaining,1500);
  assert.equal(value.weekMinutes,120);
  assert.equal(value.todayMinutes,35);
  assert.equal(value.currentStreak,3);
  assert.equal(value.days.length,7);
});

test('running home timer uses the same deadline with no extra timekeeping', () => {
  const {value,context}=snapshot({state:{remaining:1500,running:true,phase:'study',currentBlock:2,config:{blocks:4}}});
  assert.equal(value.remaining,1221);
  assert.equal(value.block,2);
  assert.equal(value.progress,1-1221/1500);
  assert.equal(context.state.remaining,1500);
});

test('home snapshot is a detached view, never writable streak state', () => {
  const {value,context}=snapshot();
  value.days[6].minutes=9999;
  assert.equal(context.streakState.days.day0,35);
});

test('no history and zero-duration phases have an honest empty state', () => {
  const {value}=snapshot({streakState:{days:{}},durationSeconds:()=>0});
  assert.equal(value.weekMinutes,0);
  assert.equal(value.progress,0);
});

test('home does not duplicate the timer or send AI requests itself', () => {
  const home=fs.readFileSync(path.join(__dirname,'../scripts/study-home.js'),'utf8');
  assert.doesNotMatch(home,/setInterval|fetch\(|innerHTML\s*=/);
  assert.match(home,/EstudiemosStudy\?\.toggle\(\)/);
  assert.match(home,/estudiemos:open-general-ai/);
});

function adjustableTimer() {
  let credited = 0;
  const context = {
    MAX_MINUTES:59, Date:{now:()=>700000},
    state:{remaining:1500,running:true,phase:'study',currentBlock:1,config:{blocks:4,study:25,break:5},studyCreditAt:100000,endAt:1600000,pendingStudySeconds:0,completedToday:0},
    reconcileTimer:()=>{}, stopAlarm:()=>{}, saveState:()=>{}, render:()=>{}, adoptTimerState:()=>false,
    durationSeconds:()=>context.state.config[context.state.phase]*60,
    safeEndTime:seconds=>700000+seconds*1000,
    recordStudyPresenceSeconds:seconds=>{ credited+=seconds; }
  };
  vm.createContext(context);
  vm.runInContext(snapshotCode,context);
  vm.runInContext(controlsCode,context);
  vm.runInContext(source.slice(source.indexOf('  function captureStudyProgress('),source.indexOf('  function streakSummary()')),context);
  return {context, credited:()=>credited};
}

test('dial changes only remaining time and credits actual elapsed seconds once', () => {
  const {context,credited}=adjustableTimer();
  context.setRemaining(300);
  assert.equal(credited(),600);
  assert.equal(context.state.remaining,300);
  assert.equal(context.state.endAt,1000000);
  assert.equal(context.state.studyCreditAt,700000);
  context.setRemaining(2400);
  assert.equal(credited(),600,'dial adjustment must not mint study credit');
  assert.equal(context.state.config.study,40);
  assert.equal(context.state.completedToday,0);
});

test('dial is bounded, rejects non-finite values and never starts paused timers', () => {
  const {context}=adjustableTimer();
  context.state.running=false;
  context.setRemaining(-999); assert.equal(context.state.remaining,60);
  context.setRemaining(1e20); assert.equal(context.state.remaining,3540);
  context.setRemaining(NaN); assert.equal(context.state.remaining,3540);
  assert.equal(context.state.running,false); assert.equal(context.state.endAt,0);
});

test('rest adjustments never credit study minutes', () => {
  const {context,credited}=adjustableTimer();
  context.state.phase='break';
  context.setRemaining(120);
  assert.equal(credited(),0);
});

test('historical ranges stay detached, bounded and use real recorded days', () => {
  const {context}=snapshot();
  assert.equal(context.studyHistory('month').length,30);
  assert.equal(context.studyHistory('week',1).at(-1).date,'day0');
  assert.equal(context.studyHistory('week',-1).at(-1).date,'day-7');
  const days=context.studyHistory();days.at(-1).minutes=999;
  assert.equal(context.streakState.days.day0,35);
});

function skippableTimer(overrides = {}) {
  let credited = 0, notified = 0, saved = 0, ticker = false;
  const context = {
    Date:{now:()=>700000},
    state:{running:true,phase:'study',currentBlock:2,config:{study:25,break:5,blocks:4},remaining:900,endAt:1600000,studyCreditAt:100000,pendingStudySeconds:0,completedToday:0,autoStart:true,...overrides},
    adoptTimerState:()=>false, stopAlarm:()=>{}, stopTicker:()=>{ticker=false;},
    startTickerIfNeeded:()=>{ticker=true;}, normalizeDailyCount:()=>{},
    notifyCompletion:()=>{notified++;}, saveState:()=>{saved++;}, syncWakeLock:()=>{}, render:()=>{},
    safeEndTime:seconds=>700000+seconds*1000,
    durationSeconds:phase=>context.state.config[phase]*60,
    recordStudyPresenceSeconds:seconds=>{credited+=seconds;}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  function captureStudyProgress('),source.indexOf('  function streakSummary()')),context);
  vm.runInContext(source.slice(source.indexOf('  function skipPhase()'),source.indexOf('  function reconcileTimer(')),context);
  return {context,credited:()=>credited,notified:()=>notified,saved:()=>saved,ticker:()=>ticker};
}

test('skipping running study keeps the next rest running and only credits elapsed time',()=>{
  const t=skippableTimer();
  t.context.skipPhase();
  assert.equal(t.context.state.phase,'break');
  assert.equal(t.context.state.currentBlock,2);
  assert.equal(t.context.state.remaining,300);
  assert.equal(t.context.state.endAt,1000000);
  assert.equal(t.context.state.running,true);
  assert.equal(t.credited(),600);
  assert.equal(t.context.state.completedToday,0);
  assert.equal(t.context.state.studyCreditAt,0);
  assert.equal(t.notified(),0);
  assert.equal(t.saved(),1);
  assert.equal(t.ticker(),true);
});

test('skipping rest advances the block, never credits rest and restarts the study deadline',()=>{
  const t=skippableTimer({phase:'break'});
  t.context.skipPhase();
  assert.equal(t.context.state.phase,'study');
  assert.equal(t.context.state.currentBlock,3);
  assert.equal(t.context.state.remaining,1500);
  assert.equal(t.context.state.endAt,2200000);
  assert.equal(t.context.state.studyCreditAt,700000);
  assert.equal(t.credited(),0);
  assert.equal(t.notified(),0);
});

test('a paused skip stays paused even with auto-start enabled and wraps after the last block',()=>{
  const t=skippableTimer({phase:'break',currentBlock:4,running:false,endAt:0});
  t.context.skipPhase();
  assert.equal(t.context.state.phase,'study');
  assert.equal(t.context.state.currentBlock,1);
  assert.equal(t.context.state.running,false);
  assert.equal(t.context.state.endAt,0);
  assert.equal(t.credited(),0);
  assert.equal(t.ticker(),false);
});

test('zero-minute rests advance directly to study, for skips and natural completion',()=>{
  const t=skippableTimer({config:{study:25,break:0,blocks:4}});
  t.context.skipPhase();
  assert.equal(t.context.state.phase,'study');
  assert.equal(t.context.state.currentBlock,3);
  assert.equal(t.context.state.remaining,1500);
  t.context.advancePhase(true);
  assert.equal(t.context.state.phase,'study');
  assert.equal(t.context.state.currentBlock,4);
  assert.equal(t.context.state.completedToday,1);
  assert.equal(t.notified(),1);
});

test('skip adopts the latest shared timer before changing its phase',()=>{
  const t=skippableTimer();
  t.context.adoptTimerState=()=>{Object.assign(t.context.state,{phase:'break',currentBlock:3,running:false});};
  t.context.skipPhase();
  assert.equal(t.context.state.phase,'study');
  assert.equal(t.context.state.currentBlock,4);
  assert.equal(t.credited(),0);
  assert.equal(t.context.state.running,false);
  assert.match(source,/skip: skipPhase/);
});
