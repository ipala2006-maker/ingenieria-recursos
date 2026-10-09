const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../scripts/pomodoro.js'),'utf8');

function floatingClock(remaining=3300) {
  let updates=0,writes=0;
  const time={get textContent(){return '55:00';},set textContent(value){this.value=value;writes++;}};
  const label={},minutes={},minus={dataset:{pipAdjust:'-1'}},plus={dataset:{pipAdjust:'1'}};
  const nodes={'[data-pip-time]':time,'[data-pip-label]':label,'[data-pip-remaining]':minutes};
  const context={state:{running:false},alarmActive:false,pipDialPreview:null,MAX_MINUTES:59,
    getPipDocument:()=>({querySelector:s=>nodes[s],querySelectorAll:()=>[minus,plus]}),
    remainingSeconds:()=>remaining,pipDial:{update:()=>updates++}};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  function renderPipTimer('),source.indexOf('  function getPipDocument()')),context);
  return {context,time,label,minutes,minus,plus,updates:()=>updates,writes:()=>writes};
}

test('floating ticks keep stable time text and CSS-sized numbers with accessible minute limits',()=>{
  const t=floatingClock();t.context.renderPipTimer('55:00');
  assert.equal(t.writes(),0,'unchanged digits are not replaced on every tick');
  assert.equal(t.label.textContent,'En pausa');assert.equal(t.minutes.textContent,'55 min');
  assert.equal(t.updates(),1);assert.equal(t.minus.disabled,false);assert.equal(t.plus.disabled,false);
  const min=floatingClock(60);min.context.renderPipTimer('01:00');assert.equal(min.minus.disabled,true);
  const max=floatingClock(3540);max.context.renderPipTimer('59:00');assert.equal(max.plus.disabled,true);
});

test('floating dial previews do not change shared time and show current running status',()=>{
  const t=floatingClock();t.context.pipDialPreview=1800;t.context.state.running=true;
  t.context.renderPipTimer('55:00');
  assert.equal(t.time.value,'30:00');assert.equal(t.label.textContent,'En curso');
  assert.equal(t.context.remainingSeconds(),3300);
  t.context.alarmActive=true;t.context.renderPipTimer('55:00');assert.equal(t.label.textContent,'Finalizado');
});

test('closed floating windows do not render or touch detached controls',()=>{
  const t=floatingClock();t.context.getPipDocument=()=>null;
  t.context.renderPipTimer('55:00');assert.equal(t.updates(),0);assert.equal(t.writes(),0);
});

function floatingOpening(requestWindow) {
  let built=0;
  const context={pipWindow:null,pipOpening:false,pipDial:null,pipDialPreview:null,
    supportsMobileFloating:()=>false,window:{documentPictureInPicture:{requestWindow}},
    prepareAudio:()=>{},buildFloatingTimer:()=>built++,closeMenu:()=>{},render:()=>{}};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  async function openFloatingTimer()'),source.indexOf('  function buildFloatingTimer(')),context);
  return {context,built:()=>built};
}

test('double-clicking popout opens one window and delayed pagehide cannot erase a new one',async()=>{
  let resolve,requests=0,callback;
  const t=floatingOpening(()=>{requests++;return new Promise(done=>{resolve=done;});});
  const first=t.context.openFloatingTimer();await t.context.openFloatingTimer();
  assert.equal(requests,1);
  const window={closed:false,addEventListener:(event,fn)=>{callback=fn;}};
  resolve(window);await first;
  assert.equal(t.built(),1);assert.equal(t.context.pipOpening,false);
  t.context.pipWindow={closed:false};callback();assert.notEqual(t.context.pipWindow,null);
  t.context.pipWindow=window;t.context.pipDial={};t.context.pipDialPreview=60;callback();
  assert.equal(t.context.pipWindow,null);assert.equal(t.context.pipDial,null);assert.equal(t.context.pipDialPreview,null);
});

test('a rejected popout clears the opening latch so the user can retry',async()=>{
  const t=floatingOpening(()=>Promise.reject(new Error('no window')));
  await t.context.openFloatingTimer();assert.equal(t.context.pipOpening,false);assert.equal(t.context.pipWindow,null);
});
