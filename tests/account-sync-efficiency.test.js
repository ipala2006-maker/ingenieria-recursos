const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../scripts/account.js'), 'utf8');
const preamble = source.slice(source.indexOf('  const SYNC_KEYS'), source.indexOf('  const WINDOWS_WIDGETS_READY_KEY'));
const functions = source.slice(source.indexOf('  async function synchronize(reason)'), source.indexOf('  function getCredentials()'));
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return {promise, resolve}; };
function installCompact(h){
  const crypto=require('node:crypto');let revision=Date.parse('2026-10-23T13:00:00Z');
  h.context.client.rpc=async(_fn,args)=>{
    const uid=h.context.session.user.id,row=h.rows.get(uid);
    if(!row)return {data:{missing:true,versions:{}}};
    if(args.p_patch){if(args.p_expected!==row.updated_at)return {data:{conflict:true,versions:{},state:{values:{},changedAt:{}},updated_at:row.updated_at}};Object.assign(row.state.values,clone(args.p_patch.values));Object.assign(row.state.changedAt,clone(args.p_patch.changedAt));row.updated_at=new Date(++revision).toISOString();}
    const versions={},values={},changedAt={};for(const key of Object.keys(row.state.values)){const hash=crypto.createHash('md5').update(JSON.stringify([row.state.values[key],row.state.changedAt[key]])).digest('hex');versions[key]=hash;if(args.p_known[key]!==hash){values[key]=row.state.values[key];changedAt[key]=row.state.changedAt[key]||0;}}
    return {data:args.p_patch?{written:true,versions,updated_at:row.updated_at}:{partial:true,versions,updated_at:row.updated_at,state:{version:2,values,changedAt}}};
  };
}

function harness(sharedRows) {
  let now = Date.parse('2026-10-23T12:00:00Z'), nextTimer = 0;
  const local = new Map(), timers = new Map(), intervals = [], reads = [], writes = [], events = [];
  const rows = sharedRows || new Map([['alice', {state:{version:2,values:{bandeja_agenda:[{id:'note',title:'Private title',date:'2026-10-23'}]},changedAt:{bandeja_agenda:1}},updated_at:'2026-10-23T11:00:00.000Z'}]]);
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const context = {
    AUTH_ONLY:false, compactVersions:null,compactAvailable:null,syncConflicts:0,session:{user:{id:'alice'}}, syncing:false, syncRequested:false, queuedSyncReason:'queued', synchronizedUserId:'', applyingCloud:false,
    lastPullAt:0, cloudRevision:'', cloudRevisionUser:'', cachedCloudState:null,accountGeneration:0,syncFailures:0, syncRetryAt:0, realtimeConnected:true,
    realtimeChannel:null, realtimeUserId:'', cloudPollTimer:0, remoteRefreshTimer:0, syncTimer:0, INSTANCE_ID:'fixture',
    Date:Clock, TextEncoder, Intl, navigator:{onLine:true}, CustomEvent:class { constructor(type) {this.type=type;} },
    document:{visibilityState:'visible',querySelector:()=>null},
    localStorage:{getItem:key=>local.get(key)??null,setItem:(key,value)=>local.set(key,String(value)),removeItem:key=>local.delete(key)},
    window:{dispatchEvent:e=>events.push(e.type),EstudiemosStudyGoal:require('../shared/study-goal'),EstudiemosPomodoroSync:require('../shared/pomodoro-sync'),
      setTimeout:(fn,delay)=>{timers.set(++nextTimer,{fn,delay});return nextTimer;},clearTimeout:id=>timers.delete(id),
      setInterval:(fn,delay)=>{intervals.push({fn,delay});return intervals.length;},clearInterval(){}},
    updateSyncLabel(){}, updateAccountIndicator(){}, setStatus(){}, notifyAndroidWidgets(){},
    client:{from:table=>({
      select(fields) {this.fields=fields;return this;},eq(_key,owner){this.owner=owner;return this;},neq(_key,revision){this.revision=revision;return this;},
      async maybeSingle(){
        reads.push({table,owner:this.owner,revision:this.revision,fields:this.fields});
        if (context.readHook) return context.readHook(this);
        if (context.failure) return {error:Error('offline')};
        const row=rows.get(this.owner); return {data:row&&row.updated_at!==this.revision?clone(row):null,error:null};
      },
      async upsert(row){writes.push(clone(row));rows.set(row.user_id,clone(row));if(context.writeHook)await context.writeHook();return {error:null};}
    })}
  };
  vm.runInNewContext(preamble + functions, context);
  return {context,local,rows,reads,writes,timers,events,intervals,advance:ms=>now+=ms,read:reason=>context.synchronize(reason),
    drain:async()=>{const pending=[...timers.values()];timers.clear();for(const timer of pending)await timer.fn();}};
}

test('startup hydrates once; a quiet two-hour session no longer downloads the full profile repeatedly', async () => {
  const h=harness();
  h.rows.get('alice').state.values.bandeja_agenda=Array.from({length:300},(_,i)=>({id:String(i),title:'Repasar materia y ejercicios '+i,date:'2026-10-23'}));
  assert.equal(await h.read('startup'),true);
  for(let i=0;i<1440;i++){h.advance(5000);assert.equal(await h.read(i%2?'widget':'poll'),true);}
  const report=h.context.getSyncUsage(),today=report.days['2026-10-23'];
  assert.equal(today.fullDownloads,1);assert.equal(today.unchangedChecks,60);assert.equal(h.reads.length,61);
  assert.ok(today.receivedBytes<today.profileBytes+2000);
  assert.ok(today.receivedBytes<today.profileBytes*480*0.01,'Over 99% less JSON in a quiet session, not a billing claim');
  assert.equal(h.writes.length,0);assert.ok(h.reads.slice(1).every(q=>q.revision&&q.owner==='alice'));
});

test('the dedicated teacher workspace authenticates without hydrating or subscribing to private study state',async()=>{
  const h=harness();h.context.AUTH_ONLY=true;
  assert.equal(await h.read('startup'),true);await h.read('manual');h.context.connectRealtime('alice');h.context.startCloudPolling();
  assert.equal(h.reads.length,0);assert.equal(h.writes.length,0);assert.equal(h.context.synchronizedUserId,'');assert.equal(h.local.has('bandeja_agenda'),false);assert.equal(h.timers.size,0);
});

test('conditional reads still fetch a changed revision, including a writer with an older wall clock', async () => {
  const h=harness();await h.read('startup');
  const row=h.rows.get('alice');row.updated_at='2026-10-23T10:00:00.000Z';row.state.values.bandeja_agenda[0].title='Edited remotely';row.state.changedAt.bandeja_agenda=2;
  assert.equal(await h.read('realtime'),true);
  assert.equal(JSON.parse(h.local.get('bandeja_agenda'))[0].title,'Edited remotely');
  assert.equal(h.reads.at(-1).revision,'2026-10-23T11:00:00.000Z');
  assert.equal(h.context.cloudRevision,h.rows.get('alice').updated_at);
});

test('dirty local edits check the server revision before merging; unchanged state is reused and rapid edits are debounced', async () => {
  const h=harness();await h.read('startup');
  h.local.set('bandeja_agenda',JSON.stringify([{id:'local',title:'New task'}]));h.context.markLocalChange('bandeja_agenda');
  h.context.scheduleSync();h.context.scheduleSync();h.context.scheduleSync();
  assert.equal(h.timers.size,1);assert.equal([...h.timers.values()][0].delay,600);await h.drain();
  assert.ok(h.reads.at(-1).revision);assert.equal(h.writes.length,1);
  assert.equal(h.context.getSyncUsage().days['2026-10-23'].fullDownloads,1);
  assert.equal(h.rows.get('alice').state.values.bandeja_agenda[0].title,'New task');assert.equal(h.local.get('estudiemos_cloud_dirty'),'false');
});

test('background requests coalesce, but a reminder verification and explicit manual refresh bypass the quiet interval', async () => {
  const h=harness();await h.read('startup');const count=h.reads.length;
  for(let i=0;i<10;i++)await h.read('widget');assert.equal(h.reads.length,count);
  await h.read('verify');assert.equal(h.reads.length,count+1);assert.ok(h.reads.at(-1).revision);
  await h.read('manual');assert.equal(h.reads.length,count+2);assert.equal(h.reads.at(-1).revision,undefined);
  h.context.syncing=true;await h.read('poll');assert.equal(h.context.syncRequested,false);
  await h.read('pomodoro');assert.equal(h.context.syncRequested,true);assert.equal(h.context.queuedSyncReason,'pomodoro');
});

test('lost broadcasts are recovered by conditional polling; unavailable realtime uses a faster fallback', async () => {
  const h=harness();await h.read('startup');h.context.realtimeConnected=false;
  h.rows.get('alice').updated_at='2026-10-23T12:10:00Z';h.rows.get('alice').state.values.bandeja_agenda[0].title='Missed broadcast';h.rows.get('alice').state.changedAt.bandeja_agenda=3;
  h.advance(25000);await h.read('poll');assert.equal(h.reads.length,1);
  h.advance(5000);await h.read('poll');assert.equal(h.reads.length,2);assert.equal(JSON.parse(h.local.get('bandeja_agenda'))[0].title,'Missed broadcast');
  h.context.document.visibilityState='hidden';assert.equal(h.context.cloudCheckInterval(),300000);
  h.advance(40000);await h.read('poll');assert.equal(h.reads.length,2);
  await h.read('realtime');assert.equal(h.reads.length,3,'A real change hint is not delayed because the app is hidden');
});

test('offline work stays local and failing servers back off instead of retrying every widget tick', async () => {
  const h=harness();await h.read('startup');h.context.navigator.onLine=false;
  assert.equal(await h.read('manual'),false);assert.equal(h.reads.length,1);
  h.context.navigator.onLine=true;h.context.failure=true;assert.equal(await h.read('verify'),false);
  for(let i=0;i<5;i++){h.advance(5000);assert.equal(await h.read('poll'),false);}assert.equal(h.reads.length,2);
  h.advance(5000);assert.equal(await h.read('poll'),false);assert.equal(h.reads.length,3);assert.equal(h.context.syncRetryAt,h.context.Date.now()+60000);
  h.context.failure=false;assert.equal(await h.read('manual'),true);
  assert.equal(h.context.syncFailures,0);assert.equal(h.context.syncRetryAt,0);
});

test('signout or account switch during a read cannot hydrate the next account or mark it synchronized', async () => {
  for(const next of [null,{user:{id:'bob'}},{user:{id:'alice'}}]){
    const h=harness(),pending=deferred();h.context.readHook=()=>pending.promise;
    const read=h.read('startup');h.context.session=next;h.context.clearLocalAccountData();pending.resolve({data:clone(h.rows.get('alice'))});
    assert.equal(await read,false);assert.equal(h.context.synchronizedUserId,'');assert.equal(h.local.get('bandeja_agenda'),'[]');assert.equal(h.writes.length,0);
    assert.deepEqual(Object.keys(h.context.getSyncUsage().days),[]);
  }
});

test('an edit made while an unchanged conditional read is in flight is merged with the last server-confirmed state', async () => {
  const h=harness();await h.read('startup');const pending=deferred();h.context.readHook=()=>pending.promise;
  const read=h.read('realtime');h.local.set('bandeja_agenda',JSON.stringify([{id:'new',title:'During read'}]));h.context.markLocalChange('bandeja_agenda');pending.resolve({data:null,error:null});
  assert.equal(await read,true);assert.equal(h.rows.get('alice').state.values.bandeja_agenda[0].title,'During read');assert.equal(h.local.get('estudiemos_cloud_dirty'),'false');
});

test('edits during upload cannot be marked clean or lost when the earlier write completes', async () => {
  const h=harness();await h.read('startup');h.local.set('bandeja_agenda',JSON.stringify([{id:'a',title:'First'}]));h.context.markLocalChange('bandeja_agenda');
  const pending=deferred();h.context.writeHook=()=>pending.promise;const write=h.read('change');
  await new Promise(setImmediate);h.advance(1);h.local.set('bandeja_agenda',JSON.stringify([{id:'b',title:'Second'}]));h.context.markLocalChange('bandeja_agenda');pending.resolve();
  assert.equal(await write,true);assert.equal(h.local.get('estudiemos_cloud_dirty'),'true');delete h.context.writeHook;await h.drain();
  assert.equal(h.rows.get('alice').state.values.bandeja_agenda[0].title,'Second');assert.equal(h.local.get('estudiemos_cloud_dirty'),'false');
});

test('usage measurements contain only bounded counters and dates, never task content or account credentials', async () => {
  const h=harness();await h.read('startup');await h.read('verify');
  const saved=h.local.get('estudiemos_sync_usage:alice');assert.doesNotMatch(saved,/Private title|access_token|refresh_token|bandeja_agenda|alice/);
  assert.ok(!Object.keys(h.context.captureLocalState().values).some(key=>key.startsWith('estudiemos_sync_usage')));
  assert.equal(h.context.syncJsonBytes('año'),6);const report=h.context.getSyncUsage();assert.equal(report.scope,'this-browser');assert.equal(report.days['2026-10-23'].unchangedChecks,1);
  const key='estudiemos_sync_usage:alice';h.local.set(key,JSON.stringify({days:{'2025-01-01':{receivedBytes:10},'2026-10-23':{receivedBytes:-10,checks:Infinity,title:'Never export'}}}));
  const cleaned=h.context.getSyncUsage();assert.deepEqual(Object.keys(cleaned.days),['2026-10-23']);assert.equal(cleaned.days['2026-10-23'].receivedBytes,0);assert.doesNotMatch(JSON.stringify(cleaned),/Never export/);
  h.context.session={user:{id:'bob'}};assert.deepEqual(Object.keys(h.context.getSyncUsage().days),[]);
});

test('measurement storage failures never break a successful account synchronization', async () => {
  const h=harness(),set=h.context.localStorage.setItem;h.context.localStorage.setItem=(key,value)=>{if(key.startsWith('estudiemos_sync_usage:'))throw Error('quota');set(key,value);};
  assert.equal(await h.read('startup'),true);assert.equal(h.context.synchronizedUserId,'alice');
});

test('Realtime status drives the fallback, while notices contain only a sender and revision', async () => {
  const h=harness();let callback,notice;
  h.context.client.channel=()=>{const c={on(){return c;},subscribe(cb){callback=cb;return c;},send:value=>{notice=value;return Promise.resolve('ok');}};return c;};
  h.context.client.removeChannel=async()=>{};
  h.context.connectRealtime('alice');callback('SUBSCRIBED');assert.equal(h.context.cloudCheckInterval(),120000);
  callback('CHANNEL_ERROR');assert.equal(h.context.cloudCheckInterval(),30000);
  h.context.broadcastStateUpdate('alice','2026-10-23');assert.deepEqual(Object.keys(notice.payload).sort(),['sender','updatedAt']);
  h.context.disconnectRealtime();assert.equal(h.context.realtimeConnected,false);
});

test('a busy two-device session merges edits on either device with over 90% less JSON than the old periodic full reads', async t => {
  const pc=harness();
  pc.rows.get('alice').state.values.bandeja_agenda=Array.from({length:300},(_,i)=>({id:String(i),title:'Materia y ejercicios '+i,date:'2026-10-23',color:'blue'}));
  const phone=harness(pc.rows);await pc.read('startup');await phone.read('startup');
  for(let i=0;i<60;i++){
    pc.advance(120000);phone.advance(120000);
    const [writer,reader]=i%2?[phone,pc]:[pc,phone];
    const notes=JSON.parse(writer.local.get('bandeja_agenda'));notes[0].title='Edición '+i;writer.local.set('bandeja_agenda',JSON.stringify(notes));writer.context.markLocalChange('bandeja_agenda');
    assert.equal(await writer.read('change'),true);assert.equal(await reader.read('realtime'),true);
    assert.equal(JSON.parse(reader.local.get('bandeja_agenda'))[0].title,'Edición '+i);
    for(let tick=0;tick<24;tick++){await pc.read('widget');await phone.read('poll');}
  }
  const reports=[pc,phone].map(h=>h.context.getSyncUsage().days['2026-10-23']);
  const received=reports.reduce((sum,r)=>sum+r.receivedBytes,0),old=reports[0].profileBytes*480*2;
  assert.ok(received<old*0.1);assert.ok(reports.every(r=>r.fullDownloads<35));
  t.diagnostic(JSON.stringify({fixture:'300 notes, two devices, two hours, 60 alternating edits',profileBytes:reports[0].profileBytes,receivedJsonBytes:received,oldPollingJsonBytes:old,reductionPercent:Number((100*(1-received/old)).toFixed(2))}));
});

test('successive local writes have distinct revisions even when the clock has not advanced', async () => {
  const h=harness();await h.read('startup');
  for(let i=0;i<2;i++){h.local.set('bandeja_agenda',JSON.stringify([{id:'note',title:String(i)}]));h.context.markLocalChange('bandeja_agenda');await h.read('change');}
  assert.notEqual(h.writes[0].updated_at,h.writes[1].updated_at);
});

test('a local edit preserves a concurrent remote change to a different tool', async () => {
  const h=harness();await h.read('startup');h.advance(1000);
  h.local.set('bandeja_agenda',JSON.stringify([{id:'local',title:'Local task'}]));h.context.markLocalChange('bandeja_agenda');
  const row=h.rows.get('alice');row.updated_at='2026-10-23T12:00:01Z';row.state.values.bandeja_horarios=[{id:'remote',title:'Remote class'}];row.state.changedAt.bandeja_horarios=Date.parse('2026-10-23T12:00:01Z');
  await h.read('change');const saved=h.rows.get('alice').state.values;
  assert.equal(saved.bandeja_agenda[0].title,'Local task');assert.equal(saved.bandeja_horarios[0].title,'Remote class');
});

test('minute-by-minute study progress sends only changed keys instead of resending the entire agenda',async t=>{
  const h=harness();h.rows.get('alice').state.values.bandeja_agenda=Array.from({length:600},(_,id)=>({id,title:'Actividad del estudiante '+id,date:'2026-10-23'}));installCompact(h);await h.read('startup');
  const before=clone(h.context.getSyncUsage().days['2026-10-23']),profile=before.profileBytes;
  for(let minute=1;minute<=60;minute++){h.advance(60000);h.local.set('estudiemos_pomodoro_streak',JSON.stringify({version:3,days:{'2026-10-23':minute}}));h.context.markLocalChange('estudiemos_pomodoro_streak');await h.read('change');}
  const usage=h.context.getSyncUsage().days['2026-10-23'],sent=usage.sentBytes-before.sentBytes;assert.ok(sent<profile*60*.1);assert.equal(h.reads.length,0);assert.equal(h.rows.get('alice').state.values.bandeja_agenda.length,600);assert.equal(JSON.parse(h.rows.get('alice').state.values.estudiemos_pomodoro_streak).days['2026-10-23'],60);
  t.diagnostic(JSON.stringify({profileBytes:profile,minutes:60,sentBytes:sent,legacyFullProfileBytes:profile*60,reductionPercent:Number((100*(1-sent/(profile*60))).toFixed(2))}));
});
test('a missing compact RPC falls back once; network failures never fall back to an unguarded full write',async()=>{
  const h=harness();let calls=0;h.context.client.rpc=async()=>{calls++;return {error:{code:'PGRST202'}};};await h.read('startup');h.advance(120000);await h.read('poll');assert.equal(calls,1);assert.equal(h.reads.length,2);
  const unavailable=harness();unavailable.context.client.rpc=async()=>({error:{code:'503',message:'offline'}});assert.equal(await unavailable.read('startup'),false);assert.equal(unavailable.reads.length,0);assert.equal(unavailable.writes.length,0);
});

test('compact compare-and-swap conflicts retry with fresh remote changes and do not overwrite another tool',async()=>{
  const h=harness();installCompact(h);await h.read('startup');
  const rpc=h.context.client.rpc;let conflict=true;
  h.context.client.rpc=async(fn,args)=>{if(args.p_patch&&conflict){conflict=false;const row=h.rows.get('alice');row.state.values.estudiemos_theme='light';row.state.changedAt.estudiemos_theme=2;row.updated_at='2026-10-23T15:00:00Z';}return rpc(fn,args);};
  h.advance(1000);h.local.set('bandeja_agenda',JSON.stringify([{title:'Local edit'}]));h.context.markLocalChange('bandeja_agenda');assert.equal(await h.read('change'),false);assert.equal(h.local.get('estudiemos_cloud_dirty'),'true');await h.drain();assert.equal(h.rows.get('alice').state.values.estudiemos_theme,'light');assert.equal(h.rows.get('alice').state.values.bandeja_agenda[0].title,'Local edit');assert.equal(h.local.get('estudiemos_cloud_dirty'),'false');
});

test('an explicit zero change timestamp does not inherit an unrelated tool edit',async()=>{
  const h=harness();await h.read('startup');h.advance(1000);h.context.markLocalChange('bandeja_agenda');const values=JSON.parse(h.local.get('estudiemos_cloud_key_changed'));values.estudiemos_theme=0;h.local.set('estudiemos_cloud_key_changed',JSON.stringify(values));assert.equal(h.context.captureLocalState().changedAt.estudiemos_theme,0);
});
