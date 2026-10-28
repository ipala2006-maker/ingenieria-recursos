const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createRequire}=require('node:module'),{PGlite}=require('@electric-sql/pglite');
const rules=require('../shared/app-access');

test('pilot stays fully usable without payments, while Free keeps classes, creation, materials and calendar',()=>{
  const pilot=rules.resolve();assert.equal(pilot.fullAccess,true);assert.equal(pilot.billingEnabled,false);
  const free=rules.resolve({mode:'restricted'});assert.deepEqual(free.features,['classes','createClass','courseFiles','calendar']);
  for(const feature of rules.advanced){assert.equal(rules.allows(free,feature),false);assert.equal(rules.allows(pilot,feature),true);}
  for(const facts of [{paidPro:true},{ownsClass:true}])assert.equal(rules.resolve({mode:'restricted',...facts}).fullAccess,true);
  assert.equal(rules.resolve({mode:'restricted',paidPro:'true',ownsClass:'teacher'}).fullAccess,false);
  assert.equal(rules.allows(pilot,'ai'),false,'An entitlement does not publish unreleased services');
});

test('invited students enter course focus without limiting an owner or Pro subscriber',()=>{
  assert.equal(rules.courseEntry({invited:true}),false);assert.equal(rules.courseEntry({selected:true}),false);
  assert.equal(rules.courseEntry({mode:'restricted',invited:true}),true);assert.equal(rules.courseEntry({mode:'restricted',selected:true}),true);
  assert.equal(rules.courseEntry({mode:'restricted',invited:true,ownsClass:true}),false);assert.equal(rules.courseEntry({mode:'restricted',invited:true,paidPro:true}),false);
  assert.equal(rules.courseEntry({}),false);
});

test('server policy never trusts client plan claims and does not query entitlements during the free pilot',async()=>{
  const file=require.resolve('../api/_lib/app-access'),source=fs.readFileSync(file,'utf8'),local=createRequire(file),calls=[];
  let facts={paidPro:false,ownsClass:false},published=false;const env={};const sandbox={module:{exports:{}},process:{env},require(name){if(name==='../../shared/release')return {enabled:()=>published};return name==='./plan-access'?{userRpc:async(...args)=>{calls.push(args);return facts;}}:local(name);}};
  vm.runInNewContext(source,sandbox);const api=sandbox.module.exports;
  assert.equal((await api.accessForUser('Bearer alice')).reason,'pilot');assert.equal(calls.length,0);
  env.APP_ACCESS_MODE='restricted';assert.equal((await api.accessForUser('Bearer alice')).reason,'pilot');assert.equal(calls.length,0);
  published=true;assert.equal((await api.accessForUser('Bearer alice')).reason,'free');assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),['Bearer alice','get_app_access',{}]);
  facts={paidPro:false,ownsClass:true};assert.equal((await api.accessForUser('Bearer alice')).reason,'class-owner');
});

test('database entitlement is private, read-only, ignores trial/expired plans and rechecks actual class ownership',async()=>{
  const db=new PGlite(),id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
  try{
    await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table public.user_plans(user_id uuid,plan_id text,status text,current_period_end timestamptz);create table public.classrooms(id uuid,owner_id uuid);create index on public.classrooms(owner_id);");
    const sql=fs.readFileSync(path.join(__dirname,'../supabase/app-access.sql'),'utf8');await db.exec(sql);
    const read=()=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);return(await tx.query('select get_app_access() as data')).rows[0].data;});
    assert.deepEqual(await read(),{paidPro:false,ownsClass:false});
    await db.query('insert into user_plans values($1,$2,$3,now()+interval \'1 day\')',[id,'pro','test']);assert.equal((await read()).paidPro,false);
    await db.exec("update user_plans set status='active'");assert.equal((await read()).paidPro,true);
    await db.exec("update user_plans set current_period_end=now()-interval '1 second'");assert.equal((await read()).paidPro,false);
    await db.query('insert into classrooms values($1,$2)',[other,other]);assert.equal((await read()).ownsClass,false);
    await db.query('update classrooms set owner_id=$1',[id]);assert.equal((await read()).ownsClass,true);
    await db.query('update classrooms set owner_id=$1',[other]);assert.equal((await read()).ownsClass,false);
    await db.exec(sql);assert.equal((await db.query('select count(*)::int n from user_plans')).rows[0].n,1);
    await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role anon');return tx.query('select get_app_access()');}),/permission denied/);
    await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');return tx.query('select get_app_access()');}),/AUTH_REQUIRED/);
  }finally{await db.close();}
});

test('client access is single-flight, account-bound, cached and never restored from localStorage',async()=>{
  let user={id:'alice'},mode='restricted';const requests=[],window=new EventTarget();
  window.EstudiemosAccessRules=rules;window.EstudiemosAccount={getUser:()=>user,getSession:()=>({access_token:user.id}),getAccessMode:()=>mode,whenReady:()=>new Promise(()=>{})};
  const document={currentScript:{src:'https://app.test/scripts/app-access.js'},body:{dataset:{}},head:{append(){}},createElement:()=>({}),querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){}};
  const sandbox={window,document,URL,Date,CustomEvent,AbortController,setTimeout,clearTimeout,requestAnimationFrame:()=>1,cancelAnimationFrame(){},MutationObserver:class{observe(){}},fetch:async(url,options)=>new Promise(resolve=>requests.push({url:String(url),options,resolve}))};
  vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/app-access.js'),'utf8'),sandbox);const api=window.EstudiemosAccess;
  const alice=api.refresh();api.refresh();assert.equal(requests.length,1);assert.equal(requests[0].options.headers.Authorization,'Bearer alice');
  user={id:'bob'};const bob=api.refresh();assert.equal(requests.length,2);assert.equal(requests[0].options.signal.aborted,true);
  requests[1].resolve({ok:true,json:async()=>({mode:'restricted',reason:'free'})});await bob;assert.equal(api.snapshot().fullAccess,false);
  requests[0].resolve({ok:true,json:async()=>({mode:'restricted',reason:'subscription'})});await alice;assert.equal(api.snapshot().fullAccess,false,'Late Alice response cannot upgrade Bob');
  await api.refresh();assert.equal(requests.length,2,'Focus or repeated auth events reuse the recent read');
  user=null;await api.refresh();assert.equal(api.snapshot().reason,'free');mode='pilot';await api.refresh();assert.equal(api.snapshot().reason,'pilot');assert.equal(requests.length,2);
});

test('access endpoint authenticates before choosing the per-user university rate bucket',async()=>{
  const file=require.resolve('../api/plan-status'),source=fs.readFileSync(file,'utf8'),local=createRequire(file),calls=[];
  const sandbox={module:{exports:{}},console,require(name){
    if(name==='./_lib/supabase-admin')return {authenticateBearer:async token=>{calls.push(['auth',token]);return token==='Bearer alice'?{id:'alice'}:null;}};
    if(name==='./_lib/app-access')return {accessForUser:async token=>{calls.push(['access',token]);return rules.resolve();}};
    if(name==='./_lib/request-security')return {setSecurityHeaders(){},isSameOriginRequest:()=>true,rejectOversizedBody:()=>false,requireJsonRequest:()=>true,enforceRateLimit:async(req,res,options)=>{calls.push(['rate',options]);return true;}};
    return local(name);
  }};vm.runInNewContext(source,sandbox);
  const invoke=async authorization=>{let status;const res={setHeader(){},status(value){status=value;return this;},json(){return this;}};await sandbox.module.exports({method:'GET',query:{access:'1',user_id:'victim'},headers:{authorization}},res);return status;};
  assert.equal(await invoke('Bearer alice'),200);
  const rates=calls.filter(([kind])=>kind==='rate').map(([,value])=>value);assert.equal(rates.length,2);assert.equal(rates[0].principal,undefined);assert.equal(rates[1].principal,'alice');assert.equal(rates[1].ipLimit,1000);assert.equal(rates[1].limit,120);assert.equal(rates.some(value=>value.route==='plan-status'),false);
  calls.length=0;assert.equal(await invoke('Bearer invalid'),401);assert.equal(calls.some(([kind])=>kind==='access'),false);assert.equal(calls.filter(([kind])=>kind==='rate').length,1);
});
