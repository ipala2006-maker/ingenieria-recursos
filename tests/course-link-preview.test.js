const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module'),rules=require('../shared/classrooms');
const root=path.resolve(__dirname,'..'),code='ABCDEFGHJK';
const preview={title:'Álgebra · Comisión 2',teacherName:'Ana',institution:'Universidad',calendar:[{id:'10000000-0000-4000-8000-000000000001',classId:'00000000-0000-4000-8000-000000000001',className:'Álgebra',timezone:'UTC',data:{title:'Primer parcial',date:'2026-11-02',start:'08:00',end:'10:00',allDay:false,type:'Examen',color:'amber',repeat:'none',days:[],endDate:'',note:'Private note'}}],members:['private'],materials:['private'],access_token:'never-public'};
function boot(model=preview,error=''){
  const file=path.join(root,'api/_lib/course-invitation.js'),localRequire=createRequire(file),calls=[];
  const context={module:{exports:{}},__dirname:path.dirname(file),require(name){
    if(name==='./request-security')return {enforceRateLimit:async()=>true};
    if(name==='./course-preview')return async value=>localRequire(name)(value,async(url,options)=>{calls.push({url,options});if(error)throw Error(error);return model;});
    return localRequire(name);
  }};vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
  return {handler:context.module.exports,calls};
}
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},send(body){this.body=body;return this;},json(body){this.body=body;return this;}});

test('friendly class links render a real minimal invitation and WhatsApp metadata without duplicating the lookup',async()=>{
  const h=boot({...preview,email:'owner@example.test',team:{owner:{email:'owner@example.test'},delegates:[{email:'delegate@example.test'}]}}),res=response();await h.handler({method:'GET',query:{courseInvitation:code},headers:{host:'attacker.test'}},res);
  assert.equal(res.code,200);assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,'/rest/v1/rpc/classroom_invitation');
  assert.match(res.body,/og:title" content="Álgebra · Comisión 2 · Invitación en Estudiemos/);assert.match(res.body,/og:url" content="https:\/\/estudiemos-app.vercel.app\/materia\/ABCDEFGHJK/);
  assert.match(res.body,/data-course-preview=/);assert.match(res.body,/Primer parcial/);assert.match(res.body,/Unirme a la cátedra/);assert.match(res.body,/og:image:width" content="1200/);
  assert.match(res.body,/twitter:title" content="Álgebra · Comisión 2/);assert.match(res.body,/twitter:image" content="https:\/\/estudiemos-app.vercel.app\/assets\/course-invite-preview.png/);
  assert.match(res.body,/al:android:url" content="estudiemos:\/\/open\?materia=ABCDEFGHJK/);assert.match(res.body,/al:android:package" content="com.estudiemos.app/);
  assert.ok(res.body.indexOf('data-course-join')<res.body.indexOf('data-course-invite-dates'),'Join action comes before the date preview');
  assert.doesNotMatch(res.body,/heroTitle|data-scene=|widget-gallery__item/,'No hidden promotional content or media is served with a class invitation');
  assert.doesNotMatch(res.body,/Private note|never-public|attacker.test|"members"|"materials"|owner@example.test|delegate@example.test|"team"|"email"/);
  assert.match(res.body,/<script src="\/shared\/course-invite-view.js/);assert.equal(res.headers['Cache-Control'],'private, no-store');assert.equal(res.headers['Referrer-Policy'],'no-referrer');
  assert.equal(res.headers['Content-Security-Policy'],require('../vercel.json').headers.find(rule=>rule.source==='/(.*)').headers.find(h=>h.key==='Content-Security-Policy').value);
  assert.equal(rules.invitation('https://estudiemos-app.vercel.app/materia/'+code,'https://app.test'),code);
  assert.equal(rules.invitation('https://attacker.test/materia/'+code,'https://app.test'),'');
});

test('invitation identity and embedded preview safely escape user text',async()=>{
  const h=boot({...preview,title:'<script>alert("XSS")</script>',teacherName:'A & B " quoted'}),res=response();await h.handler({method:'GET',query:{courseInvitation:code}},res);
  assert.equal(res.code,200);assert.doesNotMatch(res.body,/<script>alert|content="A & B "/);assert.match(res.body,/&lt;script&gt;/);
  assert.match(res.body,/A &amp; B &quot; quoted/);
});

test('expired links, transient errors, HEAD, repeated codes and mutations retain safe recovery',async()=>{
  for(const value of [null,[],[code,code],'<script>',code+'x']){const h=boot(),res=response();await h.handler({method:'GET',query:{courseInvitation:value}},res);assert.equal(res.code,404);assert.equal(h.calls.length,0);}
  for(const [error,status]of[['INVALID_CODE',404],['credentials should never be displayed',503]]){const h=boot(preview,error),res=response();await h.handler({method:'GET',query:{courseInvitation:code}},res);assert.equal(res.code,status);assert.doesNotMatch(res.body,/credentials should never|access_token/);assert.match(res.body,/Abrir Estudiemos|Unirme a la cátedra/);}
  const h=boot(),post=response();await h.handler({method:'POST',query:{courseInvitation:code}},post);assert.equal(post.code,405);assert.equal(h.calls.length,0);
  const head=response();await h.handler({method:'HEAD',query:{courseInvitation:code}},head);assert.equal(head.code,200);assert.equal(head.body,'');
});

test('lowercase links normalize and temporary failures offer a safe retry',async()=>{
  const h=boot(),res=response();await h.handler({method:'GET',query:{courseInvitation:code.toLowerCase()}},res);
  assert.equal(res.code,200);assert.match(res.body,/\/materia\/ABCDEFGHJK/);
  const broken=boot(preview,'upstream unavailable'),failure=response();await broken.handler({method:'GET',query:{courseInvitation:code}},failure);
  assert.equal(failure.code,503);assert.equal(failure.headers['Retry-After'],'30');assert.match(failure.body,/data-course-retry/);
  const invalid=response();await h.handler({method:'GET',query:{courseInvitation:'bad'}},invalid);
  assert.equal(invalid.headers['Content-Type'],'text/html; charset=utf-8');assert.match(invalid.body,/Invitación no disponible/);assert.doesNotMatch(invalid.body,/data-course-retry|al:android:url/);
  const view=require('../shared/course-invite-view');assert.doesNotMatch(view.content(null,{loading:true,status:'Preparing'}),/data-course-retry/);
});
