const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),assert=require('node:assert/strict'),rules=require('../shared/classrooms');
const owner='00000000-0000-4000-8000-000000000001',student='00000000-0000-4000-8000-000000000002',extra='00000000-0000-4000-8000-000000000003';
(async()=>{const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create table friend_profiles(user_id uuid primary key,username text);');
 for(const id of[owner,student,extra])await db.query('insert into auth.users values($1,$2,now())',[id,'fixture@example.test']);await db.exec(fs.readFileSync(require.resolve('../supabase/classrooms.sql'),'utf8'));
 const call=async(user,action,data={})=>(await db.query('select classroom_action($1,$2,$3) data',[user,action,data])).rows[0].data;
 const classes=[];for(const code of['ABCDEFGHJK','KLMNPQRSTU','VWXYZ23456','789ABCDEFG','HJKLMNPQRS']){
  const result=await call(owner,'create',{code,title:'Materia '+classes.length,teacherName:'Colaborador',timezone:'UTC',color:'blue',institution:'',ownerRole:'collaborator'});classes.push({id:result.selected,code});await call(student,'join',{code});
  for(let n=0;n<20;n++)await call(owner,'event_save',{id:result.selected,itemId:crypto.randomUUID(),event:{title:'Guia o parcial '+n,date:'2026-11-02',start:'08:00',end:'10:00',allDay:false,type:'Examen',color:'blue',note:'Instrucciones de la actividad '.repeat(5),repeat:'none',days:[],endDate:''}});
 }
 let oldModel=null,model=null,oldBytes=0,newBytes=0,reads=0;
 async function sample(){const old=await call(student,'state',{revision:oldModel?.revision||''});const now=await call(student,'state',{stateProtocol:2,revision:model?.revision||'',calendarVersions:model?.calendarVersions||{}});oldBytes+=Buffer.byteLength(JSON.stringify(old));newBytes+=Buffer.byteLength(JSON.stringify(now));reads++;if(!old.unchanged)oldModel=old;if(!now.unchanged)model={revision:now.revision,classes:now.classes,...rules.mergeCalendar(model,now)};assert.deepEqual([...model.calendar].sort((a,b)=>a.id.localeCompare(b.id)),[...oldModel.calendar].sort((a,b)=>a.id.localeCompare(b.id)));return now;}
 await sample();for(let n=0;n<8;n++){const c=classes[n%5];await call(owner,'material_save',{id:c.id,itemId:crypto.randomUUID(),material:{title:'Material '+n,url:'https://drive.google.com/file/d/FILE_123/view'}});assert.equal((await sample()).calendarPatch.events.length,0);}
 for(const c of classes){await call(extra,'join',{code:c.code});assert.equal((await sample()).calendarPatch.events.length,0);}
 for(const c of classes){const detail=await call(owner,'detail',{id:c.id}),e=detail.events[0];await call(owner,'event_save',{id:c.id,itemId:e.id,event:{...e.data,title:'Fecha reprogramada'},expectedVersion:e.version});assert.equal((await sample()).calendarPatch.events.length,20);}
 for(let n=0;n<20;n++)assert.equal((await sample()).unchanged,true);
 console.log(JSON.stringify({classes:5,dates:100,reads,oldBytes,newBytes,reductionPercent:+((1-newBytes/oldBytes)*100).toFixed(2),calendarEqual:true,granularity:'changed course; not per-row',excludes:'auth, headers, realtime, CPU; not a concurrent-user load test'},null,2));
 }finally{await db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
