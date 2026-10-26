const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('native widget RPC sends only changed widget data, never another account or unrelated profile fields',async()=>{
  const db=new PGlite();
  try{
    await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
    await db.exec(fs.readFileSync(require.resolve('../supabase/schema.sql'),'utf8'));
    await db.exec(fs.readFileSync(require.resolve('../supabase/account-sync-delta.sql'),'utf8'));
    await db.exec(fs.readFileSync(require.resolve('../supabase/android-widget-sync.sql'),'utf8'));
    const alice='00000000-0000-4000-8000-000000000001',bob='00000000-0000-4000-8000-000000000002';
    await db.query('insert into auth.users values($1),($2)',[alice,bob]);
    const state={values:{bandeja_agenda:Array.from({length:300},(_,i)=>({id:String(i),title:'Private note '+i})),estudiemos_pomodoro_streak:{days:{'2026-10-26':10},goal:{minutes:25,updatedAt:1}},estudiemos_android_devices:[{token:'never-return-this'}],bandeja_favoritos:['private-favorite']}};
    await db.query('insert into user_states(user_id,state) values($1,$2)',[alice,state]);
    await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[alice]);
    const read=async known=>(await db.query('select get_android_widget_state($1) data',[known||{}])).rows[0].data;
    const initial=await read();assert.equal(initial.owner,alice);assert.deepEqual(Object.keys(initial.values).sort(),['bandeja_agenda','estudiemos_pomodoro_streak']);
    const idle=await read(initial.versions);assert.deepEqual(idle.values,{});
    state.values.estudiemos_pomodoro_streak.days['2026-10-26']=11;
    await db.query('update user_states set state=$1 where user_id=$2',[state,alice]);
    const minute=await read(initial.versions);assert.deepEqual(Object.keys(minute.values),['estudiemos_pomodoro_streak']);
    assert.equal(minute.values.estudiemos_pomodoro_streak.days['2026-10-26'],11);
    const revision=(await db.query('select updated_at from user_states where user_id=$1',[alice])).rows[0].updated_at;
    state.values.bandeja_agenda[2].title='Updated note';
    await db.query('select sync_account_state($1,$2,$3)',[{}, {values:{bandeja_agenda:state.values.bandeja_agenda},changedAt:{bandeja_agenda:2}},revision]);
    const edit=await read(minute.versions);
    assert.equal(edit.values.bandeja_agenda,undefined);
    assert.deepEqual(edit.lists.bandeja_agenda.put,[{id:'2',title:'Updated note'}]);
    assert.equal(edit.lists.bandeja_agenda.base,minute.versions.bandeja_agenda);
    assert.equal(edit.lists.bandeja_agenda.target,edit.versions.bandeja_agenda);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[bob]);
    const foreign=await read({user_id:alice});assert.equal(foreign.owner,bob);assert.deepEqual(foreign.values,{});
    await assert.rejects(read([]),/INVALID_DATA/);
    await assert.rejects(read({x:'x'.repeat(4096)}),/INVALID_DATA/);
    await db.exec('reset role');
    for(const role of ['anon','service_role']){await db.exec('set role '+role);await assert.rejects(read(),/permission denied/);await db.exec('reset role');}
  }finally{await db.close();}
});
test('Android refreshes contain no full-state read, preserve owner checks, and clear versions on account changes',()=>{
  const java=fs.readFileSync(require.resolve('../android-app/app/src/main/java/com/estudiemos/app/WidgetSyncManager.java'),'utf8');
  assert.doesNotMatch(java,/user_states\?select=state/);
  assert.match(java,/rpc\/get_android_widget_state/);
  assert.match(java,/"streak:state->values->estudiemos_pomodoro_streak"/);
  assert.match(java,/if \(!session.userId.equals\(currentUserId\(context\)\)\) return false/);
  assert.match(java,/remove\(KEY_WIDGET_VERSIONS\)/);
  assert.match(java,/PERIOD_MS = 15 \* 60 \* 1000L/);
});
