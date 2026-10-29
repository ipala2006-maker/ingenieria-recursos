const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {mobileDatabase,user}=require('./helpers/mobile-push-db.cjs');
const alarm=(id='due',overrides={})=>({id,title:'Repasar',alarm:{date:'2026-10-26',time:'12:00',repeat:'daily',...overrides}});
test('additive migration preserves existing notes and queued jobs; old serial servers still claim only five',async()=>{
  const h=await mobileDatabase({indexed:false,cron:false});const {db}=h;
  try{
    await h.save(Array.from({length:7},(_,i)=>alarm(String(i))));await h.register();
    await db.exec('insert into mobile_push_jobs(subscription_id,task_id,occurrence) select s.id,t.task_id,t.occurrence from mobile_push_subscriptions s cross join lateral mobile_due_tasks(s.user_id,s.timezone) t');
    const before=(await db.query('select state from user_states')).rows[0].state;
    const migration=fs.readFileSync(require.resolve('../supabase/mobile-notifications-indexed.sql'),'utf8').replace(/\bnow\(\)/g,'public.test_clock()');
    await db.exec(migration);await db.exec(migration);
    assert.deepEqual((await db.query('select state from user_states')).rows[0].state,before);
    assert.equal((await db.query('select count(*)::int n from mobile_push_jobs')).rows[0].n,7);
    assert.equal((await db.query('select * from claim_mobile_push_jobs()')).rows.length,5);
    assert.equal((await db.query('select * from claim_mobile_push_batch()')).rows.length,2);
  }finally{await db.close();}
});
test('indexed projection works after late registration, ignores ordinary notes, and never scans an agenda on tick',async()=>{
  const h=await mobileDatabase();const {db}=h;
  try{
    const notes=Array.from({length:700},(_,id)=>({id:String(id),title:'Nota sin alarma'}));notes.push(alarm());
    await h.save(notes);assert.equal((await db.query('select count(*)::int n from mobile_push_alarm_tasks')).rows[0].n,0);
    await h.register();assert.equal((await db.query('select count(*)::int n from mobile_push_alarm_tasks')).rows[0].n,1);
    // Neither a study-minute update nor cron may call the agenda parser.
    await db.exec("create or replace function public.mobile_push_project_agenda(p_user uuid,p_agenda jsonb) returns void language plpgsql as $$begin raise exception 'UNEXPECTED_AGENDA_SCAN';end$$;");
    await h.save(notes,{estudiemos_pomodoro_streak:{days:{'2026-10-26':25}}});
    await db.exec('select tick_mobile_push()');
    assert.equal((await db.query('select * from claim_mobile_push_jobs()')).rows.length,1);
    assert.equal((await db.query('select count(*)::int n from net.requests')).rows[0].n,1);
  }finally{await db.close();}
});
test('rename keeps the queue, reprogram cancels it, completion and deletion immediately cancel pending deliveries',async()=>{
  const h=await mobileDatabase();const {db}=h;
  try{
    await h.register();let note=alarm();await h.save([note]);await db.exec('select enqueue_mobile_push_jobs()');
    const id=(await db.query('select id from mobile_push_jobs')).rows[0].id;
    note.title='Nuevo titulo';await h.save([note]);
    const jobs=(await db.query('select * from claim_mobile_push_jobs()')).rows;
    assert.equal(jobs[0].id,id);assert.equal(jobs[0].title,'Nuevo titulo');
    note.alarm.time='13:00';await h.save([note]);
    assert.equal((await db.query('select * from mobile_push_jobs')).rows.length,0);
    await h.clock('2026-10-26T12:59:35Z');await db.exec('select enqueue_mobile_push_jobs()');
    assert.equal((await db.query('select * from mobile_push_jobs')).rows.length,1);
    note.done=true;await h.save([note]);assert.equal((await db.query('select * from mobile_push_jobs')).rows.length,0);
    note.done=false;await h.save([note]);await db.exec('select enqueue_mobile_push_jobs()');
    await h.save([]);assert.equal((await db.query('select * from claim_mobile_push_jobs()')).rows.length,0);
  }finally{await db.close();}
});
test('recurrences preserve wall time through DST, skip missing month days and reject nonexistent dates',async()=>{
  const h=await mobileDatabase();const {db}=h;
  const next=async(date,repeat,zone,after)=>new Date((await db.query("select mobile_push_next_occurrence($1,'09:00',$2,$3,$4) at",[date,repeat,zone,after])).rows[0].at).toISOString();
  try{
    assert.equal(await next('2026-03-07','daily','America/New_York','2026-03-08T00:00:00Z'),'2026-03-08T13:00:00.000Z');
    assert.equal(await next('2026-01-31','monthly','UTC','2026-02-01T00:00:00Z'),'2026-03-31T09:00:00.000Z');
    assert.equal(await next('2026-10-23','weekdays','UTC','2026-10-24T00:00:00Z'),'2026-10-26T09:00:00.000Z');
    await h.register();await h.save([alarm('invalid',{date:'2026-02-30'}),alarm('valid')]);
    assert.equal((await db.query('select count(*)::int n from mobile_push_alarm_tasks')).rows[0].n,1);
  }finally{await db.close();}
});
test('devices in different zones get independent schedules and a zone change rebuilds just that device',async()=>{
  const h=await mobileDatabase();const {db}=h;
  try{
    await h.register('UTC','first');await h.register('America/New_York','second');await h.save([alarm()]);
    assert.equal((await db.query('select enqueue_mobile_push_jobs() n')).rows[0].n,1);
    await h.register('UTC','second');
    assert.equal((await db.query('select enqueue_mobile_push_jobs() n')).rows[0].n,1);
    const jobs=(await db.query('select * from claim_mobile_push_jobs()')).rows;
    assert.equal(jobs.length,2);
    assert.equal((await db.query('select * from claim_mobile_push_jobs()')).rows.length,0);
    await db.query('select finish_mobile_push_jobs($1)',[jobs.map(j=>({id:j.id,ok:true,expired:false}))]);
    await h.clock('2026-10-27T11:59:35Z');await db.exec('select enqueue_mobile_push_jobs()');
    assert.equal((await db.query('select * from claim_mobile_push_jobs()')).rows.length,2);
    await db.query('delete from auth.users where id=$1',[user]);
    for(const table of ['mobile_push_alarm_tasks','mobile_push_schedule','mobile_push_jobs'])assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0);
  }finally{await db.close();}
});
test('all indexed schedule data and helper functions stay inaccessible to public clients',async()=>{
  const h=await mobileDatabase();const {db}=h;
  try{
    for(const role of ['anon','authenticated','service_role']){
      await db.exec('set role '+role);
      for(const table of ['mobile_push_alarm_tasks','mobile_push_schedule'])await assert.rejects(db.query('select * from '+table),/permission denied/);
      await assert.rejects(db.query('select mobile_push_project_agenda($1,$2)',[user,[]]),/permission denied/);
      if(role!=='service_role')for(const sql of ['select enqueue_mobile_push_jobs()','select * from claim_mobile_push_batch()','select * from claim_mobile_push_jobs()',"select finish_mobile_push_jobs('[]')"]){await assert.rejects(db.query(sql),/permission denied/);}
      await db.exec('reset role');
    }
  }finally{await db.close();}
});
test('a bounded SQL claim leaves every unclaimed notification available without consuming its attempts',async()=>{
  const h=await mobileDatabase();const {db}=h;
  try{
    await h.save(Array.from({length:30},(_,i)=>alarm(String(i))));await h.register();await db.exec('select enqueue_mobile_push_jobs()');
    const first=(await db.query('select * from claim_mobile_push_batch($1)',[4])).rows;
    assert.equal(first.length,4);
    assert.equal((await db.query('select count(*)::int n from mobile_push_jobs where attempts=0')).rows[0].n,26);
    await db.query('select finish_mobile_push_jobs($1)',[first.map(job=>({id:job.id,ok:true,expired:false}))]);
    const rest=(await db.query('select * from claim_mobile_push_batch($1)',[20])).rows;
    assert.equal(rest.length,20);assert.ok(rest.every(job=>!first.some(previous=>previous.id===job.id)));
    assert.equal((await db.query('select count(*)::int n from mobile_push_jobs where attempts=0')).rows[0].n,6);
    assert.equal((await db.query('select count(*)::int n from mobile_push_jobs where sent_at is not null')).rows[0].n,4);
  }finally{await db.close();}
});

test('dispatcher bounds parallel sends and acknowledges each small mixed batch without real notifications',async()=>{
  const calls=[],jobs=Array.from({length:27},(_,i)=>({id:i+1,owner:user,tag:'inbox-'+(i+1),title:'Test',subscription:{endpoint:'https://web.push.apple.com/Q/'+i,keys:{p256dh:'B'.repeat(87),auth:'a'.repeat(22)}}}));
  const pending=jobs.slice();
  let active=0,peak=0,legacy=false;
  const source=fs.readFileSync(require.resolve('../api/_lib/mobile-push'),'utf8');
  const waits=[];
  const context={module:{exports:{}},URL,Intl,Buffer,setTimeout:(fn,ms)=>{waits.push(ms);fn();},process:{env:{WEB_PUSH_PUBLIC_KEY:'test',WEB_PUSH_PRIVATE_KEY:'test',MOBILE_PUSH_CRON_SECRET:'x'.repeat(40)}},require:name=>{
    if(name==='node:crypto')return require(name);
    if(name==='./push-dispatch')return require('../api/_lib/push-dispatch');
    if(name==='./push-scope') {const scopes=require('../api/_lib/push-scope');return {...scopes,scopeForEnvironment:()=>scopes.scopeForEnvironment(context.process.env)};}
    if(name==='./push-credentials'){
      const scoped={...context,module:{exports:{}}};
      vm.runInNewContext(fs.readFileSync(require.resolve('../api/_lib/push-credentials'),'utf8'),scoped);
      return scoped.module.exports;
    }
    if(name==='./supabase-admin')return {adminRequest:async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,body});
      assert.equal(options.redirect,'error');
      if(legacy&&url.endsWith('claim_mobile_push_batch'))throw {status:404,data:{code:'PGRST202'}};
      return url.endsWith('claim_mobile_push_batch')?pending.splice(0,body.p_limit):url.endsWith('claim_mobile_push_jobs')?jobs.slice(0,5):null;}};
    if(name==='./request-security')return {};
    if(name==='web-push')return {sendNotification:async(sub)=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setImmediate(resolve));active--;if(sub.endpoint.endsWith('/3'))throw {statusCode:410};}};
    throw Error(name);
  }};
  vm.runInNewContext(source,context);
  const res={status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await context.module.exports({method:'POST',query:{mobilePush:'dispatch'},headers:{authorization:'Bearer '+'x'.repeat(40)}},res);
  assert.equal(res.code,200);assert.equal(res.body.sent,26);assert.equal(res.body.failed,1);assert.equal(peak,10);
  assert.equal(calls.length,4);assert.ok(calls[1].url.endsWith('finish_mobile_push_jobs'));assert.ok(calls[3].url.endsWith('finish_mobile_push_jobs'));
  assert.equal(calls[0].body.p_limit,20);assert.equal(calls[1].body.p_results.length,20);assert.equal(calls[3].body.p_results.length,7);
  assert.ok(calls[1].body.p_results.some(r=>r.expired&&r.id===4));
  legacy=true;calls.length=0;
  await context.module.exports({method:'POST',query:{mobilePush:'dispatch'},headers:{authorization:'Bearer '+'x'.repeat(40)}},res);
  assert.equal(res.code,200);assert.equal(res.body.sent,4);assert.equal(res.body.failed,1);
  assert.equal(calls.length,7);assert.ok(calls.slice(2).every(call=>call.url.endsWith('finish_mobile_push_job')));
  assert.equal(waits.length,2);assert.ok(waits.every(ms=>ms>=0&&ms<=750));
});
