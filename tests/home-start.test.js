const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../scripts/home-start.js'),'utf8');
function fixture() {
  class Node {
    constructor(){this.children=[];this.hidden=false;this.dataset={};this.events={};}
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(...nodes){this.children=nodes;}
    addEventListener(name,fn){this.events[name]=fn;}
    querySelectorAll(){return this.buttons||[];}
  }
  const empty=new Node(),inbox=new Node(),courses=new Node(),suggestions=new Node(),events={},values={};
  suggestions.buttons=['focus','classes'].map(key=>{const node=new Node();node.dataset.homeAddTool=key;return node;});
  const nodes={'[data-home-empty]':empty,'[data-dashboard-agenda]':inbox,'[data-home-classes-list]':courses,'[data-home-suggestions]':suggestions};
  const state={user:null,synced:true,drive:{ready:true,connected:false},model:null,failed:false,opened:null,layout:{preset:'light',visible:{focus:false,classes:false}}};
  const window={EstudiemosAccount:{getUser:()=>state.user,isSynchronized:()=>state.synced},EstudiemosDriveLibrary:{status:()=>state.drive},EstudiemosClasses:{snapshot:()=>state.model,status:()=>({failed:state.failed}),open:value=>{state.opened=value}},EstudiemosHomeLayout:{read:()=>state.layout},addEventListener:(name,fn)=>{events[name]=fn;}};
  vm.runInNewContext(source,{window,document:{body:{classList:{contains:()=>true}},querySelector:key=>nodes[key],createElement:()=>new Node(),addEventListener(){}},localStorage:{getItem:key=>values[key]||null},requestAnimationFrame:fn=>{fn();return 1;},cancelAnimationFrame(){}});
  return {state,empty,inbox,courses,suggestions,values,render:()=>events['estudiemos:cloud-restored']()};
}
test('an empty settled profile gets a welcome; saving a task restores the real Inbox',()=>{
  const f=fixture();assert.equal(f.empty.hidden,false);assert.equal(f.inbox.hidden,true);
  f.values.bandeja_agenda='[{"title":"Repasar"}]';f.render();assert.equal(f.empty.hidden,true);assert.equal(f.inbox.hidden,false);
});
test('welcome never replaces an account still restoring, a connected Drive, or scheduled dates',()=>{
  for(const kind of ['sync','classes-loading','drive-loading','drive-connected','weekly','class-calendar']) {
    const f=fixture();
    if(kind==='sync'){f.state.user={id:'student'};f.state.synced=false;}
    if(kind==='classes-loading')f.state.user={id:'student'};
    if(kind==='drive-loading')f.state.drive.ready=false;
    if(kind==='drive-connected')f.state.drive.connected=true;
    if(kind==='weekly')f.values.bandeja_horarios='[{"id":"slot"}]';
    if(kind==='class-calendar')f.state.model={classes:[],calendar:[{id:'exam'}]};
    f.render();assert.equal(f.empty.hidden,true,kind);assert.equal(f.inbox.hidden,false,kind);
  }
});
test('course rows use the existing snapshot, omit archived courses, and open the exact course',()=>{
  const f=fixture();f.state.user={id:'student'};f.state.model={classes:[{id:'one',title:'<img onerror=alert(1)>',institution:'Comisión 1'},{id:'old',archived:true}],calendar:[]};f.render();
  assert.equal(f.courses.children.length,1);const row=f.courses.children[0];assert.equal(row.children[1].children[0].textContent,'<img onerror=alert(1)>');
  row.events.click();assert.equal(f.state.opened.id,'one');
  f.render();assert.equal(f.courses.children[0],row,'Unchanged data does not destroy keyboard focus');
  f.state.user=null;f.state.model=null;f.render();assert.notEqual(f.courses.children[0],row,'Logout clears the private course list');
});
test('optional tools are suggested only on the new light preset and only while hidden',()=>{
  const f=fixture();assert.equal(f.suggestions.hidden,false);
  f.state.layout.visible={focus:true,classes:true};f.render();assert.equal(f.suggestions.hidden,true);
  f.state.layout={preset:'custom',visible:{focus:false,classes:false}};f.render();assert.equal(f.suggestions.hidden,true);
});
