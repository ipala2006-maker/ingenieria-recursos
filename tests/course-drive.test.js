const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../scripts/course-drive.js'),'utf8'),course={id:'00000000-0000-4000-8000-000000000001',title:'Algebra'},pdf=()=>new File(['%PDF-1.4\noriginal bytes'],'Guia.pdf',{type:'application/pdf'});
function boot(){
  let owner='alice';const calls=[],operations=[],listeners={},saved=new Map(),navigation=[];
  class Drive {
    constructor(options){this.options=options;this.userId=options.userId;this.rootId='root-folder';}
    check(){if(!this.options.isCurrent())throw Error('Account changed');}
    async initialize(){await this.options.getToken(false);this.check();}
    async folders(){return [];}
    async createFolder(title){operations.push(['folder',title]);return {id:'class-folder',appProperties:{estudiemosOwner:owner,estudiemosSpace:this.rootId}};}
    async patch(id,values){this.check();operations.push(['patch',id,values]);return {id,name:'Guia.pdf',...values};}
    async upload(file,parent){operations.push(['upload',await file.text(),parent]);this.check();return {id:'file-pdf',appProperties:{estudiemosOwner:owner,estudiemosSpace:this.rootId}};}
    async shareCoursePdf(id,classId,consent){this.check();operations.push(['share',id,classId,consent]);}
  }
  const window={EstudiemosAccount:{getUser:()=>owner?{id:owner}:null,getSession:()=>owner?{access_token:'session-'+owner}:null},EstudiemosDriveFiles:{DriveFiles:Drive,openUrl:item=>'https://drive.google.com/file/d/'+item.id+'/view'},addEventListener:(type,fn)=>listeners[type]=fn};
  vm.runInNewContext(source,{window,URL,Date,File,AbortController,setTimeout,clearTimeout,document:{currentScript:{src:'https://app.test/scripts/course-drive.js'},body:{classList:{contains:()=>true}}},location:{assign:url=>navigation.push(String(url))},sessionStorage:{setItem:(key,value)=>saved.set(key,value)},fetch:async(url,options)=>{calls.push({url:String(url),options});const action=new URL(url).searchParams.get('drive');return Response.json(action==='status'?{connected:true}:action==='token'?{accessToken:'short-lived-fixture',expiresAt:Date.now()+3600000}:{url:'https://accounts.google.com/o/oauth2/v2/auth?fixture=1'});}});
  return {api:window.EstudiemosCourseDrive,calls,operations,saved,navigation,switchUser(id){owner=id;listeners['estudiemos:account-change']();}};
}
test('course uploads validate original PDF bytes before accessing Drive, without silently sharing them',async()=>{
  const h=boot();for(const file of [new File(['not pdf'],'Guia.pdf'),new File(['%PDF-'],'Run.exe'),new File([],'Empty.pdf')])await assert.rejects(h.api.upload(file,course),/PDF/);assert.equal(h.calls.length,0);
  const result=await h.api.upload(pdf(),course);assert.equal(result.id,'file-pdf');assert.deepEqual(h.operations.find(op=>op[0]==='upload'),['upload','%PDF-1.4\noriginal bytes','class-folder']);assert.ok(h.operations.filter(op=>op[0]==='patch').every(op=>op[2].appProperties.estudiemosCourse===course.id));assert.equal(h.operations.some(op=>op[0]==='share'),false);
  assert.ok(h.calls.every(call=>new URL(call.url).origin==='https://app.test'));assert.equal(h.saved.size,0,'No tokens or file metadata are persisted by upload');
});
test('changing accounts drops the in-memory Google token and initializes a new account-bound library',async()=>{
  const h=boot();await h.api.upload(pdf(),course);h.switchUser('bob');await h.api.upload(pdf(),course);const tokens=h.calls.filter(call=>call.url.includes('drive=token'));assert.equal(tokens.length,2);assert.equal(tokens[0].options.headers.Authorization,'Bearer session-alice');assert.equal(tokens[1].options.headers.Authorization,'Bearer session-bob');
});
test('connecting Drive carries only a fixed workspace context and course identifier, never stored tokens',async()=>{
  const h=boot();await h.api.connect(course.id);const body=JSON.parse(h.calls[0].options.body);assert.deepEqual(body,{context:'teacher',classId:course.id});assert.equal(new URL(h.navigation[0]).origin,'https://accounts.google.com');assert.doesNotMatch(JSON.stringify([...h.saved]),/accessToken|refreshToken|session-alice/);await assert.rejects(h.api.connect('https://attacker.test'),/materia/);
});
