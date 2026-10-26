const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const rules=require('../shared/classrooms');
const source=fs.readFileSync(require('node:path').join(__dirname,'../scripts/classroom-sync.js'),'utf8');
const alice='00000000-0000-4000-8000-000000000001',bob='00000000-0000-4000-8000-000000000002';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const state={revision:'a'.repeat(32),classes:[{id:alice,title:'Maths'}],calendar:[]};
function harness(){
  let user=alice;const listeners=new Map(),values=new Map(),calls=[],timers=new Map();let writes=0,timerId=0;
  const window={EstudiemosClassroomRules:rules,EstudiemosAccount:{getUser:()=>user?{id:user}:null,getSession:()=>user?{access_token:user}:null,whenReady:()=>Promise.resolve()},addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event);}};
  vm.runInNewContext(source,{window,URL,URLSearchParams,AbortController,Date,location:new URL('https://app.test/widget.html'),history:{replaceState(){}},CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},document:{currentScript:{src:'https://app.test/scripts/classroom-sync.js'},hidden:false,addEventListener(){}},localStorage:{getItem:key=>values.get(key)||null,setItem(key,value){writes++;values.set(key,value);},removeItem:key=>values.delete(key)},sessionStorage:{getItem:()=>null,removeItem(){}},setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),fetch:(url,options)=>new Promise(resolve=>calls.push({url:String(url),options,resolve:(body,status=200)=>resolve({ok:status<400,json:async()=>body})}))});
  return {api:window.EstudiemosClasses,calls,values,timers,setClient(client){window.EstudiemosAccount.getClient=()=>client;},get writes(){return writes;},switchUser(id){user=id;window.dispatchEvent({type:'estudiemos:account-change'});}};
}
test('class state uses conditional refresh, memoized projections, cooldown and visibility-sized polling',async()=>{
  const h=harness();await tick();assert.equal(h.calls.length,1);h.calls[0].resolve(state);await tick();assert.equal(h.api.snapshot().classes[0].id,alice);
  assert.equal(h.timers.size,1);assert.equal([...h.timers.values()][0].delay,300000);
  await h.api.refresh();assert.equal(h.calls.length,1,'Focus bursts do not add requests');
  const writes=h.writes,refresh=h.api.refresh(true);await tick();assert.match(h.calls[1].url,/revision=aaaaaaaa/);h.calls[1].resolve({revision:state.revision,unchanged:true});await refresh;assert.equal(h.writes,writes,'Unchanged state neither downloads calendar data nor rewrites cache');
  assert.strictEqual(h.api.events('2026-10-24'),h.api.events('2026-10-24'));
});
test('account switches invalidate both outstanding reads and locally cached class data',async()=>{
  const h=harness();await tick();h.switchUser(bob);await tick();assert.equal(h.calls.length,2);h.calls[0].resolve(state);await tick();assert.equal(h.api.snapshot(),null);
  h.calls[1].resolve({...state,revision:'b'.repeat(32),classes:[{id:bob,title:'New account'}]});await tick();assert.equal(h.api.snapshot().classes[0].id,bob);assert.ok(!h.values.get(rules.CACHE_KEY).includes(alice));
  h.switchUser('');assert.equal(h.api.snapshot(),null);assert.equal(h.values.has(rules.CACHE_KEY),false);assert.equal(h.timers.size,0);
});
test('an explicit refresh surfaces a failed background load and failure backoff avoids repeated traffic',async()=>{
  const h=harness();await tick();const waiting=h.api.refresh(true);h.calls[0].resolve({message:'Unavailable'},503);await assert.rejects(waiting,/Unavailable/);
  await h.api.refresh();assert.equal(h.calls.length,1);
  const retry=h.api.refresh(true);await tick();h.calls[1].resolve(state);await retry;assert.equal(h.api.snapshot().classes.length,1);
});
test('writes beat stale background reads and remain bound to the original account',async()=>{
  const h=harness();await tick();h.calls[0].resolve(state);await tick();const old=h.api.refresh(true);await tick();const writing=h.api.act('join',{code:'ABCDEFGHJK'});await tick();
  h.calls[2].resolve({...state,revision:'c'.repeat(32),classes:[{id:alice,title:'Updated'}]});await writing;h.calls[1].resolve(state);await old;assert.equal(h.api.snapshot().classes[0].title,'Updated');
  const pending=h.api.act('rotate',{id:alice});await tick();h.switchUser(bob);await tick();h.calls[3].resolve(state);await assert.rejects(pending,/cuenta cambió/);
  h.calls[4].resolve({...state,classes:[]});await tick();assert.equal(h.api.snapshot().classes.length,0);
});

test('compact state retains other courses and missing bases trigger one full recovery without replaying writes',async()=>{
 const h=harness();await tick();const hash='1'.repeat(32);
 const compact={revision:state.revision,classes:state.classes,calendarPatch:{versions:{[alice]:hash},classes:[alice],events:[]}};
 h.calls[0].resolve(compact);await tick();assert.equal(h.api.snapshot().calendarVersions[alice],hash);
 let pending=h.api.refresh(true);await tick();assert.equal(new URL(h.calls[1].url).searchParams.get('stateProtocol'),'2');
 h.calls[1].resolve({...compact,revision:'b'.repeat(32),calendarPatch:{versions:{[alice]:'2'.repeat(32)},classes:[],events:[]}});await tick();
 assert.equal(h.calls.length,3);assert.equal(new URL(h.calls[2].url).searchParams.has('revision'),false);assert.equal(new URL(h.calls[2].url).searchParams.get('calendarVersions'),'{}');
 h.calls[2].resolve(compact);await pending;
 pending=h.api.act('join',{code:'ABCDEFGHJK'});await tick();h.calls[3].resolve({...compact,calendarPatch:{versions:{[alice]:'3'.repeat(32)},classes:[],events:[]}});await tick();
 assert.equal(h.calls[4].options.method,'GET');h.calls[4].resolve(compact);await pending;
 assert.equal(h.calls.filter(call=>call.options.method==='POST').length,1,'A successful mutation is never repeated for recovery');
});

test('authenticated direct reads bypass Vercel; rollout fallback is limited to a missing function',async()=>{
 const h=harness(),calls=[];h.setClient({rpc:async(name,args)=>{calls.push({name,args});return{data:{...state,classes:[],calendar:[]},error:null};}});await tick();
 assert.equal(h.calls.length,0);assert.equal(calls[0].name,'classroom_read');assert.equal(calls[0].args.p_action,'state');assert.equal(JSON.stringify(calls).includes(alice),false,'No caller-supplied identity');
 await h.api.history(alice);assert.equal(calls[1].args.p_action,'history');
 h.setClient({rpc:async()=>({error:{code:'42501',message:'permission denied'}})});await assert.rejects(h.api.refresh(true),/consultar/);assert.equal(h.calls.length,0,'Permission errors do not fall back to a more privileged endpoint');
 h.setClient({rpc:async()=>({error:{code:'PGRST202'}})});const retry=h.api.refresh(true);await tick();h.calls[0].resolve(state);await retry;
 const next=h.api.refresh(true);await tick();assert.equal(h.calls.length,2);h.calls[1].resolve({revision:state.revision,unchanged:true});await next;
});
