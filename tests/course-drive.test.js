const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../scripts/course-drive.js'),'utf8'),course={id:'00000000-0000-4000-8000-000000000001',title:'Algebra'},pdf=()=>new File(['%PDF-1.4\noriginal bytes'],'Guia.pdf',{type:'application/pdf'});
function boot(){
  let owner='alice';const calls=[],operations=[],listeners={},saved=new Map(),navigation=[];
  class Drive {
    constructor(options){this.options=options;this.userId=options.userId;this.rootId='root-folder';}
    check(){if(!this.options.isCurrent())throw Error('Account changed');}
    async initialize(){await this.options.getToken(false);this.check();}
    async folders(){return [{id:'chosen-folder',name:'Guías',parents:['root-folder']}];}
    async parent(id){this.check();if(id!=='chosen-folder')throw Error('Carpeta no autorizada');}
    async createFolder(title){operations.push(['folder',title]);return {id:'class-folder',appProperties:{estudiemosOwner:owner,estudiemosSpace:this.rootId}};}
    async patch(id,values){this.check();operations.push(['patch',id,values]);return {id,name:'Guia.pdf',...values};}
    async upload(file,parent){operations.push(['upload',await file.text(),parent]);this.check();return {id:'file-pdf',appProperties:{estudiemosOwner:owner,estudiemosSpace:this.rootId}};}
    async shareCoursePdf(id,classId,consent){this.check();operations.push(['share',id,classId,consent]);}
    async saveCourseMaterial(source,mode,parent,title){this.check();operations.push(['save',this.userId,{...source},mode,parent,title]);return {id:'personal-copy',name:title};}
  }
  const window={EstudiemosClassroomRules:require('../shared/classrooms'),dispatchEvent:()=>{},EstudiemosAccount:{getUser:()=>owner?{id:owner}:null,getSession:()=>owner?{access_token:'session-'+owner}:null},EstudiemosDriveFiles:{DriveFiles:Drive,openUrl:item=>'https://drive.google.com/file/d/'+item.id+'/view'},addEventListener:(type,fn)=>listeners[type]=fn};
  vm.runInNewContext(source,{window,URL,Date,File,CustomEvent,AbortController,setTimeout,clearTimeout,document:{currentScript:{src:'https://app.test/scripts/course-drive.js'},body:{classList:{contains:()=>true}}},location:{assign:url=>navigation.push(String(url))},sessionStorage:{setItem:(key,value)=>saved.set(key,value),getItem:key=>saved.get(key),removeItem:key=>saved.delete(key)},fetch:async(url,options)=>{calls.push({url:String(url),options});const action=new URL(url).searchParams.get('drive');return Response.json(action==='status'?{connected:true}:action==='token'?{accessToken:'short-lived-fixture',expiresAt:Date.now()+3600000}:{url:'https://accounts.google.com/o/oauth2/v2/auth?fixture=1'});}});
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

test('upload destination lists only authorized app folders and never uses another person Drive',async()=>{
  const h=boot(),destinations=await h.api.destinations(course);assert.equal(destinations.folders[0].name,'Estudiemos / Guías');
  await h.api.upload(pdf(),course,()=>{},'chosen-folder');assert.equal(h.operations.find(op=>op[0]==='upload')[2],'chosen-folder');assert.equal(h.operations.some(op=>op[0]==='folder'),false);
  await assert.rejects(h.api.upload(pdf(),course,()=>{},'foreign-folder'),/no autorizada/);
  assert.equal(h.operations.filter(op=>op[0]==='upload').length,1);assert.equal(h.operations.some(op=>op[0]==='share'),false);
});
test('connecting Drive carries only a fixed workspace context and course identifier, never stored tokens',async()=>{
  const h=boot();await h.api.connect(course.id);const body=JSON.parse(h.calls[0].options.body);assert.deepEqual(body,{context:'teacher',classId:course.id});assert.equal(new URL(h.navigation[0]).origin,'https://accounts.google.com');assert.doesNotMatch(JSON.stringify([...h.saved]),/accessToken|refreshToken|session-alice/);await assert.rejects(h.api.connect('https://attacker.test'),/materia/);
});
test('students choose copy or shortcut using only their own connection and no classroom writes',async()=>{
  const h=boot(),material={title:'Guia',url:'https://drive.google.com/file/d/SHARED_PDF/view'};
  for(const mode of ['copy','shortcut'])await h.api.save(material,course,mode,'chosen-folder');
  assert.deepEqual(h.operations.filter(op=>op[0]==='save').map(op=>[op[1],op[3],op[4]]),[['alice','copy','chosen-folder'],['alice','shortcut','chosen-folder']]);
  h.switchUser('bob');await h.api.save(material,course,'copy','chosen-folder');
  assert.equal(h.operations.filter(op=>op[0]==='save').at(-1)[1],'bob');
  assert.ok(h.calls.every(call=>/drive=(status|token)/.test(call.url)));
  assert.equal(h.saved.size,0);await assert.rejects(h.api.save({...material,url:'https://evil.test/file'},course,'copy'));
});
test('OAuth returns to the same material without copying automatically or carrying tokens in the pending intent',async()=>{
  const h=boot(),materialId='10000000-0000-4000-8000-000000000001';
  await h.api.connect(course.id,materialId);assert.equal(h.api.resumeSave(course.id),materialId);assert.equal(h.api.resumeSave(course.id),'');
  assert.equal(h.operations.length,0);
  await h.api.connect(course.id,materialId);h.switchUser('bob');assert.equal(h.api.resumeSave(course.id),'');
});
