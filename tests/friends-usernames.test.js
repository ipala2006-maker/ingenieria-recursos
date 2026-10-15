const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/friend-random-usernames.sql');
const ids = [1, 2, 3].map(n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
const pattern = /^[a-z]+[0-9]{2,3}$/;
async function database() {
  const db = new PGlite();
  await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create table user_states(user_id uuid primary key,state jsonb);');
  await db.exec(read('supabase/friends.sql'));
  await db.exec(read('supabase/study-goals.sql'));
  for (const [n, id] of ids.entries()) await db.query('insert into auth.users values($1,$2,now())', [id, `student${n}@example.test`]);
  return db;
}
const call = async (db, id, action = 'list', data = {}) => (await db.query('select friends_action($1,$2,$3) as result', [id, action, data])).rows[0].result;

test('new profiles receive a persistent English handle with digits, without using identity data', async () => {
  const db = await database();
  try {
    const first = await call(db, ids[0]);
    assert.match(first.me.username, pattern); assert.equal(first.me.name, first.me.username);
    assert.equal(first.me.share, false);
    assert.equal((await call(db, ids[0])).me.username, first.me.username);
    const sent = await call(db, ids[1], 'request_email', { email: 'student2@example.test' });
    assert.match(sent.outgoing[0].username, pattern, 'recipient gets a handle before ever opening Friends');
    const recipient = await call(db, ids[2]);
    assert.equal(recipient.me.username, sent.outgoing[0].username);
    await call(db, ids[0], 'request_username', { username: recipient.me.username });
    assert.equal((await call(db, ids[2])).incoming.length, 2, 'automatic handles work for exact invitations');
    await call(db, ids[0], 'profile', { name: 'my_name', username: 'my_name', share: false, timezone: 'UTC' });
    assert.equal((await call(db, ids[0])).me.username, 'my_name');
    await db.exec(migration);
    assert.equal((await call(db, ids[0])).me.username, 'my_name', 'chosen handles are never replaced');
    assert.equal((await call(db, ids[2])).me.username, recipient.me.username);
  } finally { await db.close(); }
});

test('a generated collision is retried and manually taking an existing name is still rejected', async () => {
  const db = await database();
  try {
    await db.exec('select setseed(0.42)');
    const alice = await call(db, ids[0]);
    await db.exec('select setseed(0.42)');
    const bob = await call(db, ids[1]);
    assert.match(bob.me.username, pattern); assert.notEqual(bob.me.username, alice.me.username);
    await assert.rejects(call(db, ids[1], 'profile', { name: alice.me.username, username: alice.me.username, share: false, timezone: 'UTC' }), /USERNAME_TAKEN/);
    assert.equal((await call(db, ids[1])).me.username, bob.me.username);
    const source = read('supabase/friends.sql');
    const normalize = value => value.replace(/\r\n/g, '\n').trim();
    const generator = normalize(migration.slice(migration.indexOf('create or replace function'), migration.lastIndexOf('commit;')));
    assert.ok(normalize(source).includes(generator), 'fresh installations include the same generator');
  } finally { await db.close(); }
});

test('migration names old blank profiles while preserving chosen handles, links, privacy and goal rules', async () => {
  const db = await database();
  try {
    await db.exec('alter table friend_profiles disable trigger friend_auto_username');
    await db.query("insert into friend_profiles(user_id,name,username,share_streak,timezone) values ($1,'Estudiante',null,false,'UTC'),($2,'chosen_name','chosen_name',true,'America/Argentina/Buenos_Aires'),($3,'Estudiante',null,false,'UTC')", ids);
    await db.exec('alter table friend_profiles enable trigger friend_auto_username');
    await db.query('insert into friend_links(sender,recipient,accepted) values($1,$2,true)', ids.slice(0, 2));
    await db.query('insert into friend_blocks(owner,blocked) values($1,$2)', [ids[1], ids[2]]);
    const before = (await db.query('select user_id,invite,share_streak,timezone,action_count from friend_profiles order by user_id')).rows;
    const links = (await db.query('select * from friend_links')).rows;
    const blocks = (await db.query('select * from friend_blocks')).rows;
    const streak = (await db.query("select pg_get_functiondef('public.friend_streak(uuid,text)'::regprocedure) as definition")).rows;
    await db.exec(migration);
    const profiles = (await db.query('select user_id,name,username from friend_profiles order by user_id')).rows;
    assert.match(profiles[0].username, pattern); assert.equal(profiles[0].name, profiles[0].username);
    assert.equal(profiles[1].username, 'chosen_name'); assert.equal(profiles[1].name, 'chosen_name');
    await db.exec(migration);
    assert.deepEqual((await db.query('select user_id,name,username from friend_profiles order by user_id')).rows, profiles, 'reruns never regenerate names');
    assert.deepEqual((await db.query('select user_id,invite,share_streak,timezone,action_count from friend_profiles order by user_id')).rows, before);
    assert.deepEqual((await db.query('select * from friend_links')).rows, links);
    assert.deepEqual((await db.query('select * from friend_blocks')).rows, blocks);
    assert.deepEqual((await db.query("select pg_get_functiondef('public.friend_streak(uuid,text)'::regprocedure) as definition")).rows, streak);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from friend_profiles'), /permission denied/);
    await assert.rejects(db.query('select assign_friend_username()'), /permission denied/);
    await db.exec('reset role;set role authenticated');
    await assert.rejects(db.query('select * from friend_profiles'), /permission denied/);
    await assert.rejects(db.query('select assign_friend_username()'), /permission denied/);
  } finally { await db.close(); }
});
