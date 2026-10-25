const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module'),{PGlite}=require('@electric-sql/pglite');
const rules=require('../shared/classrooms');
const root=path.resolve(__dirname,'..'),sql=fs.readFileSync(path.join(root,'supabase/classrooms.sql'),'utf8');
const invitationSql=fs.readFileSync(path.join(root,'supabase/classroom-invitations.sql'),'utf8');
const ids=[1,2,3,4].map(n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
const base={title:'Física',teacherName:'Profesora Ana',institution:'Escuela piloto',timezone:'UTC',color:'teal',code:'ABCDEFGHJK'};
const activity={title:'Parcial',date:'2026-10-26',start:'08:00',end:'10:00',allDay:false,type:'Examen',color:'amber',note:'Aula 2',repeat:'none',days:[],endDate:''};
async function database(){const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create table friend_profiles(user_id uuid primary key,username text);');for(const id of ids)await db.query('insert into auth.users values($1,$2,now())',[id,id+'@example.test']);await db.exec(sql);await db.exec(invitationSql);return db;}
const call=async(db,user,action='state',data={})=>(await db.query('select classroom_action($1,$2,$3) as data',[user,action,data])).rows[0].data;
const create=async(db,user=ids[0],data={})=>call(db,user,'create',{...base,...data});

test('course members see only responsible and delegate aliases with exact grants, never the roster or private identities',async()=>{
  const db=await database();try{
    const [owner,delegate,student,outsider]=ids,{selected:id}=await create(db,owner,{ownerRole:'collaborator'});
    await call(db,delegate,'join',{code:base.code});await call(db,student,'join',{code:base.code});
    await db.query('insert into friend_profiles values($1,$2)',[delegate,'BrightFalcon82']);
    await call(db,owner,'member_permissions',{id,itemId:delegate,role:'moderator',permissions:{datesEdit:true,filesAdd:true}});
    const before=await call(db,student,'detail',{id});
    assert.equal(before.team.owner.name,base.teacherName);assert.equal(before.team.owner.role,'collaborator');assert.equal(before.team.delegates.length,1);
    assert.equal(before.team.delegates[0].name,'BrightFalcon82');assert.deepEqual(before.team.delegates[0].permissions,rules.permissions({datesEdit:true,filesAdd:true}));
    assert.deepEqual(before.members,[]);assert.doesNotMatch(JSON.stringify(before.team),/@|user_id|joined_at|access_token/);assert.ok(!JSON.stringify(before.team).includes(delegate));
    await db.exec(fs.readFileSync(path.join(root,'supabase/classroom-team.sql'),'utf8'));
    assert.deepEqual((await call(db,student,'detail',{id})).team,before.team,'Incremental deployment preserves exactly the existing data and ACL');
    await assert.rejects(call(db,outsider,'detail',{id}),/CLASS_UNAVAILABLE/);
    await call(db,owner,'member_permissions',{id,itemId:delegate,role:'student',permissions:{}});assert.deepEqual((await call(db,student,'detail',{id})).team.delegates,[]);
    const {selected:teacherId}=await create(db,owner,{code:'KLMNPQRSTU'});assert.equal((await call(db,owner,'detail',{id:teacherId})).team.owner.role,'teacher');assert.deepEqual((await call(db,owner,'detail',{id:teacherId})).team.delegates,[]);
  }finally{await db.close();}
});

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
    for(const user of [student,outsider])for(const action of ['update','rotate','archive','event_save','event_remove','material_save','material_remove','member_remove'])await assert.rejects(call(db,user,action,{...base,id,itemId,event:activity,material:{title:'Notas',url:'https://drive.google.com/file/d/FILE_123/view'},archived:true}),user===student?/PERMISSION_DENIED/:/CLASS_UNAVAILABLE/);
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
  const denied=handlerHarness(()=>{throw new Error('CLASS_UNAVAILABLE');});assert.equal((await denied.request({action:'delete',id:ids[1],owner_id:ids[1]})).status,400);assert.equal(denied.calls.some(call=>call.method==='DELETE'),false);assert.equal(denied.calls[0].body.p_user,ids[0]);assert.equal(denied.calls[0].body.p_id,ids[1]);
  const allowed=handlerHarness(()=>({classes:[],calendar:[],revision:'0'.repeat(32),selected:''}));assert.equal((await allowed.request({action:'delete',id:ids[1]})).status,200);assert.equal(allowed.calls[0].url,'/rest/v1/rpc/classroom_delete');assert.equal(allowed.calls.length,1);
  const preview=handlerHarness(()=>({title:'Algebra',teacherName:'Responsable',institution:'Uni',owner_id:ids[0],calendar:[{id:ids[2],classId:ids[1],className:'Algebra',timezone:'UTC',data:{...activity,note:'Not for previews'}}]}));
  const result=await preview.request({}, {method:'GET',query:{classes:'1',invite:base.code},headers:{host:'app.test'}});assert.equal(result.status,200);assert.equal(result.body.calendar[0].data.note,'');assert.equal(result.body.owner_id,undefined);assert.equal(result.body.materials,undefined);assert.equal(result.body.members,undefined);
  assert.equal(preview.calls[0].url,'/rest/v1/rpc/classroom_invitation');assert.equal(preview.calls[0].body.p_code,base.code);
  const missing=handlerHarness(()=>{throw new Error('INVALID_CODE');});assert.equal((await missing.request({}, {method:'GET',query:{classes:'1',invite:base.code}})).status,404);
});

test('invitation preview and deletion work for the real restricted server role without opening table access',async()=>{
  const db=await database();try{
    const {selected:id}=await create(db),itemId='10000000-0000-4000-8000-000000000001';
    await call(db,ids[1],'join',{code:base.code});await call(db,ids[0],'event_save',{id,itemId,event:{...activity,note:'Private details',extra:'Never expose'}});await call(db,ids[0],'material_save',{id,itemId,material:{title:'Private PDF',url:'https://drive.google.com/file/d/FILE_123/view'}});
    await db.exec('set role service_role');
    for(const table of ['classrooms','classroom_events'])await assert.rejects(db.query('select * from '+table),/permission denied/);
    const preview=(await db.query('select classroom_invitation($1) as data',[base.code])).rows[0].data;
    assert.equal(preview.title,base.title);assert.equal(preview.calendar[0].data.title,activity.title);assert.equal(preview.calendar[0].data.note,'');assert.equal(preview.calendar[0].data.extra,undefined);assert.doesNotMatch(JSON.stringify(preview),/Private details|Private PDF|FILE_123|@example/);
    await assert.rejects(db.query('select classroom_delete($1,$2)',[ids[1],id]),/CLASS_UNAVAILABLE/);
    await db.exec('reset role');await db.exec(invitationSql);assert.equal((await call(db,ids[0])).calendar.length,1,'Reapplying the repair preserves the course');
    for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select classroom_invitation($1)',[base.code]),/permission denied/);await assert.rejects(db.query('select classroom_delete($1,$2)',[ids[0],id]),/permission denied/);await db.exec('reset role');}
    await db.exec('set role service_role');const deleted=(await db.query('select classroom_delete($1,$2) as data',[ids[0],id])).rows[0].data;assert.equal(deleted.selected,'');assert.deepEqual((await call(db,ids[1])).calendar,[]);await assert.rejects(db.query('select classroom_invitation($1)',[base.code]),/INVALID_CODE/);
    await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from classroom_events where class_id=$1',[id])).rows[0].n,0);
  }finally{await db.close();}
});

const grant=(db,id,user,permissions={},role='moderator')=>call(db,ids[0],'member_permissions',{id,itemId:user,role,permissions});
const material={title:'Guia',url:'https://drive.google.com/file/d/FILE_123/view'};
test('collaborators assign granular moderator permissions without exposing rosters or owner capabilities',async()=>{
  const db=await database();try{
    await db.exec('set role service_role');
    const {selected:id}=await create(db,ids[0],{ownerRole:'collaborator'});
    assert.equal((await call(db,ids[0])).classes[0].role,'collaborator');
    await call(db,ids[1],'join',{code:base.code});await call(db,ids[2],'join',{code:base.code});
    const before=(await call(db,ids[1])).revision;
    await grant(db,id,ids[1],{datesAdd:true});
    const mod=await call(db,ids[1]);assert.notEqual(mod.revision,before);assert.equal(mod.classes[0].role,'moderator');assert.equal(mod.classes[0].ownerRole,'collaborator');assert.equal(mod.classes[0].permissions.datesAdd,true);assert.equal(mod.classes[0].code,null);
    const privateDetail=await call(db,ids[1],'detail',{id});assert.deepEqual(privateDetail.members,[]);assert.doesNotMatch(JSON.stringify(privateDetail),new RegExp(ids[2]));
    for(const action of ['update','rotate','archive','member_remove','member_permissions'])await assert.rejects(call(db,ids[1],action,{...base,id,itemId:ids[2],role:'moderator',permissions:{filesAdd:true},archived:true}),/PERMISSION_DENIED/);
    await assert.rejects(db.query('select classroom_delete($1,$2)',[ids[1],id]),/CLASS_UNAVAILABLE/);
    await assert.rejects(grant(db,id,ids[3]),/CLASS_UNAVAILABLE/);await assert.rejects(grant(db,id,ids[0]),/CLASS_UNAVAILABLE/);
    for(const permissions of [{owner:true},{datesAdd:'true'},[],null])await assert.rejects(grant(db,id,ids[1],permissions),/INVALID_PERMISSIONS/);
    await assert.rejects(grant(db,id,ids[1],{},'collaborator'),/INVALID_PERMISSIONS/);
    for(const table of ['classrooms','classroom_members','classroom_events','classroom_materials'])await assert.rejects(db.query('select * from '+table),/permission denied/);
  }finally{await db.close();}
});

test('each of the six grants controls only its own operation, including upserts and cross-course IDs',async()=>{
  const db=await database();try{
    await db.exec('set role service_role');const {selected:id}=await create(db,ids[0],{ownerRole:'collaborator'});await call(db,ids[1],'join',{code:base.code});
    for(const [prefix,save,remove,payload]of[['dates','event_save','event_remove',{event:activity}],['files','material_save','material_remove',{material}]]){
      const itemId=ids[3],otherId=ids[2];
      await grant(db,id,ids[1],{[prefix+'Add']:true});
      await call(db,ids[1],save,{id,itemId,...payload});
      await assert.rejects(call(db,ids[1],save,{id,itemId,...payload}),/PERMISSION_DENIED/);
      await assert.rejects(call(db,ids[1],remove,{id,itemId}),/PERMISSION_DENIED/);
      await grant(db,id,ids[1],{[prefix+'Edit']:true});
      await call(db,ids[1],save,{id,itemId,...payload});
      await assert.rejects(call(db,ids[1],save,{id,itemId:otherId,...payload}),/PERMISSION_DENIED/);
      await assert.rejects(call(db,ids[1],remove,{id,itemId}),/PERMISSION_DENIED/);
      await grant(db,id,ids[1],{[prefix+'Remove']:true});await call(db,ids[1],remove,{id,itemId});
      await assert.rejects(call(db,ids[1],save,{id,itemId,...payload}),/PERMISSION_DENIED/);
    }
    const {selected:other}=await create(db,ids[2],{code:'KLMNPQRSTU'});await call(db,ids[2],'event_save',{id:other,itemId:ids[3],event:activity});
    await grant(db,id,ids[1],Object.fromEntries(rules.PERMISSIONS.map(key=>[key,true])));
    await assert.rejects(call(db,ids[1],'event_save',{id,itemId:ids[3],event:activity}),/CLASS_UNAVAILABLE/);
    await assert.rejects(call(db,ids[1],'event_save',{id:other,itemId:ids[3],event:activity}),/CLASS_UNAVAILABLE/);
    await call(db,ids[1],'event_remove',{id,itemId:ids[3]});assert.equal((await call(db,ids[2])).calendar.length,1,'Removing a foreign ID cannot affect another course');
  }finally{await db.close();}
});

test('revoking moderation, leaving, archiving and switching to teacher mode never restore stale permissions',async()=>{
  const db=await database();try{
    const {selected:id}=await create(db,ids[0],{ownerRole:'collaborator'});await call(db,ids[1],'join',{code:base.code});
    await grant(db,id,ids[1],{datesAdd:true,filesAdd:true});await db.exec(sql);
    assert.equal((await call(db,ids[1])).classes[0].permissions.filesAdd,true,'Idempotent migration preserves explicit grants');
    await db.exec('set role service_role');const before=(await call(db,ids[1])).revision;
    await grant(db,id,ids[1],{},'student');assert.notEqual((await call(db,ids[1])).revision,before);
    await assert.rejects(call(db,ids[1],'event_save',{id,itemId:ids[3],event:activity}),/PERMISSION_DENIED/);
    await grant(db,id,ids[1],{});await assert.rejects(call(db,ids[1],'material_save',{id,itemId:ids[3],material}),/PERMISSION_DENIED/);
    await grant(db,id,ids[1],{datesAdd:true});await call(db,ids[0],'archive',{id,archived:true});await assert.rejects(call(db,ids[1],'event_save',{id,itemId:ids[3],event:activity}),/CLASS_ARCHIVED/);
    await call(db,ids[0],'archive',{id,archived:false});await call(db,ids[0],'update',{...base,id,ownerRole:'teacher'});
    let state=await call(db,ids[1]);assert.equal(state.classes[0].role,'student');assert.deepEqual(state.classes[0].permissions,{});
    await assert.rejects(grant(db,id,ids[1],{datesAdd:true}),/PERMISSION_DENIED/);await assert.rejects(call(db,ids[1],'event_save',{id,itemId:ids[3],event:activity}),/PERMISSION_DENIED/);
    await call(db,ids[0],'update',{...base,id,ownerRole:'collaborator'});assert.equal((await call(db,ids[1])).classes[0].role,'student');
    await grant(db,id,ids[1],{datesAdd:true});await call(db,ids[1],'leave',{id});await call(db,ids[1],'join',{code:base.code});assert.equal((await call(db,ids[1])).classes[0].role,'student');
    await grant(db,id,ids[1],{datesAdd:true});await call(db,ids[0],'member_remove',{id,itemId:ids[1]});await assert.rejects(call(db,ids[1],'event_save',{id,itemId:ids[3],event:activity}),/CLASS_UNAVAILABLE/);
  }finally{await db.close();}
});

test('shared and HTTP validation reject unknown roles and permissions and bind grants to the authenticated actor',async()=>{
  const h=handlerHarness();const result=await h.request({action:'member_permissions',id:ids[2],itemId:ids[1],role:'moderator',permissions:{filesAdd:true},p_user:ids[1]});assert.equal(result.status,200);assert.equal(h.calls[0].body.p_user,ids[0]);assert.equal(h.calls[0].body.p_data.permissions.filesAdd,true);assert.equal(h.calls[0].body.p_data.permissions.datesAdd,false);
  for(const role of ['teacher','collaborator','owner'])assert.equal((await h.request({action:'member_permissions',id:ids[2],itemId:ids[1],role,permissions:{}})).status,400);
  for(const permissions of [{deleteClass:true},{filesAdd:'true'},null,[]])assert.equal((await h.request({action:'member_permissions',id:ids[2],itemId:ids[1],role:'moderator',permissions})).status,400);
  assert.equal((await h.request({action:'member_permissions',id:ids[2],itemId:ids[1],role:'student',permissions:{filesAdd:true}})).status,400);
  assert.equal((await handlerHarness(()=>{throw new Error('PERMISSION_DENIED');}).request({action:'event_save',id:ids[2],event:activity})).status,403);
  assert.throws(()=>rules.course({...base,ownerRole:'moderator'}),/INVALID_PERMISSIONS/);
  for(const key of rules.PERMISSIONS){assert.equal(rules.can({role:'student',ownerRole:'collaborator',permissions:{[key]:true}},key),false);assert.equal(rules.can({role:'moderator',ownerRole:'collaborator',permissions:{[key]:true}},key),true);assert.equal(rules.can({role:'moderator',ownerRole:'teacher',permissions:{[key]:true}},key),false);assert.equal(rules.can({role:'collaborator',archived:true},key),false);}
  assert.equal(rules.can({role:'collaborator'},'deleteClass'),false);
});

test('additive role upgrade preserves existing courses, enrollments, calendar content and invite codes',async()=>{
  const db=new PGlite();try{
    await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create table friend_profiles(user_id uuid primary key,username text);');
    for(const id of ids.slice(0,2))await db.query('insert into auth.users values($1,$2,now())',[id,id+'@example.test']);
    await db.exec(sql.slice(0,sql.indexOf('-- Additive upgrade:'))+'commit;');
    await db.query('insert into classrooms(id,owner_id,title,teacher_name,timezone,invite_code)values($1,$2,$3,$4,$5,$6)',[ids[2],ids[0],base.title,base.teacherName,base.timezone,base.code]);await db.query('insert into classroom_members(class_id,user_id)values($1,$2)',[ids[2],ids[1]]);await db.query('insert into classroom_events(id,class_id,data)values($1,$2,$3)',[ids[3],ids[2],activity]);
    await db.exec(sql);const owner=await call(db,ids[0]),student=await call(db,ids[1]);assert.equal(owner.classes[0].role,'teacher');assert.equal(owner.classes[0].code,base.code);assert.equal(student.classes[0].role,'student');assert.equal(student.calendar[0].data.title,activity.title);assert.equal(owner.classes[0].memberCount,1);
  }finally{await db.close();}
});
