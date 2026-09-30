const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const { validSubscription, validZone, cronAuthorized } = require('../api/_lib/mobile-push');
const root = path.resolve(__dirname, '..');
const subscription = { endpoint: 'https://web.push.apple.com/Q/test', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } };
const user = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';

test('push only accepts encrypted subscriptions to official providers, never arbitrary servers', () => {
  assert.ok(validSubscription(subscription));
  for (const endpoint of ['http://web.push.apple.com/Q/test', 'https://localhost/x', 'https://127.0.0.1/x', 'https://web.push.apple.com.evil.test/x', 'https://user:pass@web.push.apple.com/x', 'https://web.push.apple.com:123/x', 'https://example.com/x']) {
    assert.equal(validSubscription({ ...subscription, endpoint }), false, endpoint);
  }
  assert.equal(validSubscription({ ...subscription, keys: { auth: 'x', p256dh: 'y' } }), false);
  assert.equal(validSubscription(null), false);
  assert.equal(validZone('America/Argentina/Buenos_Aires'), true);
  assert.equal(validZone('invalid'), false);
  process.env.MOBILE_PUSH_CRON_SECRET = 't'.repeat(40);
  assert.equal(cronAuthorized('Bearer '+ 't'.repeat(40)), true);
  assert.equal(cronAuthorized('Bearer bad'), false);
  delete process.env.MOBILE_PUSH_CRON_SECRET;
});

test('new alarms include compatibility delivery on every platform without granting a new device permission', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/inbox-alarms.js'), 'utf8');
  const readForm = source.slice(source.indexOf('function readForm(form)'), source.indexOf('function mount()'));
  assert.match(readForm, /windows: true/);
  assert.doesNotMatch(readForm, /data-alarm-native/);
  assert.match(source, /user && localConsent/);
});

test('database enforces ownership, recurrence, deduplication and cancels completed tasks before sending', async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create table public.user_states(user_id uuid primary key, state jsonb, updated_at timestamptz default now());");
    await db.exec(fs.readFileSync(path.join(root, 'supabase/mobile-notifications.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(root, 'supabase/windows-alarms.sql'), 'utf8'));
    await db.query('insert into auth.users values ($1),($2)', [user, other]);
    await db.query('select register_mobile_push($1,$2,$3)', [user, subscription, 'America/Argentina/Buenos_Aires']);
    await assert.rejects(db.query('select register_mobile_push($1,$2,$3)', [other, subscription, 'UTC']), /another account/);
    await assert.rejects(db.query('select register_mobile_push($1,$2,$3)', [user, subscription, 'not-a-zone']), /Invalid/);
    // Create a current occurrence using the database clock, including near-midnight runs.
    const { rows: [clock] } = await db.query("select to_char((now()-interval '1 minute') at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD') as date, to_char((now()-interval '1 minute') at time zone 'America/Argentina/Buenos_Aires','HH24:MI') as time");
    const agenda = [
      { id: 'due', title: 'Pilot task', alarm: { ...clock, repeat: 'daily' } },
      { id: 'done', done: true, alarm: clock }, { id: 'no-alarm' },
      { id: 'invalid', alarm: { date: '2026-99-99', time: '99:00' } }
    ];
    await db.query('insert into user_states values ($1,$2)', [user, { values: { bandeja_agenda: JSON.stringify(agenda) } }]);
    const windows = (await db.query('select * from get_windows_alarm_snapshot($1)',[user])).rows[0];
    assert.ok(windows.alarm_items.some(item=>item.id==='due' && item.alarm.windows===true),'Windows receives a mobile alarm without a per-task Windows opt-in');
    assert.equal((await db.query('select * from mobile_due_tasks($1,$2)', [other, 'UTC'])).rows.length, 0);
    const due = (await db.query('select * from mobile_due_tasks($1,$2)', [user, 'America/Argentina/Buenos_Aires'])).rows;
    assert.equal(due.length, 1); assert.equal(due[0].title, 'Pilot task');
    await db.exec("insert into mobile_push_jobs(subscription_id,task_id,occurrence) select s.id,t.task_id,t.occurrence from mobile_push_subscriptions s cross join lateral mobile_due_tasks(s.user_id,s.timezone)t on conflict do nothing");
    let jobs = (await db.query('select * from claim_mobile_push_jobs()')).rows;
    assert.equal(jobs.length, 1); assert.equal(jobs[0].owner, user);
    assert.equal((await db.query('select * from claim_mobile_push_jobs()')).rows.length, 0, 'lease prevents duplicate concurrent sends');
    await db.query('select finish_mobile_push_job($1,true,false)', [jobs[0].id]);
    assert.equal((await db.query('select * from claim_mobile_push_jobs()')).rows.length, 0);
    await db.exec('update mobile_push_jobs set sent_at=null, available_at=now()');
    agenda[0].done = true;
    await db.query('update user_states set state=$2 where user_id=$1', [user, { values: { bandeja_agenda: agenda } }]);
    assert.equal((await db.query('select * from claim_mobile_push_jobs()')).rows.length, 0, 'completion is checked immediately before claiming');
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select * from mobile_push_subscriptions'), /permission denied/);
      await assert.rejects(db.query('select * from claim_mobile_push_jobs()'), /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    assert.equal((await db.query('select mobile_push_ready() as ready')).rows[0].ready, false);
    await db.exec('reset role');
    await db.exec('insert into mobile_push_health values(true,now())');
    assert.equal((await db.query('select mobile_push_ready() as ready')).rows[0].ready, true);
    // Exercise the actual cron SQL with local HTTP/Vault stubs; never send a real notification.
    await db.exec("create schema vault; create table vault.decrypted_secrets(name text,decrypted_secret text); create schema cron; create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$; create schema net; create table net.requests(body jsonb); create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$begin insert into net.requests values(body); return 1; end$$;");
    await db.exec(fs.readFileSync(path.join(root, 'supabase/mobile-notifications-cron.sql'),'utf8').replace(/^create extension .*;$/gm,''));
    await db.query('insert into vault.decrypted_secrets values($1,$2)', ['estudiemos_mobile_push_cron', 'test-only'.repeat(8)]);
    await db.exec('select tick_mobile_push()');
    assert.equal((await db.query('select * from net.requests')).rows.length,0,'no paid or network work for an empty inbox');
    agenda[0].done = false;
    await db.query('update user_states set state=$2 where user_id=$1', [user, {values:{bandeja_agenda:agenda}}]);
    await db.exec('select tick_mobile_push()');
    assert.equal((await db.query('select * from net.requests')).rows.length,1);
    await db.exec('select tick_mobile_push()');
    assert.equal((await db.query('select * from mobile_push_jobs')).rows.length,1,'cron ticks cannot duplicate an occurrence');
  } finally { await db.close(); }
});

test('service worker shows system notification with no open client and prevents foreign-account disclosure', async () => {
  const handlers = {}, notices = [], cache = new Map();
  const self = { location: { origin: 'https://estudiemos-app.vercel.app' }, registration: { scope: 'https://estudiemos-app.vercel.app/', showNotification: async (title, options) => notices.push({ title, options }) }, addEventListener: (name, fn) => { handlers[name] = fn; } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8'), { self, URL, Response, caches: { open: async () => ({ put: async (key, value) => cache.set(key, value), match: async key => cache.get(key)?.clone(), delete: async key => cache.delete(key) }) } });
  let wait;
  handlers.message({ data: { type: 'ESTUDIEMOS_PUSH_OWNER', owner: user }, source: { url: self.registration.scope }, waitUntil: p => wait=p }); await wait;
  for (const owner of [other, user]) { handlers.push({ data: { json: () => ({ owner, title: 'Pilot task', body: 'Reminder' }) }, waitUntil: p => wait=p }); await wait; }
  assert.equal(notices.length, 1); assert.equal(notices[0].title, 'Pilot task');
  assert.equal(notices[0].options.data.url, 'https://estudiemos-app.vercel.app/?agenda=1');
});

function mobileClient({ android = false, installed = true, enabled = true } = {}) {
  const listeners = {}, storage = new Map(), sent = [];
  let currentUser = user, subscriptionValue = null, unsubscribed = 0, permissionRequests = 0;
  const reg = { active: { postMessage: value => sent.push(value) }, pushManager: {
    getSubscription: async () => subscriptionValue,
    subscribe: async () => subscriptionValue = { toJSON: () => subscription, unsubscribe: async () => { subscriptionValue=null; unsubscribed++; return true; } }
  } };
  const account = { getUser: () => currentUser ? { id: currentUser } : null, getSession: () => ({access_token:'test-session'}), whenReady: async () => {} };
  const notification = { permission: 'default', requestPermission: () => { permissionRequests++; notification.permission='granted'; return Promise.resolve('granted'); } };
  const window = { EstudiemosAccount: account, Notification: notification, PushManager: {}, addEventListener: (name,fn) => (listeners[name] ||= []).push(fn), dispatchEvent: e => { for(const fn of listeners[e.type] || []) fn(e); } };
  if (android) window.EstudiemosAndroid = { postMessage: text => sent.push(JSON.parse(text)) };
  const context = { window, Notification: notification, navigator: { userAgent: android ? 'Android' : 'iPhone', standalone: installed, platform:'iPhone', serviceWorker:{getRegistration:async()=>reg,ready:Promise.resolve(reg)} }, document:{currentScript:{src:'https://estudiemos-app.vercel.app/scripts/mobile-notifications.js'}}, matchMedia:()=>({matches:installed}), URL, Uint8Array, Intl, atob: str => Buffer.from(str,'base64').toString('binary'), CustomEvent: class {constructor(type,init){this.type=type;this.detail=init?.detail;}}, localStorage: { getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key) }, fetch: async (url,options) => {
    if(!options?.method) return {ok:true,json:async()=>({enabled,publicKey:'B'.repeat(87)})};
    sent.push(JSON.parse(options.body)); return {ok:enabled,json:async()=>({connected:enabled})};
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root,'scripts/mobile-notifications.js'),'utf8'),context);
  return { api: window.EstudiemosMobileNotifications, sent, flush:()=>new Promise(resolve=>setImmediate(resolve)), requests:()=>permissionRequests, unsubscribed:()=>unsubscribed,
    nativeStatus: value=>window.dispatchEvent({type:'estudiemos-android-inbox-status',detail:value}), logout:()=>{currentUser=null; window.dispatchEvent({type:'estudiemos:account-change'});} };
}

test('Android activation uses the native permission bridge, not browser notifications', async () => {
  const client = mobileClient({android:true}); await client.flush();
  client.nativeStatus({permission:'default',exact:false}); await client.api.request();
  assert.ok(client.sent.some(message=>message.type==='inbox-notifications-enable'));
  assert.equal(client.requests(),0);
  client.nativeStatus({permission:'granted',exact:true});
  assert.equal(client.api.status().ready,true);
  await client.api.request(); assert.ok(client.sent.some(message=>message.type==='inbox-notifications-settings'));
});

test('iPhone requires home-screen install and backend readiness, then disconnects on logout', async () => {
  const tab = mobileClient({installed:false}); await tab.flush();
  assert.match(tab.api.status().text,/Agregar a inicio/); await tab.api.request(); assert.equal(tab.requests(),0);
  const unavailable = mobileClient({enabled:false}); await unavailable.flush();
  await unavailable.api.request(); assert.equal(unavailable.requests(),0); assert.notEqual(unavailable.api.status().ready,true);
  const client = mobileClient(); await client.flush();
  await client.api.request(); assert.equal(client.requests(),1); assert.equal(client.api.status().ready,true);
  assert.ok(client.sent.some(message=>message.action==='test'));
  client.logout(); await client.flush(); assert.equal(client.unsubscribed(),1); assert.notEqual(client.api.status().ready,true);
});
