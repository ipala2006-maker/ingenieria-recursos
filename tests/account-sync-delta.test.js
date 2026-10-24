const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('delta RPC is RLS-bound to the caller, returns only changes, and rejects stale or invalid writes',async()=>{
  const db=new PGlite();
  try{
    await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
    await db.exec(fs.readFileSync(require.resolve('../supabase/schema.sql'),'utf8'));await db.exec(fs.readFileSync(require.resolve('../supabase/account-sync-delta.sql'),'utf8'));
    const alice='00000000-0000-4000-8000-000000000001',bob='00000000-0000-4000-8000-000000000002';await db.query('insert into auth.users values($1),($2)',[alice,bob]);
    await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[alice]);
    const sync=async(known={},patch=null,expected=null)=>(await db.query('select sync_account_state($1,$2,$3) as data',[known,patch,expected])).rows[0].data;
    assert.equal((await sync()).missing,true);
    const written=await sync({}, {values:{bandeja_agenda:[{title:'Private note'}]},changedAt:{bandeja_agenda:1}});assert.equal(written.written,true);assert.equal(written.state,undefined);
    const initial=await sync();assert.equal(initial.state.values.bandeja_agenda[0].title,'Private note');assert.deepEqual((await sync(initial.versions)).state.values,{});
    const updated=await sync(initial.versions,{values:{estudiemos_theme:'light'},changedAt:{estudiemos_theme:2}},initial.updated_at);assert.equal(updated.written,true);
    const stale=await sync(initial.versions,{values:{estudiemos_theme:'dark'},changedAt:{estudiemos_theme:3}},initial.updated_at);assert.equal(stale.conflict,true);assert.equal(stale.state.values.estudiemos_theme,'light');assert.equal(stale.state.values.bandeja_agenda,undefined);
    await assert.rejects(sync({}, {values:{credentials:'bad'},changedAt:{credentials:1}},updated.updated_at),/INVALID_DATA/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[bob]);assert.equal((await sync()).missing,true);await db.exec('reset role');await db.exec('set role anon');await assert.rejects(sync(),/permission denied/);
  }finally{await db.close();}
});
