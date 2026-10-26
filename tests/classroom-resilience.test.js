const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite'),rules=require('../shared/classrooms');
const ids=[1,2,3,4,5].map(n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'));
const event={title:'Parcial',date:'2026-11-02',start:'08:00',end:'10:00',allDay:false,type:'Examen',color:'blue',note:'',repeat:'none',days:[],endDate:''};
const item='10000000-0000-4000-8000-000000000001',material={title:'Guia',url:'https://drive.google.com/file/d/FILE_123/view'};
const sql=fs.readFileSync(require.resolve('../supabase/classrooms.sql'),'utf8');
async function setup(){
 const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);create table friend_profiles(user_id uuid primary key,username text);');
 for(const [index,id]of ids.entries()){await db.query('insert into auth.users values($1,$2,now(),null)',[id,'private'+index+'@example.test']);await db.query('insert into friend_profiles values($1,$2)',[id,'Member'+index]);}
 await db.exec(sql);await db.exec(fs.readFileSync(require.resolve('../supabase/classroom-invitations.sql'),'utf8'));
 return db;
}
const call=async(db,user,action='state',data={})=>(await db.query('select classroom_action($1,$2,$3) as data',[user,action,data])).rows[0].data;
const create=(db,code='ABCDEFGHJK')=>call(db,ids[0],'create',{title:'Fisica',teacherName:'Responsable',institution:'',timezone:'UTC',color:'blue',code,ownerRole:'collaborator'});
test('stale edits, stale removals and resurrecting a deleted item never overwrite newer content',async()=>{
 const db=await setup();try{
  const {selected:id}=await create(db);await call(db,ids[1],'join',{code:'ABCDEFGHJK'});
  await call(db,ids[0],'member_permissions',{id,itemId:ids[1],role:'moderator',permissions:{datesEdit:true,filesEdit:true,datesRemove:true,filesRemove:true}});
  for(const [save,remove,payload,field]of [['event_save','event_remove',{event},'events'],['material_save','material_remove',{material},'materials']]){
   await call(db,ids[0],save,{id,itemId:item,...payload,expectedVersion:0});
   await call(db,ids[0],save,{id,itemId:item,...payload,expectedVersion:1});
   for(const action of [save,remove])await assert.rejects(call(db,ids[1],action,{id,itemId:item,...payload,expectedVersion:1}),/VERSION_CONFLICT/);
   assert.equal((await call(db,ids[0],'detail',{id}))[field][0].version,2);
   await call(db,ids[0],remove,{id,itemId:item,expectedVersion:2});
   await assert.rejects(call(db,ids[0],save,{id,itemId:item,...payload,expectedVersion:2}),/VERSION_CONFLICT/);
  }
 }finally{await db.close();}
});
test('expulsions survive valid links, private blocks never become a public roster, and unblocking restores no privileges',async()=>{
 const db=await setup();try{
  const {selected:id}=await create(db);for(const user of ids.slice(1,3))await call(db,user,'join',{code:'ABCDEFGHJK'});
  await call(db,ids[0],'member_permissions',{id,itemId:ids[1],role:'moderator',permissions:{datesAdd:true}});
  await call(db,ids[0],'member_remove',{id,itemId:ids[1]});
  await assert.rejects(call(db,ids[1],'join',{code:'ABCDEFGHJK'}),/CLASS_BLOCKED/);
  await assert.rejects(call(db,ids[1],'history',{id}),/CLASS_UNAVAILABLE/);
  assert.equal((await call(db,ids[0],'detail',{id})).blocked.length,1);assert.deepEqual((await call(db,ids[2],'detail',{id})).blocked,[]);
  await assert.rejects(call(db,ids[2],'member_unblock',{id,itemId:ids[1]}),/PERMISSION_DENIED/);
  await call(db,ids[0],'member_unblock',{id,itemId:ids[1]});const joined=await call(db,ids[1],'join',{code:'ABCDEFGHJK'});
  assert.equal(joined.classes[0].role,'student');assert.deepEqual(joined.classes[0].permissions,{});
 }finally{await db.close();}
});
for(const mode of ['delete','soft-delete'])test(mode+' transfers to the first moderator and preserves dates, links, members and the invitation',async()=>{
 const db=await setup();try{
  const {selected:id}=await create(db);for(const user of ids.slice(1,4))await call(db,user,'join',{code:'ABCDEFGHJK'});
  for(const user of ids.slice(2,4))await call(db,ids[0],'member_permissions',{id,itemId:user,role:'moderator',permissions:{filesAdd:true}});
  await call(db,ids[0],'event_save',{id,itemId:item,event,expectedVersion:0});await call(db,ids[0],'material_save',{id,itemId:item,material,expectedVersion:0});
  if(mode==='delete')await db.query('delete from auth.users where id=$1',[ids[0]]);else await db.query('update auth.users set deleted_at=now() where id=$1',[ids[0]]);
  const successor=await call(db,ids[2]),course=successor.classes[0],detail=await call(db,ids[2],'detail',{id});
  assert.equal(course.role,'collaborator');assert.equal(course.code,'ABCDEFGHJK');assert.equal(course.memberCount,2);assert.equal(detail.events.length,1);assert.equal(detail.materials[0].url,material.url);
  assert.equal(detail.team.owner.name,'Member2');assert.equal((await call(db,ids[3])).classes[0].role,'moderator');
  assert.equal((await call(db,ids[1],'history',{id})).changes[0].action,'owner_transfer');
 }finally{await db.close();}
});
test('without moderators the first active student inherits; an empty class is archived rather than cascaded away',async()=>{
 const db=await setup();try{
  const {selected:id}=await create(db);await call(db,ids[1],'join',{code:'ABCDEFGHJK'});await call(db,ids[2],'join',{code:'ABCDEFGHJK'});
  const {selected:empty}=await create(db,'KLMNPQRSTU');await call(db,ids[0],'event_save',{id:empty,itemId:item,event});
  await db.query('delete from auth.users where id=$1',[ids[0]]);
  assert.equal((await call(db,ids[1])).classes[0].role,'collaborator');assert.equal((await call(db,ids[1])).classes[0].id,id);
  const archived=(await db.query('select owner_id,archived from classrooms where id=$1',[empty])).rows[0];assert.equal(archived.owner_id,null);assert.equal(archived.archived,true);
  assert.equal((await db.query('select count(*)::int n from classroom_events where class_id=$1',[empty])).rows[0].n,1);
 }finally{await db.close();}
});
test('history is bounded, member-only, alias-only, excluded from every state and stable across the incremental migration',async()=>{
 const db=await setup();try{
  const {selected:id}=await create(db);await call(db,ids[1],'join',{code:'ABCDEFGHJK'});
  for(let index=0;index<36;index++)await call(db,ids[0],'event_save',{id,itemId:item,event:{...event,title:'Parcial '+index},expectedVersion:index});
  const history=await call(db,ids[1],'history',{id});assert.equal(history.changes.length,30);assert.equal(history.changes[0].label,'Parcial 35');assert.doesNotMatch(JSON.stringify(history),/@example|actor_id|user_id|owner_id/);
  await assert.rejects(call(db,ids[4],'history',{id}),/CLASS_UNAVAILABLE/);
  assert.equal((await call(db,ids[1])).changes,undefined);
  await db.exec(fs.readFileSync(require.resolve('../supabase/classroom-resilience.sql'),'utf8'));
  assert.deepEqual(await call(db,ids[1],'history',{id}),history);
  for(const role of ['anon','authenticated','service_role']){
   await db.exec('set role '+role);
   for(const table of ['classroom_blocks','classroom_changes'])await assert.rejects(db.query('select * from '+table),/permission denied/);
   await assert.rejects(db.query('select classroom_state_compact($1)',[ids[1]]),/permission denied/);
   await db.exec('reset role');
  }
 }finally{await db.close();}
});
test('calendar deltas retain other courses; membership/material changes send no dates, while edits/removals/archive/renaming invalidate the right course',async()=>{
 const db=await setup();try{
  const {selected:first}=await create(db),{selected:second}=await create(db,'KLMNPQRSTU');
  for(const code of ['ABCDEFGHJK','KLMNPQRSTU'])await call(db,ids[1],'join',{code});
  await call(db,ids[0],'event_save',{id:first,itemId:item,event});
  const secondItem='20000000-0000-4000-8000-000000000001';await call(db,ids[0],'event_save',{id:second,itemId:secondItem,event});
  let model=null;
  const sync=async()=>{const result=await call(db,ids[1],'state',{stateProtocol:2,revision:model?.revision||'',calendarVersions:model?.calendarVersions||{}});if(!result.unchanged)model={revision:result.revision,classes:result.classes,...rules.mergeCalendar(model,result)};return result;};
  assert.equal((await sync()).calendarPatch.events.length,2);assert.equal((await sync()).unchanged,true);
  await call(db,ids[2],'join',{code:'ABCDEFGHJK'});assert.equal((await sync()).calendarPatch.events.length,0);assert.equal(model.calendar.length,2);
  await call(db,ids[0],'material_save',{id:first,itemId:item,material});assert.equal((await sync()).calendarPatch.events.length,0);
  await call(db,ids[0],'event_save',{id:first,itemId:item,event:{...event,date:'2026-11-03'},expectedVersion:1});
  assert.deepEqual((await sync()).calendarPatch.classes,[first]);assert.equal(model.calendar.length,2);assert.equal(model.calendar.find(row=>row.classId===first).data.date,'2026-11-03');
  await call(db,ids[0],'event_remove',{id:first,itemId:item,expectedVersion:2});await sync();assert.equal(model.calendar.length,1);
  await call(db,ids[0],'archive',{id:second,archived:true});await sync();assert.equal(model.calendar.length,0);
  await call(db,ids[0],'archive',{id:second,archived:false});await sync();assert.equal(model.calendar.length,1);
  await call(db,ids[1],'leave',{id:second});await sync();assert.equal(model.calendar.length,0);
 }finally{await db.close();}
});

test('direct reads bind identity to Auth, expose no tables and reject writes, anonymous callers and other courses',async()=>{
 const db=await setup();try{
  await db.exec("create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
  const {selected:id}=await create(db);await call(db,ids[1],'join',{code:'ABCDEFGHJK'});
  await db.exec('set role anon');await assert.rejects(db.query("select classroom_read()"),/permission denied/);await db.exec('reset role');
  await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[1]]);
  const read=async(action,data={})=>(await db.query('select classroom_read($1,$2) data',[action,data])).rows[0].data;
  assert.equal((await read('state')).classes[0].id,id);assert.equal((await read('detail',{id})).members.length,0);
  await assert.rejects(read('member_remove',{id,itemId:ids[0]}),/INVALID_DATA/);await assert.rejects(db.query('select * from classrooms'),/permission denied/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[4]]);assert.equal((await read('state',{userId:ids[0]})).classes.length,0);await assert.rejects(read('detail',{id,userId:ids[0]}),/CLASS_UNAVAILABLE/);
  await db.exec('reset role');await db.query('update auth.users set deleted_at=now() where id=$1',[ids[4]]);await db.exec('set role authenticated');await assert.rejects(read('state'),/AUTH_REQUIRED/);
 }finally{await db.close();}
});

test('succession skips suspended and unconfirmed members, and orphaned classes never grant owner access through NULL',async()=>{
 const db=await setup();try{
  await db.exec('alter table auth.users add column banned_until timestamptz');const {selected:id}=await create(db);
  for(const user of ids.slice(1,4))await call(db,user,'join',{code:'ABCDEFGHJK'});
  await call(db,ids[0],'member_permissions',{id,itemId:ids[1],role:'moderator',permissions:{}});
  await db.query("update auth.users set banned_until='2099-01-01' where id=$1",[ids[1]]);await db.query('update auth.users set email_confirmed_at=null where id=$1',[ids[2]]);
  await db.query('delete from auth.users where id=$1',[ids[0]]);assert.equal((await call(db,ids[3])).classes[0].role,'collaborator');
  await db.query('delete from auth.users where id=$1',[ids[3]]);const course=(await db.query('select owner_id,archived from classrooms where id=$1',[id])).rows[0];assert.equal(course.owner_id,null);assert.equal(course.archived,true);
  await assert.rejects(call(db,ids[2],'archive',{id,archived:false}),/PERMISSION_DENIED/);
 }finally{await db.close();}
});
