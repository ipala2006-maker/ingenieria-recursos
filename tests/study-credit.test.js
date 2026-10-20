const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const credit = require('../shared/study-credit');
const goals = require('../shared/study-goal');
process.env.TZ = 'America/Argentina/Buenos_Aires';
const at = value => new Date(value).getTime();
function session(start, minutes = 59) {
  return { running: true, phase: 'study', config: { study: minutes, break: 5, blocks: 4 }, studyCreditAt: at(start), endAt: at(start) + minutes * 60000, updatedAt: at(start), pendingStudySeconds: 0 };
}

test('reopening yesterday\'s expired hour never credits today', () => {
  const timer = session('2026-10-19T20:00:00');
  assert.equal(credit.capture(timer, at('2026-10-20T08:00:00')), 3540);
  assert.deepEqual(credit.take(timer), { '2026-10-19': 3540 });
  assert.equal(credit.capture(timer, at('2026-10-20T08:00:10')), 0);
  assert.deepEqual(credit.take(timer), {});
});

test('a running block and sub-minute pending credit split at the local midnight', () => {
  const timer = session('2026-10-19T23:59:30', 25);
  credit.capture(timer, at('2026-10-19T23:59:50'));
  credit.capture(timer, at('2026-10-20T00:00:30'));
  assert.deepEqual(credit.take(timer), { '2026-10-19': 30, '2026-10-20': 30 });
});

test('legacy pending seconds use their earned timestamp even when paused or on a break', () => {
  for (const phase of ['study', 'break']) {
    const timer = { phase, running: false, pendingStudySeconds: 3540, studyCreditAt: 0, updatedAt: at('2026-10-19T22:00:00') };
    assert.deepEqual(credit.take(timer, at('2026-10-20T08:00:00')), { '2026-10-19': 3540 });
    assert.deepEqual(credit.take(timer), {});
  }
  assert.deepEqual(credit.take({pendingStudySeconds:3540}),{},'unknown legacy timestamps cannot be credited as today');
});

test('a persisted pending map is consumed once without adding its legacy total twice', () => {
  const timer = session('2026-10-19T23:50:00', 25);
  credit.capture(timer, at('2026-10-20T00:05:00'));
  const restored = JSON.parse(JSON.stringify(timer));
  credit.capture(restored, at('2026-10-20T00:10:00'));
  assert.deepEqual(credit.take(restored), { '2026-10-19': 600, '2026-10-20': 600 });
  assert.equal(restored.pendingStudySeconds, 0);
});

test('rest, paused, unknown deadlines and repeated reads never invent study time', () => {
  for (const extra of [{ phase: 'break' }, { running: false }, { endAt: 0 }, { studyCreditAt: at('2026-10-21T12:00:00') }]) {
    const timer = { ...session('2026-10-19T12:00:00'), ...extra };
    assert.equal(credit.capture(timer, at('2026-10-19T12:10:00')), 0);
    assert.deepEqual(credit.take(timer), {});
  }
  const timer = session('2026-10-19T12:00:00'); timer.studyCreditAt -= 86400000;
  assert.equal(credit.capture(timer, at('2026-10-19T14:00:00')), 3540, 'never credit more than the configured block');
});

test('local day boundaries account for daylight-saving transitions', () => {
  const zone = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    const timer = { pendingStudySeconds: 86400, studyCreditAt: at('2026-03-09T01:00:00') };
    assert.deepEqual(credit.take(timer), { '2026-03-08': 23 * 3600, '2026-03-09': 3600 });
  } finally { process.env.TZ = zone; }
});

test('the desktop widget applies expired credit to yesterday and leaves today at zero', () => {
  const source = fs.readFileSync(path.join(__dirname, '../scripts/desktop-widgets.js'), 'utf8');
  const storage = new Map();
  const context = { window: { EstudiemosStudyCredit: credit, EstudiemosStudyGoal: goals, dispatchEvent() {} },
    STREAK_KEY: 'streak', localStorage: { getItem: key => storage.get(key), setItem: (key,value) => storage.set(key,value) },
    CustomEvent: class {}, Date: class extends Date { static now() { return at('2026-10-20T08:00:00'); } } };
  vm.runInNewContext(source.slice(source.indexOf('  function capturePomodoroStudyProgress('), source.indexOf('  function reconcileDesktopPomodoro(')), context);
  const timer = session('2026-10-19T20:00:00');
  context.capturePomodoroStudyProgress(timer); context.flushPomodoroStudyProgress(timer);
  assert.deepEqual(JSON.parse(storage.get('streak')).days, { '2026-10-19': 59 });
  assert.equal(goals.summary(JSON.parse(storage.get('streak')),new Date('2026-10-20T08:00:00')).todayMinutes, 0);
});
