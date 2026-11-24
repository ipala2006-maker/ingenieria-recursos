const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../scripts/pomodoro.js'),'utf8');

function alarm(){
  let repeating=0,notes=0,notifications=0;
  const c={alarmGeneration:0,alarmActive:false,
    stopAlarm(){c.alarmGeneration++;c.alarmActive=false;},
    startAlarm(){repeating++;c.alarmActive=true;},
    prepareAudio:async()=>({state:'running'}),playAlarmPattern:()=>notes++,
    showDeviceNotification:()=>notifications++,navigator:{},document:{title:'Estudiemos'},setTimeout:()=>0};
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('  function notifyCompletion('),source.indexOf('  async function registerDeviceSupport(')),c);
  return {c,repeating:()=>repeating,notes:()=>notes,notifications:()=>notifications};
}

test('automatic transitions sound once without leaving the next countdown labeled finished',async()=>{
  const a=alarm();
  a.c.notifyCompletion('study',true);
  await Promise.resolve();await Promise.resolve();
  assert.equal(a.c.alarmActive,false);assert.equal(a.repeating(),0);
  assert.equal(a.notes(),1);assert.equal(a.notifications(),1);
});

test('pausing or a newer transition cancels a pending transition sound',async()=>{
  const a=alarm();let finish;
  a.c.prepareAudio=()=>new Promise(resolve=>{finish=resolve;});
  a.c.notifyCompletion('break',true);a.c.stopAlarm();
  finish({state:'running'});await Promise.resolve();await Promise.resolve();
  assert.equal(a.notes(),0);assert.equal(a.c.alarmActive,false);
});

test('manual continuation retains the completion alarm and audio errors cannot stop a new block',async()=>{
  const a=alarm();a.c.notifyCompletion('study',false);
  assert.equal(a.c.alarmActive,true);assert.equal(a.repeating(),1);
  a.c.prepareAudio=async()=>{throw Error('audio blocked');};
  a.c.notifyCompletion('break',true);
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert.equal(a.c.alarmActive,false);assert.equal(a.notes(),0);assert.equal(a.notifications(),2);
});
