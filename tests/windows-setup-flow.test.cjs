const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const account=fs.readFileSync(path.join(__dirname,'../scripts/account.js'),'utf8');
const alarms=fs.readFileSync(path.join(__dirname,'../scripts/inbox-alarms.js'),'utf8');

function widgetHarness(){
  const saved=new Map(),links=[],messages=[],busy=[];
  const controls=new Map();
  const context={
    widgetLaunching:false,widgetResumeSignIn:false,session:{access_token:'pilot',user:{id:'pilot'}},
    WINDOWS_WIDGET_PENDING_KEY:'pending',WINDOWS_WIDGETS_READY_KEY:'ready',URLSearchParams,AbortSignal,
    localStorage:{setItem:(k,v)=>saved.set(k,v),getItem:k=>saved.get(k),removeItem:k=>saved.delete(k)},
    window:{EstudiemosRelease:{enabled:()=>false}},
    widgetSetup:{close(){context.closed=true;},querySelector(s){if(!controls.has(s))controls.set(s,{hidden:true,setAttribute(){},removeAttribute(){}});return controls.get(s);}},
    widgetSetupMessage:m=>messages.push(m),setStatus:m=>messages.push(m),setDesktopWidgetBusy:(w,b)=>busy.push(b),openDialog(){context.login=true;},
    getRootPath:()=> '/',fetch:async()=>({ok:true,json:async()=>({token:'pilot.signature'})}),
    document:{body:{appendChild(){}},createElement:()=>({click(){links.push(this.href);},remove(){}})}
  };
  vm.createContext(context);
  vm.runInContext(account.slice(account.indexOf('  async function launchWindowsWidget('),account.indexOf('  function installDesktopWidgets(')),context);
  return {context,saved,links,messages,busy};
}

test('opening a native protocol never marks a widget added or clears pending selection',async()=>{
  const h=widgetHarness();await h.context.launchWindowsWidget('calendar');
  assert.equal(h.links.length,1);assert.match(h.links[0],/callback=1/);assert.match(h.links[0],/link=pilot.signature/);
  assert.equal(h.saved.get('pending'),'calendar');assert.equal(h.saved.has('ready'),false);
  assert.match(h.messages.at(-1),/Todavía no confirmamos/);assert.deepEqual(h.busy,[true,false]);
});
test('offline or invalid account-link responses do not open a disconnected widget',async()=>{
  for(const fetch of [async()=>{throw Error('offline');},async()=>({ok:false,json:async()=>({})}),async()=>({ok:true,json:async()=>({})})]){
    const h=widgetHarness();h.context.fetch=fetch;await h.context.launchWindowsWidget('inbox');
    assert.equal(h.links.length,0);assert.equal(h.context.widgetLaunching,false);assert.equal(h.busy.at(-1),false);
    assert.match(h.messages.at(-1),/no hace falta reinstalar/);
  }
});
test('signed-out users resume login instead of opening a native account prompt',async()=>{
  const h=widgetHarness();h.context.session=null;await h.context.launchWindowsWidget('streak');
  assert.equal(h.context.login,true);assert.equal(h.context.widgetResumeSignIn,true);assert.equal(h.links.length,0);
});
test('a prepared Windows PC opens the selected widget with one profile click',async()=>{
  const opened=[],shown=[];
  const c={window:{EstudiemosRelease:{enabled:()=>false}},isWindowsDevice:()=>true,WINDOWS_WIDGETS_READY_KEY:'ready',
    localStorage:{getItem:()=> 'true'},showWidgetSetup:w=>shown.push(w),launchWindowsWidget:w=>opened.push(w)};
  vm.createContext(c);vm.runInContext(account.slice(account.indexOf('  async function openDesktopWidget('),account.indexOf('  async function launchWindowsWidget(')),c);
  await c.openDesktopWidget('calendar');assert.deepEqual(shown,['calendar']);assert.deepEqual(opened,['calendar']);
  opened.length=0;c.localStorage.getItem=()=>null;await c.openDesktopWidget('inbox');assert.deepEqual(opened,[]);
});
test('double clicks and account changes cannot launch duplicate or wrong-account widgets',async()=>{
  const h=widgetHarness();let resolve;
  h.context.fetch=()=>new Promise(r=>{resolve=r;});
  const pending=h.context.launchWindowsWidget('calendar');await h.context.launchWindowsWidget('inbox');
  assert.deepEqual(h.busy,[true]);h.context.session={access_token:'other',user:{id:'other'}};
  resolve({ok:true,json:async()=>({token:'pilot.signature'})});await pending;
  assert.equal(h.links.length,0);assert.equal(h.context.widgetLaunching,false);
});
test('widget selection stays in the app and installer downloads remain explicit',()=>{
  const install=account.slice(account.indexOf('  function installDesktopWidgets('),account.indexOf('  function consumeWindowsWidgetsReadyMarker('));
  assert.doesNotMatch(install,/location.href\s*=|\.click\(\)/);
  assert.match(install,/showWidgetSetup/);assert.match(install,/data-widget-installed/);
  const landing=fs.readFileSync(path.join(__dirname,'../instalar.html'),'utf8');
  for(const name of ['inbox','calendar','pomodoro','streak'])assert.match(landing,new RegExp('setup-widget='+name));
  assert.match(landing,/setup-alarms=1/);
});
test('alarm setup requires consent and authenticated receipt, not a download or test click',()=>{
  assert.match(alarms,/data-alarm-consent>/);assert.doesNotMatch(alarms,/data-alarm-consent checked/);
  assert.match(alarms,/if\(!setup.querySelector\('\[data-alarm-consent\]'\).checked\)return/);
  assert.match(alarms,/if\(!response.ok\|\|!result.connected\)/);
  assert.match(alarms,/setupStage==='test'&&!ready/);
  assert.match(alarms,/data-alarm-stage="install"/);assert.match(alarms,/data-alarm-stage="connect" hidden/);
  assert.match(alarms,/signal:AbortSignal.timeout\(12000\)/);
});

test('alarm stages show only the next action and never unlock connection without consent',()=>{
  const stages=['install','connect','test'].map(stage=>({dataset:{alarmStage:stage},hidden:false}));
  const steps=['install','connect','test'].map(step=>({dataset:{alarmStep:step},setAttribute(){},removeAttribute(){}}));
  const controls=new Map();
  const node=s=>{if(!controls.has(s))controls.set(s,{checked:false,disabled:false});return controls.get(s);};
  let ready=false;
  const c={setupStage:'install',nativeMessage:'',nativeConnecting:false,nativeReady:()=>ready,
    setup:{dataset:{},querySelector:node,querySelectorAll:s=>s==='[data-alarm-stage]'?stages:steps},
    document:{querySelectorAll:()=>[]}};
  vm.createContext(c);
  vm.runInContext(alarms.slice(alarms.indexOf('  function renderNativeStatus('),alarms.indexOf('  async function connectWindows(')),c);
  const visible=()=>stages.filter(s=>!s.hidden).map(s=>s.dataset.alarmStage);
  c.renderNativeStatus();assert.deepEqual(visible(),['install']);
  c.setupStage='test';c.renderNativeStatus();assert.deepEqual(visible(),['connect']);
  assert.equal(node('[data-alarm-activate]').disabled,true);
  node('[data-alarm-consent]').checked=true;c.renderNativeStatus();assert.equal(node('[data-alarm-activate]').disabled,false);
  c.nativeConnecting=true;c.renderNativeStatus();assert.equal(node('[data-alarm-activate]').disabled,true);
  ready=true;c.setupStage='test';c.renderNativeStatus();assert.deepEqual(visible(),['test']);
});
