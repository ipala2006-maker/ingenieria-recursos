const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

const migration = fs.readFileSync(require.resolve('../supabase/classroom-bounded-state.sql'), 'utf8');
const schema = fs.readFileSync(require.resolve('../supabase/classrooms.sql'), 'utf8');
const visibility = fs.readFileSync(require.resolve('../supabase/classroom-calendar-visibility.sql'), 'utf8');
const actor = '10000000-0000-4000-8000-000000000001';
const outsider = '10000000-0000-4000-8000-000000000002';
const ids = [1,2,3,4].map(n => `20000000-0000-4000-8000-00000000000${n}`);

test('bounded migration preserves revisions, archives, member grants, visibility and private RPC grants', async () => {
  const def = source => source.match(/create or replace function public\.classroom_state_compact\([\s\S]+?end \$\$;/i)?.[0];
  assert.ok(def(migration));
  assert.equal(def(migration), def(schema));
  assert.equal(def(migration), def(visibility));
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid stable language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.friend_profiles(user_id uuid primary key,username text);
    `);
    await db.exec(schema);
    await db.query('insert into auth.users values($1),($2)', [actor, outsider]);
    for (const [i,id] of ids.entries()) {
      await db.query('insert into public.classrooms(id, owner_id,title,teacher_name,timezone,invite_code,archived,owner_role) values($1,$2,$3,$3,\'UTC\',$4,$5,\'collaborator\')',
        [id, i===0?actor:outsider, `Course ${i}`, 'ABCDEFGHJ'+'2345'[i], i===2]);
    }
    await db.query("insert into public.classroom_members(class_id,user_id,role,permissions) values($1,$3,'student','{}'),($2,$3,'moderator','{\"datesAdd\":true}'),($4,$3,'student','{}')",[ids[0],ids[1],actor,ids[2]]);
    await db.query('insert into public.classroom_calendar_hidden values($1,$2)', [actor,ids[1]]);
    for (const id of ids) await db.query("insert into public.classroom_events(class_id,data) values($1,'{\"title\":\"Fixture\"}')",[id]);
    const state = async (rev='', known={}) => (await db.query('select public.classroom_state_compact($1,$2,$3) as data',[actor,rev,known])).rows[0].data;
    const before = await state();
    await db.exec(migration);
    const after = await state();
    assert.deepEqual(after,before);
    assert.deepEqual(after.classes.map(c=>[c.id,c.role]),[[ids[0],'collaborator'],[ids[1],'moderator'],[ids[2],'student']]);
    assert.deepEqual(after.calendarHidden,[ids[1]]);
    assert.equal(after.classes[1].permissions.datesAdd,true);
    assert.deepEqual(after.calendarPatch.events.map(e=>e.classId),ids.slice(0,2));
    assert.deepEqual(await state(after.revision,after.calendarPatch.versions),{revision:after.revision,unchanged:true});
    const { rows }=await db.query("select role,has_function_privilege(role,'public.classroom_state_compact(uuid,text,jsonb)','EXECUTE') as allowed from unnest(array['anon','authenticated','service_role']) t(role)");
    assert.ok(rows.every(row=>!row.allowed));
  } finally {
    await db.close();
  }
});
