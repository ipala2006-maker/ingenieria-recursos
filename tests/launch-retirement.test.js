const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createRequire}=require('node:module'),{PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync(require.resolve('../supabase/launch-legacy-retirement.sql'),'utf8');
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';

test('retirement preserves historical files, blocks upload/update and test plans, and keeps one-time local setup private',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
      create schema storage;grant usage on schema storage to anon,authenticated;
      create table storage.objects(id text primary key,bucket_id text,name text,owner uuid,metadata jsonb);
      alter table storage.objects enable row level security;
      grant select,insert,update,delete on storage.objects to authenticated;
      create policy "Students read their private files" on storage.objects for select to authenticated using(owner=auth.uid());
      create policy "Students delete their private files" on storage.objects for delete to authenticated using(owner=auth.uid());
      create policy "Students upload their private files" on storage.objects for insert to authenticated with check(owner=auth.uid());
      create policy "Students update their private files" on storage.objects for update to authenticated using(owner=auth.uid());
      create table public.workspace_items(id text,user_id uuid);grant select,insert,update,delete,truncate,trigger,references on public.workspace_items to authenticated;
      create function public.set_test_plan(target_plan text) returns jsonb language sql as $$select '{}'::jsonb$$;grant execute on function public.set_test_plan(text) to authenticated;
      create function public.workspace_storage_upload_allowed(target_name text,target_metadata jsonb) returns boolean language sql as $$select true$$;
    `);
    await db.exec(fs.readFileSync(require.resolve('../supabase/schema.sql'),'utf8'));
    await db.exec(fs.readFileSync(require.resolve('../supabase/study-goals.sql'),'utf8'));
    await db.query('insert into auth.users values($1),($2)',[owner,other]);
    const day=new Date().toISOString().slice(0,10);
    const alarm={date:day,time:'18:30',repeat:'weekly',windows:false};
    const state={values:{bandeja_agenda:JSON.stringify([{id:'a',title:'Parcial',alarm,note:'private note'},{id:'done',done:true,alarm}]),
      estudiemos_pomodoro_streak:JSON.stringify({days:{[day]:35,'2020-01-01':400},goal:{minutes:30,updatedAt:1}}),privateSecret:'NEVER'}};
    await db.query('insert into user_states(user_id,state) values($1,$2)',[owner,state]);
    await db.query("insert into storage.objects values('old','workspace-files','old.pdf',$1,'{\"size\":123}'),('foreign','workspace-files','foreign.pdf',$2,'{\"size\":456}')",[owner,other]);
    const before=(await db.query('select * from storage.objects order by id')).rows;
    await db.exec(sql);await db.exec(sql);
    assert.deepEqual((await db.query('select * from storage.objects order by id')).rows,before);
    const result=(await db.query('select get_windows_local_setup_snapshot($1,$2) as data',[owner,day])).rows[0].data;
    assert.equal(result.items.length,1);assert.equal(result.items[0].title,'Parcial');assert.equal(result.items[0].alarm.windows,true);
    assert.deepEqual(result.study,{date:day,minutes:35,goalMinutes:30,configured:true});
    assert.doesNotMatch(JSON.stringify(result),/private note|privateSecret|NEVER|2020-01-01/);
    assert.equal((await db.query('select get_windows_local_setup_snapshot($1,$2) as data',[other,day])).rows[0].data.items.length,0);
    assert.deepEqual((await db.query('select * from get_windows_alarm_snapshot($1)',[owner])).rows,[{updated_at:null,alarm_items:[]}]);
    assert.equal((await db.query('select get_windows_study_goal($1,$2) as data',[owner,day])).rows[0].data.deprecated,true);
    await assert.rejects(db.query('select set_test_plan($1)',['pro']),/PLAN_ASSIGNMENT_DISABLED/);
    await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
    assert.equal((await db.query('select * from storage.objects')).rows.length,1);
    await assert.rejects(db.query("insert into storage.objects values('new','workspace-files','new.pdf',$1,'{}')",[owner]),/row-level security/);
    assert.equal((await db.query("update storage.objects set name='changed.pdf' where id='old' returning id")).rows.length,0);
    await assert.rejects(db.query("insert into workspace_items values('new',$1)",[owner]),/permission denied/);
    await assert.rejects(db.query('truncate workspace_items'),/permission denied/);
    await assert.rejects(db.query('select set_test_plan($1)',['pro']),/permission denied/);
    await assert.rejects(db.query('select get_windows_local_setup_snapshot($1,$2)',[owner,day]),/permission denied/);
    await db.exec('reset role');assert.deepEqual((await db.query('select * from storage.objects order by id')).rows,before);
    for(const name of ['get_windows_alarm_snapshot','get_windows_study_goal']){
      const definition=(await db.query('select pg_get_functiondef(oid) as code from pg_proc where proname=$1',[name])).rows[0].code;
      assert.doesNotMatch(definition,/user_states|jsonb_array_elements|security definer/i);
    }
  }finally{await db.close();}
});

test('plan assignment and retired feeds return before quota, Auth or database calls',async()=>{
  for(const [file,request,code]of[
    ['api/plan-status.js',{method:'POST',headers:{},body:{planId:'pro'}},'PLAN_ASSIGNMENT_DISABLED'],
    ['api/widget-link.js',{method:'GET',headers:{},query:{alarmFeed:'1'}},'WINDOWS_LOCAL_ALARMS_REQUIRED']
  ]){
    const filename=path.resolve(__dirname,'..',file),local=createRequire(filename),unexpected=()=>assert.fail('Retired operations must not use database, quotas or Auth');
    const sandbox={module:{exports:{}},require(name){
      if(name.endsWith('request-security'))return {setSecurityHeaders(){},isSameOriginRequest:()=>true,requireJsonRequest:()=>true,rejectOversizedBody:()=>false,enforceRateLimit:unexpected};
      if(name.endsWith('supabase-admin'))return {isConfigured:unexpected,authenticateBearer:unexpected,adminRequest:unexpected};
      if(name.endsWith('plan-access'))return {getAuthenticatedPlan:unexpected};
      return local(name);
    }};vm.runInNewContext(fs.readFileSync(filename,'utf8'),sandbox);
    const result={},response={setHeader(){},status(status){result.status=status;return this;},json(body){result.body=body;}};
    await sandbox.module.exports(request,response);assert.equal(result.status,410);assert.equal(result.body.code,code);
  }
  const config=require('../vercel.json'),rule=config.redirects.find(r=>r.has?.some(h=>h.key==='alarmFeed'));
  assert.equal(rule.source,'/api/widget-link');assert.equal(rule.destination,'/.well-known/windows-alarms-retired.json');
  assert.equal(rule.permanent,false);assert.ok(rule.missing.some(h=>h.key==='alarmSetup'));
  assert.doesNotMatch(fs.readFileSync(require.resolve('../scripts/workspace.js'),'utf8'),/data-workspace-plan-select|selectPlanPreview/);
});
