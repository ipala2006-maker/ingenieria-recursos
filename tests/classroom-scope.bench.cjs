// Offline plan comparison on identical data, not production capacity or billing.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');

const baseline = '6fd7e51fd6e208fc5a34781e745db1780c14014d';
const oldSchema = execFileSync('git', ['show', baseline + ':supabase/classrooms.sql'], { encoding:'utf8' });
const migration = fs.readFileSync(require.resolve('../supabase/classroom-bounded-state.sql'),'utf8');
const actor = '10000000-0000-4000-8000-000000000001';
const another = '10000000-0000-4000-8000-000000000002';
const total = 12000;

function query(source) {
  const fn = source.match(/create or replace function public\.classroom_state_compact\([\s\S]+?end \$\$;/i)?.[0];
  const aggregate = fn?.match(/select md5\('calendar-visibility-v1:'[\s\S]+?;/)?.[0];
  if (!aggregate) throw new Error('No aggregate found');
  return aggregate.replace(/into rev,versions,changed,hidden(?:,accessible)?/,'')
    .replace(/\bp_user\b/g, () => '$1::uuid')
    .replace(/\bp_versions\b/g, () => '$2::jsonb');
}

function classroomRows(plan) {
  const here = plan['Relation Name'] === 'classrooms' ? plan['Actual Rows'] * plan['Actual Loops'] : 0;
  return here + (plan.Plans || []).reduce((sum, child) => sum + classroomRows(child), 0);
}

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create table auth.users(id uuid primary key);create table public.friend_profiles(user_id uuid primary key,username text);`);
    await db.exec(oldSchema);
    await db.query('insert into auth.users values($1),($2)', [actor,another]);
    await db.query(`insert into public.classrooms(id,owner_id,title,teacher_name,timezone,invite_code)
      select md5('course-'||n)::uuid,case when n<=2 then $1::uuid else $2::uuid end,'Course '||n,'Teacher','UTC',
      translate(lpad(n::text,10,'0'),'0123456789','ABCDEFGHJK') from generate_series(1,$3::int) n`,[actor,another,total]);
    await db.query(`insert into public.classroom_members(class_id,user_id)
      select md5('course-'||n)::uuid,$1 from generate_series(2,5) n`,[actor]);
    await db.exec('analyze public.classrooms; analyze public.classroom_members; analyze public.classroom_calendar_hidden;');
    const read = async () => (await db.query("select public.classroom_state_compact($1,'','{}') as data",[actor])).rows[0].data;
    const plan = async source => (await db.query('explain (analyze,format json) '+query(source),[actor,{}])).rows[0]['QUERY PLAN'][0];
    const old = await read(), before = await plan(oldSchema);
    await db.exec(migration);
    assert.deepEqual(await read(),old);
    const after = await plan(migration);
    const examinedBefore = classroomRows(before.Plan), examinedAfter = classroomRows(after.Plan);
    assert.equal(old.classes.length,5);
    assert.ok(examinedAfter < examinedBefore/10, 'The indexed lookup must bound the work in this fixture');
    console.log(JSON.stringify({ total, accessible:old.classes.length, examinedBefore, examinedAfter,
      equivalentResponse:true, engine:'local PGlite', notProductionBilling:true }));
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode=1; });
