const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module'),{PGlite}=require('@electric-sql/pglite');
const rules=require('../shared/classrooms');
const root=path.resolve(__dirname,'..'),sql=fs.readFileSync(path.join(root,'supabase/classrooms.sql'),'utf8');
const ids=[1,2,3,4].map(n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
const base={title:'Física',teacherName:'Profesora Ana',institution:'Escuela piloto',timezone:'UTC',color:'teal',code:'ABCDEFGHJK'};
const activity={title:'Parcial',date:'2026-10-26',start:'08:00',end:'10:00',allDay:false,type:'Examen',color:'amber',note:'Aula 2',repeat:'none',days:[],endDate:''};
async function database(){const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create table friend_profiles(user_id uuid primary key,username text);');for(const id of ids)await db.query('insert into auth.users values($1,$2,now())',[id,id+'@example.test']);await db.exec(sql);return db;}
const call=async(db,user,action='state',data={})=>(await db.query('select classroom_action($1,$2,$3) as data',[user,action,data])).rows[0].data;
const create=async(db,user=ids[0],data={})=>call(db,user,'create',{...base,...data});

test('classes enroll by code once, remain private, and publish shared dates without personal task copies',async()=>{
  const db=await database();try{
    const [teacher,student,other]=ids,created=await create(db),id=created.selected;
    assert.equal(created.classes.length,1);assert.equal(created.classes[0].role,'teacher');assert.equal(created.classes[0].code,base.code);
    assert.deepEqual((await call(db,student)).classes,[]);await assert.rejects(call(db,student,'detail',{id}),/CLASS_UNAVAILABLE/);
    const revision=created.revision;assert.deepEqual(await call(db,teacher,'state',{revision}),{revision,unchanged:true});
    const joined=await call(db,student,'join',{code:base.code});assert.equal(joined.classes[0].role,'student');assert.equal(joined.classes[0].code,null);assert.equal(joined.classes[0].memberCount,1);assert.deepEqual(joined.detail.members,[]);
    assert.equal((await call(db,student,'join',{code:base.code})).classes[0].memberCount,1);
    await call(db,other,'join',{code:base.code});
    const itemId='10000000-0000-4000-8000-000000000001';
    const published=await call(db,teacher,'event_save',{id,itemId,event:activity});assert.notEqual(published.revision,revision);
    const studentState=await call(db,student);assert.equal(studentState.calendar.length,1);assert.equal(studentState.calendar[0].data.title,'Parcial');assert.equal(studentState.calendar[0].classId,id);
    const events=rules.occurrences(studentState,'2026-10-26');assert.equal(events[0].readOnly,true);assert.equal(events[0].subject,'Física');assert.equal(events[0].classId,id);assert.equal(events[0].scheduleId,undefined);
    await call(db,teacher,'event_save',{id,itemId,event:{...activity,title:'Parcial reprogramado',date:'2026-10-27'}});
    const updated=await call(db,student);assert.equal(updated.calendar.length,1);assert.equal(rules.occurrences(updated,'2026-10-26').length,0);assert.equal(rules.occurrences(updated,'2026-10-27')[0].title,'Parcial reprogramado');
    const roster=await call(db,teacher,'detail',{id});assert.equal(roster.members.length,2);assert.ok(!JSON.stringify(roster).includes('@example.test'));
    assert.ok(!JSON.stringify(await call(db,student,'detail',{id})).includes(other));
    const beforeCascade=(await call(db,teacher)).revision;await db.query('delete from classroom_members where class_id=$1 and user_id=$2',[id,other]);assert.notEqual((await call(db,teacher)).revision,beforeCascade,'Out-of-band membership changes also invalidate the conditional cache');
    await db.exec(sql);assert.equal((await call(db,teacher)).calendar.length,1,'Migration reruns preserve content');
  }finally{await db.close();}
});

test('only the owner changes content; membership, rotation, archive and leaving revoke access correctly',async()=>{
  const db=await database();try{
    const [teacher,student,outsider]=ids,{selected:id}=await create(db);await call(db,student,'join',{code:base.code});
    const itemId='10000000-0000-4000-8000-000000000001';
    for(const user of [student,outsider])for(const action of ['update','rotate','archive','event_save','event_remove','material_save','material_remove','member_remove'])await assert.rejects(call(db,user,action,{...base,id,itemId,event:activity,material:{title:'Notas',url:'https://drive.google.com/file/d/FILE_123/view'},archived:true}),/CLASS_UNAVAILABLE/);
    await call(db,teacher,'event_save',{id,itemId,event:activity});
    await call(db,teacher,'material_save',{id,itemId,material:{title:'Apuntes',url:'https://drive.google.com/file/d/FILE_123/view'}});
    assert.equal((await call(db,student,'detail',{id})).materials[0].title,'Apuntes');
    await call(db,teacher,'rotate',{id,code:'KLMNPQRSTU'});await assert.rejects(call(db,outsider,'join',{code:base.code}),/INVALID_CODE/);
    assert.equal((await call(db,student)).classes.length,1,'Rotation keeps enrolled students');
    await call(db,teacher,'archive',{id,archived:true});assert.deepEqual((await call(db,student)).calendar,[]);await assert.rejects(call(db,outsider,'join',{code:'KLMNPQRSTU'}),/INVALID_CODE/);
    await assert.rejects(call(db,teacher,'event_save',{id,itemId,event:activity}),/CLASS_ARCHIVED/);
    await call(db,teacher,'archive',{id,archived:false});assert.equal((await call(db,student)).calendar.length,1);
    await call(db,student,'leave',{id});assert.deepEqual((await call(db,student)).classes,[]);await assert.rejects(call(db,student,'detail',{id}),/CLASS_UNAVAILABLE/);
    await call(db,student,'join',{code:'KLMNPQRSTU'});await call(db,teacher,'member_remove',{id,itemId:student});await assert.rejects(call(db,student,'detail',{id}),/CLASS_UNAVAILABLE/);
  }finally{await db.close();}
});

test('SQL denies direct table/RPC access and protects cross-class IDs and unverified enrollments',async()=>{
  const db=await database();try{
    const {selected:id}=await create(db),{selected:other}=await create(db,ids[1],{code:'KLMNPQRSTU'}),itemId='10000000-0000-4000-8000-000000000001';
    await call(db,ids[1],'event_save',{id:other,itemId,event:activity});await assert.rejects(call(db,ids[0],'event_save',{id,itemId,event:activity}),/CLASS_UNAVAILABLE/);
    await db.query('update auth.users set email_confirmed_at=null where id=$1',[ids[2]]);await assert.rejects(call(db,ids[2],'join',{code:base.code}),/EMAIL_VERIFICATION_REQUIRED/);await assert.rejects(create(db,ids[2],{code:'PQRSTUVWXZ'}),/EMAIL_VERIFICATION_REQUIRED/);
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);
      for(const table of ['classrooms','classroom_members','classroom_events','classroom_materials'])await assert.rejects(db.query('select * from '+table),/permission denied/);
      await assert.rejects(call(db,ids[0]),/permission denied/);await assert.rejects(db.query('select classroom_state($1)',[ids[0]]),/permission denied/);await db.exec('reset role');
    }
    await db.exec('set role service_role');assert.equal((await call(db,ids[0])).classes[0].id,id);await assert.rejects(db.query('select classroom_detail($1,$2)',[ids[0],id]),/permission denied/);await db.exec('reset role');
  }finally{await db.close();}
});

test('validation rejects imaginary dates, unsafe materials and exhausted limits',async()=>{
  const db=await database();try{
    const {selected:id}=await create(db),itemId='10000000-0000-4000-8000-000000000001';
    for(const event of [{...activity,date:'2026-02-30'},{...activity,start:'25:00'},{...activity,end:'07:00'},{...activity,allDay:'true'},{...activity,repeat:'weekly',days:[]},{...activity,repeat:'weekly',days:[8]},{...activity,repeat:'weekly',days:[1],endDate:'2026-01-01'}])await assert.rejects(call(db,ids[0],'event_save',{id,itemId,event}),/INVALID_EVENT/);
    for(const url of ['https://evil.test/file','javascript:alert(1)','https://drive.google.com.evil.test/file/d/FILE_123/view','https://drive.google.com@evil.test/file/d/FILE_123/view'])await assert.rejects(call(db,ids[0],'material_save',{id,itemId,material:{title:'X',url}}),/INVALID_MATERIAL/);
    for(let index=0;index<9;index++)await create(db,ids[0],{code:'KLMNPQRST'+'23456789A'[index]});
    await assert.rejects(create(db,ids[0],{code:'PQRSTUVWXZ'}),/CLASS_LIMIT/);
  }finally{await db.close();}
});

test('shared projections reuse weekly calendar rules and preserve institution time labels',()=>{
  const snapshot={calendar:[{id:ids[0],classId:ids[1],className:'Álgebra',timezone:'America/Argentina/Buenos_Aires',data:{...activity,repeat:'weekly',days:[1,3],endDate:'2026-11-02',allDay:true}}]};
  const events=rules.occurrences(snapshot,'2026-10-26','2026-11-03');assert.deepEqual(events.map(item=>item.date),['2026-10-26','2026-10-28','2026-11-02']);assert.equal(events[0].horaInicio,'');assert.match(events[0].note,/America\/Argentina/);
  assert.equal(rules.code(' abcde-fghjk '),'ABCDEFGHJK');
  for(const url of ['javascript:alert(1)','https://drive.google.com/file/d/FILE_123/view?redirect=https://evil.test','https://docs.google.com/document/d/FILE_123/edit']){
    const safe=rules.driveUrl(url);if(url.startsWith('javascript:'))assert.equal(safe,'');else assert.ok(safe&&!safe.includes('redirect'));
  }
  assert.throws(()=>rules.event({...activity,date:'2026-02-29'}));assert.throws(()=>rules.course({...base,timezone:'Invalid/Zone'}));
});

function handlerHarness(responder){
  const file=path.join(root,'api/_lib/classrooms.js'),localRequire=createRequire(file),calls=[];
  const context={module:{exports:{}},require(name){if(name==='./supabase-admin')return {authenticateBearer:async value=>value==='Bearer teacher'?{id:ids[0]}:null,adminRequest:async(url,options={})=>{calls.push({url,method:options.method||'GET',body:options.body?JSON.parse(options.body):undefined});return responder?responder(url,options):{classes:[],calendar:[],revision:'0'.repeat(32)};}};if(name==='./request-security')return {...localRequire(name),enforceRateLimit:async()=>true};return localRequire(name);}};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
  return {calls,request:async(body={},extra={})=>{const result={headers:{}};const res={setHeader:(key,value)=>result.headers[key]=value,status(code){result.status=code;return this;},json(value){result.body=value;return this;}};await context.module.exports({method:'POST',query:{classes:'1'},headers:{host:'app.test',origin:'https://app.test',authorization:'Bearer teacher','content-type':'application/json'},body,...extra},res);return result;}};
}
test('HTTP binds caller identity, whitelists data, secures origins and refuses unsafe requests',async()=>{
  const h=handlerHarness();const response=await h.request({...base,action:'create',owner_id:ids[1],user:ids[1],code:'attacker'});assert.equal(response.status,200);assert.equal(h.calls[0].body.p_user,ids[0]);assert.ok(!JSON.stringify(h.calls).includes(ids[1]));assert.match(h.calls[0].body.p_data.code,rules.CODE);assert.equal(h.calls[0].body.p_data.owner_id,undefined);
  assert.equal((await h.request({}, {headers:{authorization:'Bearer no',host:'app.test','content-type':'application/json'}})).status,401);
  assert.equal((await h.request({}, {headers:{host:'app.test',origin:'https://evil.test'}})).status,403);
  assert.equal((await h.request({action:'drop'})).status,400);
  assert.equal((await h.request({action:'join',code:'BAD'})).status,400);
  assert.equal((await h.request({action:'detail'})).status,400);
  assert.equal((await h.request({action:'event_remove',id:[ids[0]],itemId:ids[1]})).status,400);
  assert.equal((await h.request({action:'material_save',id:ids[0],material:{title:'X',url:'javascript:alert(1)'}})).status,400);
  assert.equal((await h.request({action:'event_save',id:ids[0],event:{...activity,date:'2026-02-30'}})).status,400);
  assert.equal((await h.request({action:'create',title:'x'.repeat(9000)})).status,413);
  assert.equal(h.calls.length,1);
  assert.match(response.headers['Cache-Control'],/no-store/);
});

test('course deletion is owner-filtered; invitation previews expose dates but no roster, files or note details',async()=>{
  const denied=handlerHarness(()=>[]);assert.equal((await denied.request({action:'delete',id:ids[1],owner_id:ids[1]})).status,400);assert.equal(denied.calls.some(call=>call.method==='DELETE'),false);assert.ok(denied.calls[0].url.includes('owner_id=eq.'+ids[0]));
  const allowed=handlerHarness((url,options)=>url.includes('/rpc/')?{classes:[],calendar:[],revision:'0'.repeat(32)}:options.method==='DELETE'?null:[{id:ids[1]}]);assert.equal((await allowed.request({action:'delete',id:ids[1]})).status,200);assert.equal(allowed.calls.filter(call=>call.method==='DELETE').length,1);assert.ok(allowed.calls.filter(call=>call.method==='DELETE').every(call=>call.url.includes('owner_id=eq.'+ids[0])));
  const preview=handlerHarness(url=>url.includes('classroom_events?')?[{id:ids[2],data:{...activity,note:'Not for previews'}}]:[{id:ids[1],title:'Algebra',teacher_name:'Responsable',institution:'Uni',timezone:'UTC',color:'blue',owner_id:ids[0]}]);
  const result=await preview.request({}, {method:'GET',query:{classes:'1',invite:base.code},headers:{host:'app.test'}});assert.equal(result.status,200);assert.equal(result.body.calendar[0].data.note,'');assert.equal(result.body.owner_id,undefined);assert.equal(result.body.materials,undefined);assert.equal(result.body.members,undefined);
});
