// Offline synthetic queue/JSON accounting, not a provider load or billing test.
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {mobileDatabase}=require('./helpers/mobile-push-db.cjs');
const {simulate}=require('./sync-capacity.bench.cjs');
async function queueBurst(size=1500){
  const h=await mobileDatabase();const {db}=h;
  try{
    await db.query("insert into auth.users select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,$1) i on conflict do nothing",[size]);
    await db.exec("insert into user_states select id,'{\"values\":{\"bandeja_agenda\":[{\"id\":\"due\",\"title\":\"Repasar\",\"alarm\":{\"date\":\"2026-10-26\",\"time\":\"12:00\",\"repeat\":\"daily\"}}]}}',now() from auth.users");
    await db.exec("insert into mobile_push_subscriptions(user_id,endpoint,subscription,timezone) select id,'https://web.push.apple.com/Q/'||id,jsonb_build_object('endpoint','https://web.push.apple.com/Q/'||id,'keys',jsonb_build_object('p256dh',repeat('B',87),'auth',repeat('a',22))),'UTC' from auth.users");
    // Fail the benchmark if the minute tick ever reparses an account agenda.
    await db.exec("create or replace function mobile_push_project_agenda(p_user uuid,p_agenda jsonb) returns void language plpgsql as $$begin raise exception 'AGENDA_SCAN_IN_CRON';end$$;");
    const ticks=[];
    for(let minute=0;minute<10;minute++){
      await h.clock(new Date(Date.parse('2026-10-26T11:59:35Z')+minute*60000).toISOString());
      const before=performance.now();await db.exec('select tick_mobile_push()');const ms=performance.now()-before;
      let sent=0;
      for(let worker=0;worker<4;worker++){
        const jobs=(await db.query('select * from claim_mobile_push_batch()')).rows;
        assert.ok(jobs.length<=100);sent+=jobs.length;
        if(jobs.length)await db.query('select finish_mobile_push_jobs($1)',[jobs.map(j=>({id:j.id,ok:true,expired:false}))]);
      }
      const row=(await db.query('select count(*) filter(where sent_at is not null)::int sent,count(*)::int queued from mobile_push_jobs')).rows[0];
      ticks.push({minute,tickMilliseconds:+ms.toFixed(2),delivered:sent,totalDelivered:row.sent,queued:row.queued});
      if(row.sent===size)break;
    }
    assert.equal(ticks.at(-1).totalDelivered,size);
    await db.exec('analyze mobile_push_schedule');
    const plan=(await db.query("explain select * from mobile_push_schedule where due_at<=public.test_clock() order by due_at limit 1000")).rows.map(r=>r['QUERY PLAN']).join('\n');
    assert.match(plan,/mobile_push_schedule_due/);
    const beforeRequests=(await db.query('select count(*)::int n from net.requests')).rows[0].n;
    await h.clock('2026-10-26T13:00:00Z');await db.exec('select tick_mobile_push()');
    assert.equal((await db.query('select count(*)::int n from net.requests')).rows[0].n,beforeRequests);
    return {size,ticks,idlePlan:plan,idleHttpInvocations:0,agendaScansPerTick:0,oldMaximumClaimsPerMinute:5,newMaximumClaimsPerMinute:400};
  }finally{await db.close();}
}
async function report(){
  const scenarios=[];
  for(const spec of [
    {name:'complete-no-android',notes:300,minutes:60,edits:8,devices:2,activeDays:20,androidDevices:0},
    {name:'complete-linked-android',notes:300,minutes:60,edits:8,devices:2,activeDays:20,androidDevices:1,measureNative:true},
    {name:'complete-pc-and-native-android',notes:300,minutes:60,edits:8,devices:2,activeDays:20,androidDevices:1,nativeAndroidClients:1,measureNative:true},
    {name:'complete-native-android-only',notes:300,minutes:60,edits:8,devices:1,activeDays:20,androidDevices:1,nativeAndroidClients:1,measureNative:true},
    {name:'intensive-no-android',notes:600,minutes:120,edits:20,devices:2,activeDays:30,androidDevices:0}
  ]){
    const result=await simulate(spec);
    const tokenJsonBytes=Buffer.byteLength(JSON.stringify([{devices:Array.from({length:spec.androidDevices},(_,i)=>({token:'fixture-only-token-'+i,platform:'android',updatedAt:1}))}]));
    scenarios.push({...spec,coreMonthlyReceivedJsonBytes:result.receivedJsonBytes*spec.activeDays,
      widgetPushInvocationsMonthly:result.widgetPushRequests*spec.activeDays,
      tokenProjectionMonthlyJsonBytes:tokenJsonBytes*result.widgetPushRequests*spec.activeDays,
      nativeRpcMonthlyJsonBytes:result.nativeRpcReceivedJsonBytes*spec.activeDays,
      nativePreviousFullStateMonthlyJsonBytes:result.nativePreviousFullStateJsonBytes*spec.activeDays});
  }
  return {kind:'offline-synthetic-not-billed-egress-or-load-test',scenarios,queue:await queueBurst(),
    exclusions:['Auth and Realtime','native Android traffic outside active days, authentication and workspace','courses and Drive','real CPU, provider compression and concurrency']};
}
if(require.main===module)report().then(value=>console.log(JSON.stringify(value,null,2))).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={queueBurst,report};
