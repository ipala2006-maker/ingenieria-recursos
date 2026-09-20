const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const file=path.resolve(__dirname,'../api/_lib/inbox-alarm-feed.js');
const id='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
function setup(){
  let rows=[],user={id};const calls=[];const localRequire=createRequire(file);
  const sandbox={module:{exports:{}},Buffer,Date,process:{env:{SUPABASE_SECRET_KEY:'test-secret-not-a-live-key'}},require(name){
    if(name==='./supabase-admin')return {authenticateBearer:async token=>token==='Bearer session'?user:null,adminRequest:async url=>{calls.push(url);return rows;}};
    if(name==='./request-security')return {isSameOriginRequest:req=>req.headers.origin!=='https://foreign.example',requireJsonRequest:()=>true};
    return localRequire(name);
  }};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),sandbox);
  const api=sandbox.module.exports;
  async function call(method,body={},query={},headers={}){const result={headers:{}};const res={setHeader:(k,v)=>result.headers[k]=v,status(code){result.status=code;return this;},json(value){result.body=JSON.parse(JSON.stringify(value));return result;}};
    await api({method,body,query,headers},res);return result;
  }
  return {api,call,calls,setRows(value){rows=value;},setUser(value){user=value;}};
}
test('native feed connects only with authenticated explicit consent, confirms only the same user',async()=>{
  const {api,call,setUser}=setup();
  assert.equal((await call('POST',{action:'alarms-connect',consent:true})).status,401);
  const headers={authorization:'Bearer session'};
  assert.equal((await call('POST',{action:'alarms-connect'}, {},headers)).status,400);
  assert.equal((await call('POST',{action:'alarms-connect',consent:true},{},{...headers,origin:'https://foreign.example'})).status,403);
  const started=await call('POST',{action:'alarms-connect',consent:true},{},headers);
  assert.equal(started.status,200);
  const connected=await call('GET',{}, {alarmSetup:started.body.token});
  assert.equal(connected.status,200);
  assert.equal(api.verify(connected.body.feedToken,'alarm-feed').sub,id);
  assert.equal(api.verify(connected.body.feedToken,'alarm-setup'),null);
  setUser({id:other});
  assert.equal((await call('POST',{action:'alarms-confirm',proof:connected.body.confirmation},{},headers)).status,400);
  setUser({id});
  assert.equal((await call('POST',{action:'alarms-confirm',proof:connected.body.confirmation},{},headers)).body.connected,true);
  assert.equal((await call('DELETE',{}, {alarmFeed:'1'})).status,405);
});
test('alarm credentials are scoped, expiring and tamper-evident',()=>{
  const {api}=setup();
  const token=api.sign(id,'alarm-feed',60);
  assert.equal(api.verify(token+'x','alarm-feed'),null);
  assert.equal(api.verify(api.sign(id,'alarm-feed',-1),'alarm-feed'),null);
  assert.equal(api.verify(api.sign('not-a-user','alarm-feed',60),'alarm-feed'),null);
  assert.equal(api.verify(token,'alarm-receipt'),null);
  assert.equal(api.verify('x'.repeat(3000),'alarm-feed'),null);
});
test('feed queries only its owner and emits only enabled alarm fields, including empty snapshots',async()=>{
  const {api,call,calls,setRows}=setup();
  const alarm={date:'2026-09-15',time:'18:00',repeat:'daily',windows:true};
  setRows([{updated_at:'2026-09-14',state:{secret:'private',values:{bandeja_agenda:JSON.stringify([
    {id:'a',title:'Pilot',note:'private note',alarm},{id:'b',title:'done',done:true,alarm},
    {id:'c',alarm:{...alarm,windows:false}},{id:'d',title:'No alarm'}])}}}]);
  const feed=await call('GET',{}, {alarmFeed:'1'},{authorization:`Bearer ${api.sign(id,'alarm-feed',60)}`});
  assert.equal(feed.status,200);assert.equal(feed.body.items.length,1);
  assert.deepEqual(Object.keys(feed.body.items[0]).sort(),['alarm','id','title']);
  assert.match(calls[0],new RegExp(`user_id=eq.${id}`));
  assert.equal(feed.headers['Cache-Control'],'no-store');
  setRows([]);assert.equal((await api.snapshot(id)).items.length,0);
});
