const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const goals = require('../shared/study-goal');
const source = fs.readFileSync(path.join(__dirname, '../scripts/pomodoro.js'), 'utf8');
const reminders = source.slice(source.indexOf('  async function clearStreakReminders()'), source.indexOf('  function pruneReminderHistory()'));
const notify = source.slice(source.indexOf('  async function showDeviceNotification('), source.indexOf('  function loadStreakState()'));
const date = '2026-10-14';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function harness() {
  let now = date + 'T19:30:00', user = 'alice', saved, sync = async () => true;
  const shown = [], closed = [], direct = [], existing = [];
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  const registration = { getNotifications: async () => existing, showNotification: async (title, options) => shown.push({ title, ...options }) };
  class Notice {
    static permission = 'granted';
    constructor(title, options) { Object.assign(this, { title, ...options }); direct.push(this); }
    close() { closed.push(this.tag); }
    addEventListener() {}
  }
  const state = minutes => ({ days: { [date]: minutes }, goal: { minutes: 45, updatedAt: 1 }, reminderSlots: {} });
  saved = state(44);
  const context = {
    streakState: structuredClone(saved), streakReminderBusy: false, streakReminderCleanupKey: '', streakReminderNotices: new Set(),
    goalUserId: user, goals, Date: Clock, Notification: Notice, URL, SCRIPT_URL: 'https://estudiemos-app.vercel.app/scripts/pomodoro.js', location: { href: 'https://estudiemos-app.vercel.app/' },
    navigator: { serviceWorker: { ready: Promise.resolve(registration), getRegistration: async () => registration } }, serviceWorkerRegistration: null,
    STREAK_REMINDER_SLOTS: [720, 870, 1020, 1170, 1320].map(minutes => ({ id: String(minutes), minutes })),
    window: { Notification: Notice, EstudiemosAccount: { getUser: () => user ? { id: user } : null, whenReady: async () => ({}), refresh: () => sync() } },
    streakSummary: () => goals.summary(context.streakState, new Clock()),
    loadStreakState: () => structuredClone(saved), pruneReminderHistory() {}, saveStreakState: () => { saved = structuredClone(context.streakState); }
  };
  vm.runInNewContext(notify + reminders, context);
  return { context, shown, closed, direct, existing, registration, state, setSaved: value => { saved = value; }, setSync: value => { sync = value; }, setUser: value => { user = value; }, setNow: value => { now = value; } };
}

test('fresh cross-device progress suppresses a reminder from a stale tab at every daily slot', async () => {
  for (const time of ['12:00', '14:30', '17:00', '19:30', '22:00']) {
    const h = harness(); h.setNow(date + 'T' + time + ':00');
    h.setSync(async () => { h.setSaved(h.state(52)); return true; });
    await h.context.maybeShowStreakReminder();
    assert.equal(h.shown.length, 0); assert.equal(h.direct.length, 0);
    assert.equal(h.context.streakState.days[date], 52);
  }
});

test('pending goals still notify once, completed goals at the boundary stop, and the next day is independent', async () => {
  const h = harness();
  await h.context.maybeShowStreakReminder(); await h.context.maybeShowStreakReminder();
  assert.equal(h.shown.length, 1); assert.match(h.shown[0].body, /1 min/);
  h.context.streakState = h.state(45); h.setSaved(h.state(45));
  await h.context.maybeShowStreakReminder(); assert.equal(h.shown.length, 1);
  h.setNow('2026-10-15T12:00:00');
  await h.context.maybeShowStreakReminder(); assert.equal(h.shown.length, 2, 'yesterday completion does not suppress today');
});

test('failed or busy synchronization, startup and account changes cannot trigger stale reminders', async () => {
  for (const sync of [async () => false, async () => undefined, async () => { throw Error('offline'); }]) {
    const h = harness(); h.setSync(sync); await h.context.maybeShowStreakReminder();
    assert.equal(h.shown.length, 0); assert.equal(h.context.streakReminderBusy, false);
  }
  const h = harness(), ready = deferred();
  h.context.window.EstudiemosAccount.whenReady = () => ready.promise;
  const waiting = h.context.maybeShowStreakReminder(); assert.equal(h.shown.length, 0);
  h.context.streakState = h.state(52); ready.resolve(); await waiting;
  assert.equal(h.shown.length, 0);
  const other = harness(); other.setSync(async () => { other.setUser('bob'); return true; });
  await other.context.maybeShowStreakReminder(); assert.equal(other.shown.length, 0);
});

test('completion while the notification service is loading is checked immediately before showing', async () => {
  const h = harness(), ready = deferred();
  h.context.navigator.serviceWorker.ready = ready.promise;
  const waiting = h.context.maybeShowStreakReminder();
  await new Promise(setImmediate);
  h.context.streakState = h.state(52); ready.resolve(h.registration); await waiting;
  assert.equal(h.shown.length, 0); assert.equal(h.direct.length, 0);
});

test('concurrent focus and interval events cannot duplicate a reminder', async () => {
  const h = harness(), sync = deferred(); h.setSync(() => sync.promise);
  const first = h.context.maybeShowStreakReminder(); await h.context.maybeShowStreakReminder();
  sync.resolve(true); await first;
  assert.equal(h.shown.length, 1);
});

test('only the five scheduled windows can notify, never a catch-up on opening the app', async () => {
  for (const time of ['00:00', '11:59', '12:05', '13:00', '14:29', '14:35', '16:00', '17:05', '19:35', '22:05', '23:59']) {
    const h = harness(); h.setNow(date + 'T' + time + ':00');
    await h.context.maybeShowStreakReminder(); assert.equal(h.shown.length, 0, time);
  }
  for (const time of ['12:00', '14:30', '17:00', '19:30', '22:00']) {
    const h = harness(); h.setNow(date + 'T' + time + ':00');
    await h.context.maybeShowStreakReminder(); await h.context.maybeShowStreakReminder();
    assert.equal(h.shown.length, 1, time);
  }
});

test('a connected Windows device owns delivery; the browser does not send a duplicate', async () => {
  const h = harness(); h.context.window.EstudiemosInboxAlarms = { nativeReady: () => true };
  await h.context.maybeShowStreakReminder(); assert.equal(h.shown.length, 0);
  h.context.window.EstudiemosInboxAlarms.nativeReady = () => false;
  await h.context.maybeShowStreakReminder(); assert.equal(h.shown.length, 1, 'the browser remains a fallback when not connected');
});

test('a delayed notification service cannot deliver outside the scheduled window', async () => {
  const h = harness(), ready = deferred(); h.context.navigator.serviceWorker.ready = ready.promise;
  const waiting = h.context.maybeShowStreakReminder(); await new Promise(setImmediate);
  h.setNow(date + 'T19:36:00'); ready.resolve(h.registration); await waiting;
  assert.equal(h.shown.length, 0);
});

test('an active browser-tab lock suppresses a second tab before it synchronizes or shows', async () => {
  const h = harness(); h.context.navigator.locks = { request: async (name, options, callback) => {
    assert.match(name, /alice$/); assert.equal(options.ifAvailable, true); return callback(null);
  } };
  await h.context.maybeShowStreakReminder(); assert.equal(h.shown.length, 0);
});

test('clearing completed study notices never closes Inbox or Pomodoro alarms', async () => {
  const h = harness();
  h.existing.push(...['estudiemos-streak-2026-10-14-12:00', 'estudiemos-pomodoro', 'estudiemos-inbox-task'].map(tag => ({ tag, close: () => h.closed.push(tag) })));
  h.context.streakState = h.state(45); await h.context.maybeShowStreakReminder();
  assert.deepEqual(h.closed, ['estudiemos-streak-2026-10-14-12:00']);
  const fallback = harness(); fallback.context.navigator.serviceWorker = undefined;
  await fallback.context.maybeShowStreakReminder(); assert.equal(fallback.direct.length, 1);
  fallback.context.streakState = fallback.state(45); await fallback.context.maybeShowStreakReminder();
  assert.equal(fallback.closed.length, 1);
  await fallback.context.showDeviceNotification('Final del Pomodoro', 'Descanso');
  assert.equal(fallback.direct.length, 2, 'a completed daily goal never disables a timer alarm');
});

test('a logout or day change while waiting for notification permission cannot notify the old account/day', async () => {
  for (const change of [h => h.setUser(''), h => h.setNow('2026-10-15T00:00:01')]) {
    const h = harness(), ready = deferred(); h.context.navigator.serviceWorker.ready = ready.promise;
    const waiting = h.context.maybeShowStreakReminder(); await new Promise(setImmediate);
    change(h); ready.resolve(h.registration); await waiting;
    assert.equal(h.shown.length, 0); assert.equal(h.direct.length, 0);
  }
});

test('account refresh confirms success only after completing its read/merge/write cycle', async () => {
  const accountSource = fs.readFileSync(path.join(__dirname, '../scripts/account.js'), 'utf8');
  const fn = accountSource.slice(accountSource.indexOf('  async function synchronize(reason)'), accountSource.indexOf('  async function uploadState('));
  let result = { data: { state: {}, updated_at: new Date().toISOString() } }, restored = false;
  const context = {
    client: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }) }, session: { user: { id: 'alice' } }, syncing: false, syncRequested: false,
    AUTH_ONLY:false,compactVersions:null,compactAvailable:null,syncConflicts:0,synchronizedUserId: '', lastPullAt: 0, LINKED_USER_KEY: 'linked', DIRTY_KEY: 'dirty', LOCAL_CHANGED_KEY: 'changed',
    queuedSyncReason:'queued',cloudRevision:'',cloudRevisionUser:'',cachedCloudState:null,accountGeneration:0,syncFailures:0,syncRetryAt:0,navigator:{onLine:true},
    localStorage: { getItem: () => 'alice', setItem() {} }, Date, CustomEvent: class {},
    window: { dispatchEvent() {}, setTimeout() {} }, updateSyncLabel() {}, updateAccountIndicator() {}, setStatus() {},
    captureLocalState: () => ({}), normalizeAccountState: value => value, mergeAccountStates: () => ({}), applyCloudState: () => { restored = true; }, uploadState: async () => {},
    cloudCheckInterval:()=>0,recordSyncUsage(){},syncJsonBytes:()=>0,compactSync:async()=>null
  };
  vm.runInNewContext(fn, context);
  assert.equal(await context.synchronize('widget'), true); assert.equal(restored, true);
  context.syncing = true; assert.equal(await context.synchronize('widget'), false);
  context.syncing = false; result = { error: Error('offline') }; assert.equal(await context.synchronize('widget'), false);
  context.session = null; assert.equal(await context.synchronize('widget'), false);
});
