const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../scripts/pomodoro.js'),'utf8');
const snapshotCode = source.slice(source.indexOf('  function homeSnapshot()'), source.indexOf('  function addButton()'));

function snapshot(overrides = {}) {
  const context = {
    state:{remaining:1500,running:false,phase:'study',currentBlock:1,config:{blocks:4}},
    streakState:{days:{'day0':35,'day-1':60,'day-2':25}}, alarmActive:false,
    streakSummary:()=>({todayMinutes:35,currentStreak:3}),
    preciseRemainingSeconds:()=>1220.5, durationSeconds:()=>1500,
    dateKey:offset=>'day'+offset, ...overrides
  };
  vm.createContext(context);
  vm.runInContext(snapshotCode,context);
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
