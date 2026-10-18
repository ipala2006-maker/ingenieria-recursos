const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function harness() {
  const data=new Map(),events=[],native=[];
  const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  const window={EstudiemosTimetableRules:require('../shared/timetable'),EstudiemosAndroid:{postMessage:message=>native.push(JSON.parse(message))},dispatchEvent:event=>events.push(event.detail.key)};
  const document={currentScript:{src:'https://example.test/scripts/timetable.js'},head:{appendChild(){}},createElement:()=>({})};
  const source=fs.readFileSync(path.join(__dirname,'../scripts/timetable.js'),'utf8').replace('  window.EstudiemosTimetable = Object.freeze({open});','  window.plannerTest={commit}; return;');
  vm.runInNewContext(source,{window,document,localStorage:storage,URL,CustomEvent:class {constructor(type,options){this.detail=options.detail;}}});
  return {commit:window.plannerTest.commit,data,events,native,storage};
}
test('calendar conversion writes both complete lists before broadcasting and forwards only agenda to Android',()=>{
  const h=harness(),notes=[{id:'one',title:'Actividad',date:'2026-10-19',color:'teal',alarm:null}];
  h.data.set('bandeja_horarios','[{"id":"one"}]');
  h.commit({bandeja_agenda:notes,bandeja_horarios:[]});
  assert.deepEqual(JSON.parse(h.data.get('bandeja_agenda')),notes);assert.equal(h.data.get('bandeja_horarios'),'[]');
  assert.deepEqual(h.events,['bandeja_agenda','bandeja_horarios']);assert.deepEqual(h.native,[{type:'agenda-sync',items:notes}]);
});
test('a failed second write restores both original lists and emits no sync or native alarm update',()=>{
  const h=harness();
  h.data.set('bandeja_agenda','[{"id":"keep"}]');h.data.set('bandeja_horarios','[]');h.data.set('estudiemos_pomodoro_streak','preserve progress');
  const before=[...h.data],set=h.storage.setItem;let failed=false;
  h.storage.setItem=(key,value)=>{if(key==='bandeja_horarios'&&!failed){failed=true;throw new Error('Quota');}set(key,value);};
  assert.throws(()=>h.commit({bandeja_agenda:[],bandeja_horarios:[{id:'new'}]}),/Quota/);
  assert.deepEqual([...h.data],before);assert.deepEqual(h.events,[]);assert.deepEqual(h.native,[]);
});
