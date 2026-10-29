const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { mobileDatabase, user, subscription } = require('./helpers/mobile-push-db.cjs');
const { LEGACY_ORIGIN, CLOUDFLARE_ORIGIN, CLOUDFLARE_KEY_ID } = require('../api/_lib/push-scope');
const migration = fs.readFileSync(require.resolve('../supabase/mobile-push-origins.sql'), 'utf8').replace(/\bnow\(\)/g, 'public.test_clock()');
const note = { id: 'due', title: 'Repasar', alarm: { date: '2026-10-26', time: '12:00', repeat: 'daily' } };
const enable = db => db.query('update mobile_push_origins set enabled=true where source_origin=$1', [CLOUDFLARE_ORIGIN]);
const register = (db, suffix) => db.query('select register_mobile_push_for_origin($1,$2,$3,$4,$5)', [user, subscription(suffix), 'UTC', CLOUDFLARE_ORIGIN, CLOUDFLARE_KEY_ID]);

test('origin migration is additive and repeatable without deleting existing subscriptions, notes or jobs', async () => {
  const h = await mobileDatabase(); const { db } = h;
  try {
    await h.register(); await h.save([note, { id: 'plain', title: 'Nota sin alarma' }]);
    await db.exec('select enqueue_mobile_push_jobs()');
    const before = (await db.query('select state from user_states')).rows;
    const saved = (await db.query('select subscription from mobile_push_subscriptions')).rows;
    await db.exec(migration); await db.exec(migration);
    assert.deepEqual((await db.query('select state from user_states')).rows, before);
    assert.deepEqual((await db.query('select subscription from mobile_push_subscriptions')).rows, saved);
    assert.equal((await db.query('select count(*)::int n from mobile_push_jobs')).rows[0].n, 1);
    assert.equal((await db.query('select source_origin,vapid_key_id from mobile_push_subscriptions')).rows[0].source_origin, LEGACY_ORIGIN);
    assert.equal((await db.query('select source_origin,vapid_key_id from mobile_push_subscriptions')).rows[0].vapid_key_id, 'legacy');
    assert.equal((await db.query('select enabled from mobile_push_origins where source_origin=$1', [CLOUDFLARE_ORIGIN])).rows[0].enabled, false);
    await enable(db); await db.exec(migration);
    assert.equal((await db.query('select enabled from mobile_push_origins where source_origin=$1', [CLOUDFLARE_ORIGIN])).rows[0].enabled, true);
  } finally { await db.close(); }
});

test('old and new registrations are immutable by origin and share the same per-user device limit', async () => {
  const h = await mobileDatabase(); const { db } = h;
  try {
    await db.exec(migration); await h.register('UTC', 'legacy');
    await assert.rejects(register(db, 'new'), /PUSH_SCOPE_NOT_READY/);
    await enable(db); await register(db, 'new');
    await assert.rejects(register(db, 'legacy'), /another account or origin/);
    await assert.rejects(h.register('UTC', 'new'), /another account or origin/);
    await register(db, 'new');
    for (const suffix of ['three', 'four', 'five']) await h.register('UTC', suffix);
    await assert.rejects(register(db, 'six'), /Device limit reached/);
    await assert.rejects(db.query('select register_mobile_push_for_origin($1,$2,$3,$4,$5)', [user, subscription('bad'), 'UTC', 'https://attacker.invalid', CLOUDFLARE_KEY_ID]), /PUSH_SCOPE_NOT_READY/);
    assert.equal((await db.query('select count(*)::int n from mobile_push_subscriptions')).rows[0].n, 5);
  } finally { await db.close(); }
});

test('legacy and scoped claims never consume each others jobs or attempts', async () => {
  const h = await mobileDatabase(); const { db } = h;
  try {
    await db.exec(migration); await enable(db);
    await h.register('UTC', 'legacy'); await register(db, 'new'); await h.save([note]);
    await db.exec('select enqueue_mobile_push_jobs()');
    const oldJobs = (await db.query('select * from claim_mobile_push_jobs()')).rows;
    assert.equal(oldJobs.length, 1); assert.ok(oldJobs[0].subscription.endpoint.endsWith('/legacy'));
    assert.equal((await db.query("select q.attempts from mobile_push_jobs q join mobile_push_subscriptions s on s.id=q.subscription_id where s.vapid_key_id=$1", [CLOUDFLARE_KEY_ID])).rows[0].attempts, 0);
    const newJobs = (await db.query('select * from claim_mobile_push_origin_batch($1,$2,$3)', [CLOUDFLARE_ORIGIN, CLOUDFLARE_KEY_ID, 1])).rows;
    assert.equal(newJobs.length, 1); assert.ok(newJobs[0].subscription.endpoint.endsWith('/new'));
    assert.notEqual(oldJobs[0].id, newJobs[0].id);
    await assert.rejects(db.query('select * from claim_mobile_push_origin_batch($1,$2,1)', [CLOUDFLARE_ORIGIN, 'legacy']), /INVALID_PUSH_SCOPE/);
    await db.query('select finish_mobile_push_jobs($1)', [[...oldJobs, ...newJobs].map(job => ({ id: job.id, ok: true, expired: false }))]);
    assert.equal((await db.query('select count(*)::int n from mobile_push_jobs where sent_at is not null')).rows[0].n, 2);
    await h.clock('2026-10-27T11:59:35Z'); await db.exec('select enqueue_mobile_push_jobs()');
    await h.save([{ ...note, done: true }]);
    assert.equal((await db.query('select count(*)::int n from mobile_push_jobs where sent_at is null')).rows[0].n, 0);
  } finally { await db.close(); }
});

test('the single existing tick routes fixed origins, does no HTTP work on empty ticks, and does not scan calendars', async () => {
  const h = await mobileDatabase(); const { db } = h;
  try {
    await db.exec(migration);
    await db.exec("alter table net.requests add column destination text;create or replace function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$begin insert into net.requests(body,destination) values(body,url);return 1;end$$;");
    await db.exec('select tick_mobile_push()');
    assert.equal((await db.query('select count(*)::int n from net.requests')).rows[0].n, 0);
    assert.equal((await db.query('select mobile_push_ready_for_origin($1,$2) ready', [CLOUDFLARE_ORIGIN, CLOUDFLARE_KEY_ID])).rows[0].ready, false);
    await enable(db); await h.register('UTC', 'legacy'); await register(db, 'new'); await h.save([note]);
    await db.exec("create or replace function public.mobile_push_project_agenda(p_user uuid,p_agenda jsonb) returns void language plpgsql as $$begin raise exception 'UNEXPECTED_CALENDAR_SCAN';end$$;");
    await db.exec('select tick_mobile_push()');
    const destinations = (await db.query('select destination from net.requests order by destination')).rows.map(row => row.destination);
    assert.deepEqual(destinations, [LEGACY_ORIGIN + '/api/widget-push?mobilePush=dispatch', CLOUDFLARE_ORIGIN + '/api/widget-push?mobilePush=dispatch'].sort());
    assert.equal((await db.query('select mobile_push_ready_for_origin($1,$2) ready', [CLOUDFLARE_ORIGIN, CLOUDFLARE_KEY_ID])).rows[0].ready, true);
    await db.query('update mobile_push_origins set enabled=false where source_origin=$1', [CLOUDFLARE_ORIGIN]);
    assert.equal((await db.query('select * from claim_mobile_push_origin_batch($1,$2,1)', [CLOUDFLARE_ORIGIN, CLOUDFLARE_KEY_ID])).rows.length, 0);
  } finally { await db.close(); }
});

test('origins and service RPCs remain private, and old migrations cannot restore unscoped claims', async () => {
  const h = await mobileDatabase(); const { db } = h;
  try {
    await db.exec(migration);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await db.exec('set role ' + role);
      await assert.rejects(db.query('select * from mobile_push_origins'), /permission denied/);
      await assert.rejects(db.query('select tick_mobile_push()'), /permission denied/);
      if (role !== 'service_role') {
        await assert.rejects(db.query('select mobile_push_ready_for_origin($1,$2)', [CLOUDFLARE_ORIGIN, CLOUDFLARE_KEY_ID]), /permission denied/);
        await assert.rejects(register(db, 'new'), /permission denied/);
        await assert.rejects(db.query('select * from claim_mobile_push_origin_batch($1,$2,1)', [CLOUDFLARE_ORIGIN, CLOUDFLARE_KEY_ID]), /permission denied/);
      }
      await db.exec('reset role');
    }
    for (const name of ['mobile-notifications.sql', 'mobile-notifications-indexed.sql', 'mobile-notifications-cron.sql', 'mobile-notifications-cloudflare-cron.sql']) {
      const sql = fs.readFileSync(require.resolve('../supabase/' + name), 'utf8').replace(/^create extension .*;$/gm, '');
      await assert.rejects(db.exec(sql), /PUSH_ORIGIN_MIGRATION_ACTIVE/);
      await db.exec('rollback');
    }
  } finally { await db.close(); }
});

test('a simultaneous peak keeps the global 400-job dispatch bound and gives both origins a share', async () => {
  const h = await mobileDatabase(); const { db } = h;
  try {
    await db.exec(migration); await enable(db);
    await db.exec("alter table net.requests add column destination text;create or replace function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$begin insert into net.requests(body,destination) values(body,url);return 1;end$$;");
    await h.register('UTC', 'legacy'); await register(db, 'new');
    await h.save(Array.from({ length: 250 }, (_, index) => ({ ...note, id: 'peak-' + index })));
    await db.exec('select tick_mobile_push()');
    const counts = (await db.query('select destination,count(*)::int n from net.requests group by destination')).rows;
    assert.equal(counts.find(row => row.destination.startsWith(LEGACY_ORIGIN)).n, 2);
    assert.equal(counts.find(row => row.destination.startsWith(CLOUDFLARE_ORIGIN)).n, 200);
    assert.equal((await db.query('select count(*)::int n from mobile_push_jobs where attempts=0')).rows[0].n, 500);
  } finally { await db.close(); }
});
