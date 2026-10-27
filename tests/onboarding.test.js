const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../scripts/onboarding.js'), 'utf8');
const key = 'estudiemos_onboarding_v1';

function boot(initial = {}, url = 'https://estudiemos.example/') {
  const values = new Map(Object.entries(initial)), events = [], timers = [];
  const window = {addEventListener(){}, dispatchEvent:event => events.push(event.type)};
  const context = {
    window, URL, URLSearchParams, location:new URL(url), matchMedia:() => ({matches:false}),
    history:{state:null, replaceState(_state, _title, next) { context.location = new URL(next); }},
    localStorage:{getItem:name => values.get(name) ?? null, setItem:(name, value) => values.set(name, value)},
    document:{body:{classList:{contains:() => true}},currentScript:{src:'https://estudiemos.example/scripts/onboarding.js'},querySelector:() => null,addEventListener(){}},
    MutationObserver:class {observe(){} disconnect(){}},
    setTimeout:fn => {timers.push(fn); return timers.length;}, clearTimeout(){}, Date
  };
  vm.runInNewContext(source, context);
  return {api:window.EstudiemosOnboarding, values, context, events};
}

test('a fresh local installation queues its tour before other first-use prompts', () => {
  const {api, values} = boot();
  assert.equal(api.pending(), true);
  assert.equal(api.isActive(), false);
  assert.equal(values.has(key), false, 'Do not mark complete before showing it');
});

test('completed and skipped tours do not repeat on subsequent launches', () => {
  for (const status of ['completed','skipped','existing']) {
    const {api, values} = boot({[key]:JSON.stringify({version:1,status})});
    assert.equal(api.pending(), false);
    assert.equal(JSON.parse(values.get(key)).status, status);
  }
});

test('existing users are not interrupted by the update; their data stays untouched', () => {
  for (const entry of [
    ['estudiemos_cloud_user','saved-user-id'],
    ['estudiemos_pomodoro_streak',JSON.stringify({days:{'2026-10-23':30}})],
    ['estudiemos_pomodoro_streak',JSON.stringify({goal:{updatedAt:1}})],
    ['bandeja_agenda',JSON.stringify([{title:'Keep me'}])],
    ['bandeja_horarios',JSON.stringify([{title:'Maths'}])]
  ]) {
    const {api, values} = boot(Object.fromEntries([entry]));
    assert.equal(api.pending(), false);
    assert.equal(JSON.parse(values.get(key)).status, 'existing');
    assert.equal(values.get(entry[0]), entry[1]);
  }
});

test('manual replay overrides completion and removes only its query parameter', () => {
  const {api, context} = boot({[key]:JSON.stringify({status:'completed'})}, 'https://estudiemos.example/?tutorial=1&friend=keep#anchor');
  assert.equal(api.pending(), true);
  assert.equal(context.location.searchParams.has('tutorial'), false);
  assert.equal(context.location.searchParams.get('friend'), 'keep');
  assert.equal(context.location.hash, '#anchor');
});

test('malformed tutorial state fails open without breaking app startup', () => {
  for (const raw of ['{broken','null','[]','false']) assert.equal(boot({[key]:raw}).api.pending(), true);
});
test('a class invitation takes priority over the optional first-run tour', () => {
  const {api, values}=boot({},'https://estudiemos.example/#clase=ABCDEFGHJK');
  assert.equal(api.pending(),false);assert.equal(values.has(key),false);
});

test('new course and Drive-return links also defer the tour',()=>{
  for(const suffix of ['#materia=ABCDEFGHJK','?materias=1','?materia=ABCDEFGHJK','?uploadClass=fixture'])assert.equal(boot({},'https://estudiemos.example/'+suffix).api.pending(),false);
});

test('the tutorial has no network, timer commands, permissions, or account mutations', () => {
  assert.doesNotMatch(source, /\bfetch\s*\(|requestPermission\s*\(|\.signIn\s*\(|\.signOut\s*\(/);
  assert.doesNotMatch(source, /EstudiemosStudy\.(?:start|pause|reset|seek|configure)\s*\(/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /estudiemos:onboarding-finished/);
});

function exitFixture(reduced=false) {
  const calls={restored:0,removed:0,remembered:[],timers:[],events:[]};
  const context={active:true,busy:false,closing:false,pending:true,transitionVersion:0,exitTimer:0,resizeFrame:0,reduced:{matches:reduced},
    targetObserver:{disconnect(){}},restorePreview(){calls.restored++;},cancelAnimationFrame(){},clearTimeout(){},
    layer:{classList:{add(){}},close(){},remove(){calls.removed++;}},tour:{destroy(){}},remember:value=>calls.remembered.push(value),original:null,savedFocus:null,
    setTimeout(fn,delay){calls.timers.push({fn,delay});return calls.timers.length;},window:{dispatchEvent:event=>calls.events.push(event.type)},CustomEvent:class{constructor(type){this.type=type;}}};
  vm.createContext(context);const start=source.indexOf('  function finish(status)');
  vm.runInContext(source.slice(start,source.indexOf("  document.addEventListener('click', event => {",start)),context);
  return {context,calls};
}
test('dismissal closes the preview behind the tour before releasing first-use prompts',()=>{
  const {context,calls}=exitFixture();context.finish('skipped');
  assert.equal(context.active,true);assert.equal(context.pending,true);assert.equal(context.closing,true);
  assert.equal(calls.restored,1);assert.equal(calls.removed,0);assert.equal(calls.timers[0].delay,200);
  calls.timers[0].fn();assert.equal(context.active,false);assert.equal(context.pending,false);assert.equal(calls.removed,1);assert.deepEqual(calls.remembered,['skipped']);
});
test('a real alarm interrupts even during the exit fade, without marking the tour completed',()=>{
  const {context,calls}=exitFixture();context.finish('completed');context.finish('interrupted');
  assert.equal(context.active,false);assert.equal(calls.removed,1);assert.deepEqual(calls.remembered,[]);
  calls.timers[0].fn();assert.equal(calls.removed,1);assert.deepEqual(calls.remembered,[]);
});
test('reduced motion dismisses immediately instead of waiting for an invisible animation',()=>{
  const {context,calls}=exitFixture(true);context.finish('skipped');assert.equal(context.active,false);assert.equal(calls.removed,1);assert.equal(calls.timers.length,0);
});
test('a stale step cannot reopen or advance a later replay after its preview was interrupted',async()=>{
  let release;const frame=new Promise(resolve=>{release=resolve;}),calls={moved:0};
  const context={active:true,busy:false,closing:false,current:0,transitionVersion:0,steps:[{id:'welcome'},{id:'note',view:'inbox',preview:'note'}],reduced:{matches:true},
    layer:{open:true,classList:{add(){}},close(){this.open=false;},showModal(){this.open=true;}},restorePreview(){},navigate(){},openPreview:()=>()=>{},frame:()=>frame,settlePreview:async()=>{},tour:{moveTo(){calls.moved++;}},finish(){throw Error('A stale transition must not close the replay');}};
  vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  async function go(index)'),source.indexOf('  function next()')),context);
  const moving=context.go(1);assert.equal(context.layer.open,true,'Restacking finishes before the next animation frame');
  context.transitionVersion+=2;context.busy=false;release();await moving;assert.equal(calls.moved,0);assert.equal(context.current,0);assert.equal(context.busy,false);
});
