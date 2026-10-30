const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { mobileDatabase, user, subscription } = require('./helpers/mobile-push-db.cjs');
const { LEGACY_ORIGIN, CLOUDFLARE_ORIGIN, CLOUDFLARE_KEY_ID } = require('../api/_lib/push-scope');
const read = name => fs.readFileSync(require.resolve('../supabase/' + name), 'utf8').replace(/\bnow\(\)/g, 'public.test_clock()');
const origins = read('mobile-push-origins.sql');
const cutover = read('mobile-push-cloudflare-only.sql');
const note = { id: 'due', title: 'Repasar', alarm: { date: '2026-10-26', time: '12:00', repeat: 'daily' } };
const register = (db, suffix) => db.query('select register_mobile_push_for_origin($1,$2,$3,$4,$5)',
  [user, subscription(suffix), 'UTC', CLOUDFLARE_ORIGIN, CLOUDFLARE_KEY_ID]);
async function prepare(h) {
  await h.db.exec(origins);
  await h.db.query('update mobile_push_origins set enabled=true where source_origin=$1', [CLOUDFLARE_ORIGIN]);
  await h.db.exec('select tick_mobile_push()');
}

test('final cutover fails closed until Cloudflare is ready', async () => {
  const h = await mobileDatabase();
  try {
    await h.db.exec(origins);
    await assert.rejects(h.db.exec(cutover), /CLOUDFLARE_PUSH_NOT_READY/);
    await h.db.exec('rollback');
    assert.equal((await h.db.query('select enabled from mobile_push_origins where source_origin=$1', [LEGACY_ORIGIN])).rows[0].enabled, true);
  } finally { await h.db.close(); }
});

test('cutover preserves user data and subscriptions, retires old registrations and frees old device slots', async () => {
  const h = await mobileDatabase(), { db } = h;
  try {
    await prepare(h);
    for (let i = 0; i < 5; i++) await h.register('UTC', 'legacy-' + i);
    await h.save([note]); await db.exec('select enqueue_mobile_push_jobs()');
    const states = (await db.query('select * from user_states')).rows;
    const subscriptions = (await db.query('select * from mobile_push_subscriptions order by endpoint')).rows;
    await db.exec(cutover); await db.exec(cutover);
    assert.deepEqual((await db.query('select * from user_states')).rows, states);
    assert.deepEqual((await db.query('select * from mobile_push_subscriptions order by endpoint')).rows, subscriptions);
    assert.equal((await db.query('select mobile_push_ready_for_origin($1,$2) ready', [LEGACY_ORIGIN, 'legacy'])).rows[0].ready, false);
    assert.equal((await db.query('select mobile_push_ready_for_origin($1,$2) ready', [CLOUDFLARE_ORIGIN, CLOUDFLARE_KEY_ID])).rows[0].ready, true);
    await assert.rejects(h.register('UTC', 'retired'), /PUSH_ORIGIN_RETIRED/);
    await assert.rejects(register(db, 'legacy-0'), /another account or origin/);
    for (let i = 0; i < 5; i++) await register(db, 'new-' + i);
    await assert.rejects(register(db, 'new-six'), /Device limit reached/);
    for (const role of ['anon', 'authenticated']) {
      await db.exec('set role ' + role);
      await assert.rejects(register(db, 'forbidden'), /permission denied/);
      await assert.rejects(db.query('select tick_mobile_push()'), /permission denied/);
      await assert.rejects(db.query('select * from mobile_push_origins'), /permission denied/);
      await db.exec('reset role');
    }
    await assert.rejects(db.exec(origins), /PUSH_CLOUDFLARE_ONLY_ACTIVE/);
    await db.exec('rollback');
  } finally { await db.close(); }
});

test('only Cloudflare is scheduled, claimed and dispatched; recurrence, cancellation and deduplication remain intact', async () => {
  const h = await mobileDatabase(), { db } = h;
  try {
    await prepare(h); await h.register('UTC', 'legacy'); await register(db, 'new'); await h.save([note]);
    await db.exec(cutover);
    await db.exec("alter table net.requests add column destination text;create or replace function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$begin insert into net.requests(body,destination) values(body,url);return 1;end$$;");
    await db.exec('select enqueue_mobile_push_jobs()');
    assert.equal((await db.query('select count(*)::int n from mobile_push_jobs')).rows[0].n, 1);
    assert.equal((await db.query('select * from claim_mobile_push_jobs()')).rows.length, 0);
    assert.equal((await db.query('select * from claim_mobile_push_origin_batch($1,$2,1)', [LEGACY_ORIGIN, 'legacy'])).rows.length, 0);
    await db.exec('select tick_mobile_push()');
    assert.deepEqual((await db.query('select destination from net.requests')).rows.map(r => r.destination), [CLOUDFLARE_ORIGIN + '/api/widget-push?mobilePush=dispatch']);
    const jobs = (await db.query('select * from claim_mobile_push_origin_batch($1,$2,1)', [CLOUDFLARE_ORIGIN, CLOUDFLARE_KEY_ID])).rows;
    assert.equal(jobs.length, 1);
    await db.query('select finish_mobile_push_jobs($1)', [[{ id: jobs[0].id, ok: true, expired: false }]]);
    await db.exec('select tick_mobile_push()');
    assert.equal((await db.query('select count(*)::int n from net.requests')).rows[0].n, 1);
    await h.clock('2026-10-27T11:59:35Z'); await db.exec('select enqueue_mobile_push_jobs()');
    assert.equal((await db.query('select count(*)::int n from mobile_push_jobs where sent_at is null')).rows[0].n, 1);
    await h.save([{ ...note, done: true }]);
    assert.equal((await db.query('select count(*)::int n from mobile_push_jobs where sent_at is null')).rows[0].n, 0);
  } finally { await db.close(); }
});

test('legacy-only accounts produce no new jobs, no dispatch calls and no agenda projection work', async () => {
  const h = await mobileDatabase(), { db } = h;
  try {
    await prepare(h); await h.register('UTC', 'legacy'); await h.save([note]);
    await db.exec(cutover);
    await db.exec("create or replace function public.mobile_push_project_agenda(p_user uuid,p_agenda jsonb) returns void language plpgsql as $$begin raise exception 'UNEXPECTED_AGENDA_PROJECTION';end$$;");
    await h.save([{ ...note, title: 'Cambio local' }]);
    await db.exec('select tick_mobile_push()');
    assert.equal((await db.query('select count(*)::int n from mobile_push_jobs')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int n from net.requests')).rows[0].n, 0);
  } finally { await db.close(); }
});

test('the single-origin cron bounds a peak to 400 single-job invocations and stops when disabled', async () => {
  const h = await mobileDatabase(), { db } = h;
  try {
    await prepare(h); await db.exec(cutover);
    await db.query(`insert into mobile_push_subscriptions(user_id,endpoint,subscription,timezone,source_origin,vapid_key_id)
      select $1,'https://web.push.apple.com/Q/peak-'||n,'{}'::jsonb,'UTC',$2,$3 from generate_series(1,500) n`,
    [user, CLOUDFLARE_ORIGIN, CLOUDFLARE_KEY_ID]);
    await h.save([note]); await db.exec('select tick_mobile_push()');
    assert.equal((await db.query('select count(*)::int n from mobile_push_jobs')).rows[0].n, 500);
    assert.equal((await db.query('select count(*)::int n from net.requests')).rows[0].n, 400);
    await db.query('update mobile_push_origins set enabled=false where source_origin=$1', [CLOUDFLARE_ORIGIN]);
    await db.exec('select tick_mobile_push()');
    assert.equal((await db.query('select count(*)::int n from net.requests')).rows[0].n, 400);
  } finally { await db.close(); }
});

test('Vercel Git deployments stay disabled while Cloudflare remains the direct origin', () => {
  assert.equal(require('../vercel.json').git.deploymentEnabled, false);
  const worker = fs.readFileSync(require.resolve('../cloudflare/frontdoor.mjs'), 'utf8');
  assert.doesNotMatch(worker, /vercel\.app/);
  assert.match(worker, /env\.BACKEND/);
  assert.match(worker, /env\.ASSETS/);
});
