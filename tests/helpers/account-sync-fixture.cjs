const fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../../scripts/account.js'), 'utf8');
const preamble = source.slice(source.indexOf('  const SYNC_KEYS'), source.indexOf('  const WINDOWS_WIDGETS_READY_KEY'));
const functions = source.slice(source.indexOf('  async function synchronize(reason)'), source.indexOf('  function getCredentials()'));
const widgetNotifier = source.slice(source.indexOf('  async function notifyAndroidWidgets('),source.indexOf('  function syncAccountWithAndroid()'));
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return {promise, resolve}; };

function installCompact(h) {
  const crypto = require('node:crypto'); let revision = Date.parse('2026-10-23T13:00:00Z');
  h.context.client.rpc = async (_fn, args) => {
    h.rpcCalls.push(clone(args));
    const uid = h.context.session.user.id, row = h.rows.get(uid);
    if (!row) return {data:{missing:true, versions:{}}};
    if (args.p_patch) {
      if (args.p_expected !== row.updated_at) return {data:{conflict:true, versions:{}, state:{values:{},changedAt:{}}, updated_at:row.updated_at}};
      Object.assign(row.state.values, clone(args.p_patch.values)); Object.assign(row.state.changedAt, clone(args.p_patch.changedAt)); row.updated_at = new Date(++revision).toISOString();
    }
    const versions = {}, values = {}, changedAt = {};
    for (const key of Object.keys(row.state.values)) {
      const hash = crypto.createHash('md5').update(JSON.stringify([row.state.values[key], row.state.changedAt[key]])).digest('hex');
      versions[key] = hash;
      if (args.p_known[key] !== hash) { values[key] = row.state.values[key]; changedAt[key] = row.state.changedAt[key] || 0; }
    }
    return {data:args.p_patch ? {written:true,versions,updated_at:row.updated_at} : {partial:true,versions,updated_at:row.updated_at,state:{version:2,values,changedAt}}};
  };
}

function harness(sharedRows) {
  let now = Date.parse('2026-10-23T12:00:00Z'), nextTimer = 0;
  const local = new Map(), timers = new Map(), intervals = [], reads = [], writes = [], events = [], rpcCalls = [], pushRequests = [];
  const rows = sharedRows || new Map([['alice', {state:{version:2,values:{bandeja_agenda:[{id:'note',title:'Private title',date:'2026-10-23'}]},changedAt:{bandeja_agenda:1}},updated_at:'2026-10-23T11:00:00.000Z'}]]);
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const context = {
    AUTH_ONLY:false, compactVersions:null, compactAvailable:null, syncConflicts:0, session:{user:{id:'alice'},access_token:'fixture-only'}, syncing:false, syncRequested:false, queuedSyncReason:'queued', synchronizedUserId:'', applyingCloud:false,
    lastPullAt:0, lastResumeCheckAt:0, cloudRevision:'', cloudRevisionUser:'', cachedCloudState:null, accountGeneration:0, syncFailures:0, syncRetryAt:0, realtimeConnected:true,
    realtimeChannel:null, realtimeUserId:'', cloudPollTimer:0, remoteRefreshTimer:0, syncTimer:0, INSTANCE_ID:'fixture',
    Date:Clock, TextEncoder, Intl, navigator:{onLine:true}, CustomEvent:class { constructor(type) {this.type=type;} },
    document:{visibilityState:'visible',querySelector:()=>null},
    localStorage:{getItem:key=>local.get(key)??null,setItem:(key,value)=>local.set(key,String(value)),removeItem:key=>local.delete(key)},
    window:{dispatchEvent:e=>events.push(e.type),EstudiemosStudyGoal:require('../../shared/study-goal'),EstudiemosPomodoroSync:require('../../shared/pomodoro-sync'),
      setTimeout:(fn,delay)=>{timers.set(++nextTimer,{fn,delay});return nextTimer;},clearTimeout:id=>timers.delete(id),
      setInterval:(fn,delay)=>{intervals.push({fn,delay});return intervals.length;},clearInterval(){}},
    updateSyncLabel(){}, updateAccountIndicator(){}, setStatus(){}, getRootPath:()=> 'https://estudiemos.example/', hasAndroidBridge:()=>false, androidPushToken:'',
    fetch:async(url,options)=>{pushRequests.push({url,options});return {ok:true};},
    client:{from:table=>({
      select(fields) {this.fields=fields;return this;},eq(_key,owner){this.owner=owner;return this;},neq(_key,revision){this.revision=revision;return this;},
      async maybeSingle() {
        reads.push({table,owner:this.owner,revision:this.revision,fields:this.fields});
        if (context.readHook) return context.readHook(this);
        if (context.failure) return {error:Error('offline')};
        const row=rows.get(this.owner);
        return {data:row&&row.updated_at!==this.revision ? this.fields==='updated_at'?{updated_at:row.updated_at}:clone(row) : null,error:null};
      },
      async upsert(row){writes.push(clone(row));rows.set(row.user_id,clone(row));if(context.writeHook)await context.writeHook();return {error:null};}
    })}
  };
  vm.runInNewContext(preamble + functions + widgetNotifier, context);
  return {context,local,rows,reads,writes,timers,events,intervals,rpcCalls,pushRequests,advance:ms=>now+=ms,read:reason=>context.synchronize(reason),
    drain:async()=>{const pending=[...timers.values()];timers.clear();for(const timer of pending)await timer.fn();}};
}
module.exports = {harness, installCompact, clone, deferred};
