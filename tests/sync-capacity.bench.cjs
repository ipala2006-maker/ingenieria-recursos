// Deterministic network fixture, not a load test or provider billing measurement.
const assert = require('node:assert/strict');
const {harness} = require('./helpers/account-sync-fixture.cjs');
const fs = require('node:fs');
const {PGlite} = require('@electric-sql/pglite');

async function databaseTransport(clients, baseline) {
  const db = new PGlite(), uid='00000000-0000-4000-8000-000000000001';
  await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
  await db.exec(fs.readFileSync(require.resolve('../supabase/schema.sql'),'utf8'));
  await db.exec(fs.readFileSync(require.resolve('../supabase/account-sync-delta.sql'),'utf8'));
  await db.query('insert into auth.users values($1)',[uid]);
  const row=clients[0].rows.get('alice');
  await db.query('insert into user_states(user_id,state,updated_at) values($1,$2,$3)',[uid,row.state,row.updated_at]);
  await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
  for(const h of clients){
    h.context.client.rpc=async(_name,args)=>{
      const known={...args.p_known};if(baseline){delete known._listDelta;delete known._compactVersions;}
      h.rpcCalls.push(args);
      return {data:(await db.query('select sync_account_state($1,$2,$3) as data',[known,args.p_patch,args.p_expected])).rows[0].data};
    };
    h.context.readHook=async query=>({data:(await db.query("select jsonb_build_object('updated_at',updated_at) as data from user_states where user_id=$1",[uid])).rows[0]?.data||null});
  }
  return db;
}

async function simulate({notes, minutes, edits, devices, baseline = false}) {
  const first=harness();
  first.rows.get('alice').state.values.bandeja_agenda=Array.from({length:notes},(_,id)=>({id:String(id),title:'Repasar ejercicios de la materia '+id,date:'2026-10-23',color:'blue',done:false}));
  const clients=[first,...Array.from({length:devices-1},()=>harness(first.rows))];
  const db=await databaseTransport(clients,baseline);
  try {
  const read=async(h,reason)=>{
    // null bypasses only the new fast paths; the pre-existing delta RPC still
    // runs and confirms writes, reproducing the previous read-before-write flow.
    if(baseline)h.context.compactAvailable=null;
    assert.equal(await h.read(reason),true);
  };
  for(const h of clients)await read(h,'startup');
  for(let minute=1;minute<=minutes;minute++){
    for(const h of clients)h.advance(60000);
    const writer=clients[(minute-1)%devices];
    writer.local.set('estudiemos_pomodoro_streak',JSON.stringify({version:3,days:{'2026-10-23':minute},goal:{minutes:25,updatedAt:1}}));
    writer.context.markLocalChange('estudiemos_pomodoro_streak'); await read(writer,'change');
    if(minute<=edits){
      const agenda=JSON.parse(writer.local.get('bandeja_agenda'));agenda[minute%notes].title='Actividad actualizada '+minute;
      writer.local.set('bandeja_agenda',JSON.stringify(agenda));writer.context.markLocalChange('bandeja_agenda');await read(writer,'change');
    }
    for(const h of clients)if(h!==writer)await read(h,'realtime');
    for(const h of clients)await read(h,'poll');
  }
  // Leave both devices open but idle for another two hours. Missed-update
  // recovery runs at exactly the original two-minute backup interval.
  for(let tick=0;tick<60;tick++)for(const h of clients){h.advance(120000);await read(h,'poll');}
  const days=clients.map(h=>h.context.getSyncUsage().days['2026-10-23']);
  assert.ok(clients.every(h=>JSON.parse(h.local.get('estudiemos_pomodoro_streak')).days['2026-10-23']===minutes));
  return {receivedJsonBytes:days.reduce((n,d)=>n+d.receivedBytes,0),sentJsonBytes:days.reduce((n,d)=>n+d.sentBytes,0),
    requests:clients.reduce((n,h)=>n+h.reads.length+h.rpcCalls.length,0),profileBytes:days[0].profileBytes};
  } finally {await db.close();}
}

async function report() {
  const scenarios=[
    {name:'one-device',notes:300,minutes:60,edits:8,devices:1,activeDays:20},
    {name:'two-devices',notes:300,minutes:60,edits:8,devices:2,activeDays:20},
    {name:'intensive-two-devices',notes:600,minutes:120,edits:20,devices:2,activeDays:30}
  ];
  const result=[];
  for(const spec of scenarios){
    const before=await simulate({...spec,baseline:true}),after=await simulate(spec);
    const monthlyJson=after.receivedJsonBytes*spec.activeDays;
    // 30% of Supabase egress is reserved. The result is a synchronization-only
    // ceiling: no claim about auth, Realtime, native widgets, courses or CPU.
    result.push({...spec,before,after,receivedReductionPercent:+(100*(1-after.receivedJsonBytes/before.receivedJsonBytes)).toFixed(2),
      requestReductionPercent:+(100*(1-after.requests/before.requests)).toFixed(2),monthlyReceivedJsonBytes:monthlyJson,
      syncOnlyUsersAt70PercentOf5GB:Math.floor(3.5e9/monthlyJson)});
  }
  return {kind:'simulated-account-sync-only',limitsChecked:'2026-10-25',notBilling:true,scenarios:result};
}
if(require.main===module)report().then(value=>console.log(JSON.stringify(value,null,2))).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={simulate,report};
