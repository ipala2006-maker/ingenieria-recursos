const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../scripts/home-customizer.js'),'utf8');
const finish=source.slice(source.indexOf('  function finish(event)'),source.indexOf('  function wire(b)'));
function fixture(overrides={}){
  const calls={update:0,cleanup:0,applied:[],saved:[]};
  const gesture={id:7,key:'focus',kind:'resize',mobile:true,width:390,height:844,start:{original:true},value:{resized:true},x:100,y:200,pointer:{x:110,y:210},layout:null};
  const context={gesture,frame:1,mobile:{matches:true},innerWidth:390,innerHeight:844,
    cancelAnimationFrame(){},select(){},
    updateGesture(){calls.update++;calls.pointer={...context.gesture.pointer};},
    cleanup(value){assert.equal(context.gesture,null);assert.equal(value,gesture);calls.cleanup++;},
    apply(...args){calls.applied.push(args);},save(...args){calls.saved.push(args);},...overrides};
  vm.createContext(context);vm.runInContext(finish,context);
  return {context,gesture,calls};
}
for(const type of ['pointercancel','lostpointercapture']){
  test(type+' rolls back without calculating or storing a partial drag',()=>{
    const {context,gesture,calls}=fixture();
    context.finish({type,pointerId:7});
    assert.equal(calls.update,0);assert.equal(calls.saved.length,0);assert.equal(calls.cleanup,1);
    assert.equal(calls.applied[0][0],gesture.start);assert.equal(calls.applied[0][1],true);
  });
}
for(const overrides of [{mobile:{matches:false}},{innerWidth:844},{innerHeight:390}]){
  test('changed viewport cancels before reading old layout geometry: '+JSON.stringify(overrides),()=>{
    const {context,gesture,calls}=fixture(overrides);
    context.finish({type:'pointerup',pointerId:7,clientX:130,clientY:250});
    assert.equal(calls.update,0);assert.equal(calls.saved.length,0);assert.equal(calls.applied[0][0],gesture.start);
  });
}
test('a completed touch uses the release coordinates and saves once',()=>{
  const {context,gesture,calls}=fixture();
  context.finish({type:'pointerup',pointerId:7,clientX:130,clientY:250,altKey:true});
  assert.equal(calls.update,1);assert.deepEqual(calls.pointer,{x:130,y:250,snap:false});
  assert.equal(calls.saved.length,1);assert.equal(calls.saved[0][0],gesture.value);assert.equal(calls.saved[0][1],gesture.start);
  context.finish({type:'lostpointercapture',pointerId:7});
  assert.equal(calls.cleanup,1);assert.equal(calls.saved.length,1);
});
test('a second finger cannot finish or cancel the active adjustment',()=>{
  const {context,gesture,calls}=fixture();
  context.finish({type:'pointercancel',pointerId:8});
  assert.equal(context.gesture,gesture);assert.equal(calls.update,0);assert.equal(calls.cleanup,0);assert.equal(calls.saved.length,0);
});
