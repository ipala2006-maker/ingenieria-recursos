const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('changing phase repaints the 3D ring even when its angle is unchanged',()=>{
  const source=read('scripts/timer-depth.js');
  const update=source.match(/return \{update\(\)\{([\s\S]*?)\},dispose\};/)[1];
  let scheduled=0;
  const context={angle:30,phase:'study',host:{dataset:{timerPhase:'study'}},dial:{style:{getPropertyValue:()=> '30deg'}},schedule:()=>scheduled++};
  vm.runInNewContext(`function update(){${update}}`,context);
  context.update();assert.equal(scheduled,0);
  context.host.dataset.timerPhase='break';context.update();assert.equal(scheduled,1);
  context.host.dataset.timerPhase='study';context.update();assert.equal(scheduled,2);
  assert.match(source,/timerPhase === 'break' \? '#fbbc04'/);
});

test('home, full timer, desktop and non-WebGL fallback all carry the break phase',()=>{
  assert.match(read('scripts/study-home.js'),/host\.dataset\.timerPhase = state\.phase/);
  assert.match(read('scripts/pomodoro.js'),/timerHost\.dataset\.timerPhase = state\.phase/);
  assert.match(read('scripts/desktop-widgets.js'),/dataset\.timerPhase=value\.phase/);
  assert.match(read('styles/interaction.css'),/\[data-timer-phase="break"\] \.pomodoro-ring__progress \{ stroke:#fbbc04/);
  assert.match(read('styles/widget-console.css'),/data-timer-phase="break".*conic-gradient\(#fbbc04/);
});
