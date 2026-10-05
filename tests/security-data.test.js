const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");

test("actual state policies isolate two students and reject changing ownership", async () => {
  const db = new PGlite();
  const alice = "00000000-0000-4000-8000-000000000001";
  const bob = "00000000-0000-4000-8000-000000000002";
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema auth to authenticated;`);
    await db.exec(fs.readFileSync(path.join(__dirname, "../supabase/schema.sql"), "utf8"));
    await db.query("insert into auth.users values($1),($2)", [alice, bob]);
    await db.query("insert into user_states(user_id,state) values($1,$2),($3,$4)", [alice, { task: "Alice private" }, bob, { task: "Bob private" }]);
    await db.exec("set role anon");
    await assert.rejects(db.query("select * from user_states"), /permission denied/);
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [alice]);
    assert.deepEqual((await db.query("select user_id from user_states")).rows, [{ user_id: alice }]);
    assert.equal((await db.query("update user_states set state='{}' where user_id=$1 returning user_id", [bob])).rows.length, 0);
    assert.equal((await db.query("delete from user_states where user_id=$1 returning user_id", [bob])).rows.length, 0);
    await assert.rejects(db.query("update user_states set user_id=$1 where user_id=$2", [bob, alice]), /row-level security/);
    await assert.rejects(db.query("insert into user_states(user_id,state) values($1,'{}')", [bob]), /row-level security/);
    await db.query("update user_states set state=$1 where user_id=$2", [{ task: "Updated by Alice" }, alice]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [bob]);
    assert.deepEqual((await db.query("select user_id,state from user_states")).rows, [{ user_id: bob, state: { task: "Bob private" } }]);
    assert.equal((await db.query("select * from user_states where user_id=$1", [alice])).rows.length, 0);
  } finally {
    await db.close();
  }
});
