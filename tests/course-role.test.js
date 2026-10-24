const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../scripts/course-role.js'),'utf8');
function boot({values=new Map(),session=new Map(),teacher=false,url='https://app.test/',entry=false,blocked=false}={}){
  const navigation=[],events=[],storage=map=>({getItem:key=>{if(blocked)throw Error('blocked');return map.get(key)||null;},setItem:(key,value)=>{if(blocked)throw Error('blocked');map.set(key,value);},removeItem:key=>map.delete(key)});
  const window={dispatchEvent:event=>events.push(event.detail.role)};
  vm.runInNewContext(source,{window,URL,Date,Map,CustomEvent:class{constructor(type,options){Object.assign(this,{type,...options});}},document:{currentScript:{src:'https://app.test/scripts/course-role.js',hasAttribute:()=>entry},body:{classList:{contains:()=>teacher}}},location:{href:url,assign:url=>navigation.push(String(url)),replace:url=>navigation.push(String(url))},localStorage:storage(values),sessionStorage:storage(session)});
  return {api:window.EstudiemosCourseRole,values,session,navigation,events};
}
test('role selection is local, per account, reversible and never grants course permissions',()=>{
  const h=boot();assert.equal(h.api.get(),'');h.api.bind({id:'alice'});h.api.choose('teacher');assert.equal(h.api.get(),'teacher');assert.deepEqual(h.navigation,['https://app.test/materias.html']);
  h.api.bind({id:'bob'});assert.equal(h.api.get(),'');h.api.set('student');h.api.set('admin');assert.equal(h.api.get(),'student');h.api.bind({id:'alice'});assert.equal(h.api.get(),'teacher');h.api.bind(null);assert.equal(h.api.get(),'');
});
test('explicit guest choice survives sign-in once and expires instead of leaking to later accounts',()=>{
  const h=boot();h.api.set('student');h.api.bind({id:'alice'});assert.equal(h.api.get(),'student');assert.equal(h.session.size,0);h.api.bind({id:'bob'});assert.equal(h.api.get(),'');
  h.session.set('estudiemos_course_role:pending',JSON.stringify({role:'teacher',expires:1}));h.api.bind({id:'charlie'});assert.equal(h.api.get(),'');
});
test('saved teachers launch in their workspace but auth, invitation and widget links are preserved',()=>{
  const values=new Map([['estudiemos_course_role:owner','alice'],['estudiemos_course_role:alice','teacher']]);
  assert.equal(boot({values,entry:true}).navigation[0],'https://app.test/materias.html');
  for(const suffix of ['?materias=1','#materia=ABCDEFGHJK','?pomodoro=1','#access_token=fixture'])assert.deepEqual(boot({values,entry:true,url:'https://app.test/'+suffix}).navigation,[]);
  assert.deepEqual(boot({teacher:true}).navigation,[]);const h=boot({teacher:true});h.api.choose('student');assert.equal(h.navigation[0],'https://app.test/?materias=1');
});
test('storage restrictions do not make the role chooser unusable',()=>{const h=boot({blocked:true});h.api.set('student');assert.equal(h.api.get(),'student');});
test('teacher entry loads auth and course tools only, not study timers or personal cloud data',()=>{
  const html=fs.readFileSync(require.resolve('../materias.html'),'utf8');assert.doesNotMatch(html,/scripts\/(?:global-search|pomodoro|dashboard|onboarding|inbox-alarms)\.js/);assert.match(html,/teacher-workspace/);
});
