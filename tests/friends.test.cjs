const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..');
const ids=[1,2,3,4].map(i=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`);
async function database(){
  const db=new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz); create table public.user_states(user_id uuid primary key,state jsonb);');
  await db.exec(fs.readFileSync(path.join(root,'supabase/friends.sql'),'utf8'));
  for(const [i,id] of ids.entries())await db.query('insert into auth.users values($1,$2,now())',[id,`student${i+1}@example.test`]);
  return db;
}
const call=async(db,user,action='list',data={})=>(await db.query('select friends_action($1,$2,$3) as result',[user,action,data])).rows[0].result;

test('unique usernames preserve display names and route exact requests without auto-accepting',async()=>{
  const db=await database();try{
    const [a,b,c]=ids;
    const profile={name:'Alex',username:'@ALEX_ESTUDIA',share:false,timezone:'UTC'};
    assert.equal((await call(db,b,'profile',profile)).me.username,'alex_estudia');
    await call(db,c,'profile',{...profile,username:'otro_alex'});
    await assert.rejects(call(db,c,'profile',profile),/USERNAME_TAKEN/);
    assert.equal((await call(db,c)).me.username,'otro_alex');
    await call(db,b,'profile',{name:'Alex',share:false,timezone:'UTC'});
    assert.equal((await call(db,b)).me.username,'alex_estudia','legacy clients preserve the handle');
    const result=await call(db,a,'request_username',{username:' @Alex_Estudia '});
    assert.equal(result.outgoing[0].id,b);assert.equal(result.outgoing[0].username,'alex_estudia');
    assert.deepEqual(result.friends,[]);assert.equal((await call(db,b)).incoming[0].id,a);
    assert.deepEqual((await call(db,c)).incoming,[],'same display name never selects another account');
    await call(db,a,'request_username',{username:'alex_estudia'});
    assert.equal((await call(db,b)).incoming.length,1);
    for(const username of ['alex','alex_estudia_extra','missing_user']){
      assert.equal((await call(db,a,'request_username',{username})).outgoing.length,1,'no prefix matching');
    }
    await call(db,b,'accept',{id:a});assert.equal((await call(db,a)).friends[0].username,'alex_estudia');
    await call(db,b,'block',{id:a});
    assert.deepEqual((await call(db,a,'request_username',{username:'alex_estudia'})).outgoing,[]);
    await db.exec(fs.readFileSync(path.join(root,'supabase/friends.sql'),'utf8'));
    assert.equal((await call(db,b)).me.username,'alex_estudia','migration rerun preserves handles');
  }finally{await db.close();}
});

test('username validation, verification, removal and shared lookup limit',async()=>{
  const db=await database();try{
    const [a,b]=ids,profile={name:'Pilot',share:false,timezone:'UTC'};
    for(const username of ['ab','x'.repeat(25),'name space','@@name','álex',null,['alex']]){
      await assert.rejects(call(db,b,'profile',{...profile,username}),/INVALID_USERNAME/);
      await assert.rejects(call(db,a,'request_username',{username}),/INVALID_USERNAME/);
    }
    await call(db,b,'profile',{...profile,username:'pilot_user'});
    await db.query('update auth.users set email_confirmed_at=null where id=$1',[a]);
    await assert.rejects(call(db,a,'request_username',{username:'pilot_user'}),/EMAIL_VERIFICATION_REQUIRED/);
    await db.query('update auth.users set email_confirmed_at=now() where id=$1',[a]);
    await db.query('update auth.users set email_confirmed_at=null where id=$1',[b]);
    assert.deepEqual((await call(db,a,'request_username',{username:'pilot_user'})).outgoing,[]);
    await db.query('update auth.users set email_confirmed_at=now() where id=$1',[b]);
    assert.deepEqual((await call(db,b,'request_username',{username:'pilot_user'})).outgoing,[],'own handle is a no-op');
    await call(db,b,'profile',{...profile,username:''});assert.equal((await call(db,b)).me.username,null);
    assert.deepEqual((await call(db,a,'request_username',{username:'pilot_user'})).outgoing,[]);
    for(let i=0;i<8;i++)await call(db,a,'request_email',{email:`missing${i}@example.test`});
    await assert.rejects(call(db,a,'request_username',{username:'missing_user'}),/EMAIL_REQUEST_LIMIT/);
  }finally{await db.close();}
});

test('exact email sends one private request even before the recipient has opened Friends',async()=>{
  const db=await database();try{
    const [a,b]=ids;
    let result=await call(db,a,'request_email',{email:'  STUDENT2@EXAMPLE.TEST  '});
    assert.equal(result.outgoing.length,1);assert.equal(result.outgoing[0].id,b);
    assert.deepEqual(result.friends,[]);assert.ok(!JSON.stringify(result).includes('@'));
    assert.equal((await call(db,b)).incoming[0].id,a);
    await call(db,a,'request_email',{email:'student2@example.test'});
    await call(db,b,'request_email',{email:'student1@example.test'});
    assert.equal((await db.query('select count(*)::int as n from friend_links')).rows[0].n,1);
    assert.equal((await call(db,b)).incoming.length,1,'reciprocal email does not accept');
    await call(db,b,'accept',{id:a});assert.equal((await call(db,a)).friends[0].id,b);
    await call(db,b,'block',{id:a});
    result=await call(db,a,'request_email',{email:'student2@example.test'});
    assert.deepEqual(result.outgoing,[]);assert.deepEqual(result.blocked,[]);
    await db.exec(fs.readFileSync(path.join(root,'supabase/friends.sql'),'utf8'));
    assert.equal((await call(db,b)).blocked[0].id,a,'migration rerun preserves existing graph');
  }finally{await db.close();}
});

test('email verification, generic misses, validation and persistent guessing limit',async()=>{
  const db=await database();try{
    const [a,b]=ids;
    await assert.rejects(call(db,a,'request_email',{email:'bad'}),/INVALID_EMAIL/);
    await assert.rejects(call(db,a,'request_email',{email:['student2@example.test']}),/INVALID_EMAIL/);
    await db.query('update auth.users set email_confirmed_at=null where id=$1',[a]);
    await assert.rejects(call(db,a,'request_email',{email:'student2@example.test'}),/EMAIL_VERIFICATION_REQUIRED/);
    await db.query('update auth.users set email_confirmed_at=now() where id=$1',[a]);
    await db.query('update auth.users set email_confirmed_at=null where id=$1',[b]);
    for(const email of ['student1@example.test','student2@example.test','missing@example.test','student%@example.test']){
      const result=await call(db,a,'request_email',{email});assert.deepEqual(result.outgoing,[]);
    }
    for(let i=0;i<6;i++)await call(db,a,'request_email',{email:`missing${i}@example.test`});
    await assert.rejects(call(db,a,'request_email',{email:'student3@example.test'}),/EMAIL_REQUEST_LIMIT/);
    await call(db,a);
    await db.query("update friend_profiles set email_window=now()-interval '11 minutes' where user_id=$1",[a]);
    assert.equal((await call(db,a,'request_email',{email:'student3@example.test'})).outgoing.length,1);
  }finally{await db.close();}
});
test('friends require acceptance; privacy applies in SQL, including hiding again and removal',async()=>{
  const db=await database();try{
    const [a,b,c]=ids;
    const alice=await call(db,a),bob=await call(db,b);
    assert.equal(alice.me.share,false);assert.deepEqual(alice.friends,[]);
    await call(db,b,'profile',{name:'Bob',share:true,timezone:'UTC'});
    const rows=(await db.query("select to_char((now() at time zone 'UTC')::date-i,'YYYY-MM-DD') as day from generate_series(0,2)i")).rows;
    await db.query('insert into user_states values($1,$2)',[b,{values:{estudiemos_pomodoro_streak:JSON.stringify({days:Object.fromEntries(rows.map(r=>[r.day,25]))}),bandeja_agenda:[{title:'PRIVATE'}]}}]);
    let result=await call(db,a,'request',{invite:bob.me.invite});
    assert.equal(result.outgoing.length,1);assert.deepEqual(result.friends,[]);assert.ok(!JSON.stringify(result).includes('streak":3'));
    await assert.rejects(call(db,a,'accept',{id:b}),/REQUEST_NOT_FOUND/);
    await assert.rejects(call(db,c,'accept',{id:a}),/REQUEST_NOT_FOUND/);
    await call(db,b,'request',{invite:alice.me.invite});
    assert.equal((await call(db,b)).incoming.length,1,'reciprocal request does not silently accept');
    await call(db,b,'accept',{id:a});
    result=await call(db,a);assert.equal(result.friends[0].streak,3);assert.equal(result.friends[0].name,'Bob');
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));assert.ok(!JSON.stringify(result).includes(bob.me.invite));
    assert.deepEqual((await call(db,c)).friends,[]);
    await call(db,b,'profile',{name:'Bob',share:false,timezone:'UTC'});
    assert.equal((await call(db,a)).friends[0].streak,null);
    await call(db,a,'remove',{id:b});assert.deepEqual((await call(db,b)).friends,[]);
    await db.exec('set role authenticated');
    for(const query of ['select * from friend_profiles','select * from friend_links','select * from friend_blocks',`select friend_streak('${b}','UTC')`,`select friends_action('${b}','list','{}')`])await assert.rejects(db.query(query),/permission denied/);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from friend_profiles'),/permission denied/);
    await db.exec('reset role; set role service_role');
    assert.equal((await call(db,a)).me.id,a);
  }finally{await db.close();}
});
test('block, unblock, cancellation and link rotation preserve control without disclosing blocked users',async()=>{
  const db=await database();try{
    const [a,b]=ids,alice=await call(db,a),bob=await call(db,b);
    await assert.rejects(call(db,a,'request',{invite:alice.me.invite}),/INVALID_INVITE/);
    await call(db,a,'request',{invite:bob.me.invite});
    await call(db,b,'block',{id:a});
    await assert.rejects(call(db,a,'request',{invite:bob.me.invite}),/INVALID_INVITE/);
    assert.deepEqual((await call(db,a)).blocked,[]);
    assert.equal((await call(db,b)).blocked[0].id,a);
    await call(db,b,'unblock',{id:a});
    await call(db,a,'request',{invite:bob.me.invite});await call(db,a,'decline',{id:b});
    assert.deepEqual((await call(db,b)).incoming,[]);
    const rotated=await call(db,b,'rotate');assert.notEqual(rotated.me.invite,bob.me.invite);
    await assert.rejects(call(db,a,'request',{invite:bob.me.invite}),/INVALID_INVITE/);
    await call(db,a,'request',{invite:rotated.me.invite});
    assert.equal((await call(db,b)).incoming.length,1);
  }finally{await db.close();}
});
test('streak matches local 25-minute rule, tolerates invalid history, and enforces profile validation and write limits',async()=>{
  const db=await database();try{
    const [a]=ids;await call(db,a);
    await assert.rejects(call(db,a,'profile',{name:'',share:true,timezone:'UTC'}),/INVALID_PROFILE/);
    await assert.rejects(call(db,a,'profile',{name:'Pilot',share:true,timezone:'invalid'}),/INVALID_TIMEZONE/);
    const rows=(await db.query("select to_char((now() at time zone 'UTC')::date-i,'YYYY-MM-DD') as day,i from generate_series(0,3)i")).rows;
    const days=Object.fromEntries(rows.map(r=>[r.day,r.i===0?24:r.i===3?0:25]));
    await db.query('insert into user_states values($1,$2)',[a,{values:{estudiemos_pomodoro_streak:{days}}}]);
    assert.equal((await call(db,a)).me.streak,2,'yesterday sustains unfinished today');
    await db.query('update user_states set state=$2 where user_id=$1',[a,{values:{estudiemos_pomodoro_streak:'invalid'}}]);
    assert.equal((await call(db,a)).me.streak,0);
    for(let i=0;i<20;i++)await call(db,a,'profile',{name:'Pilot',share:false,timezone:'UTC'});
    await assert.rejects(call(db,a,'rotate'),/TOO_MANY_ACTIONS/);
    assert.equal((await call(db,a)).me.share,false,'read access still works');
  }finally{await db.close();}
});
test('API authenticates server-side, ignores forged actor and returns only generic backend errors',async()=>{
  let actor=ids[0],calls=[];
  const handler={module:{exports:{}},require:name=>name==='./supabase-admin'?{
    authenticateBearer:async()=>actor?{id:actor}:null,
    adminRequest:async(url,options)=>{calls.push(JSON.parse(options.body));return {friends:[]};}
  }:{setSecurityHeaders:()=>{},isSameOriginRequest:()=>true,requireJsonRequest:()=>true,rejectOversizedBody:()=>false,enforceRateLimit:async()=>true}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'api/_lib/friends.js'),'utf8'),handler);
  const response={status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  const req={method:'POST',headers:{authorization:'Bearer pilot'},body:{action:'request',invite:'a'.repeat(32),p_user:ids[1],id:ids[1]}};
  await handler.module.exports(req,response);assert.equal(response.code,200);assert.equal(calls[0].p_user,ids[0]);assert.deepEqual(Object.keys(calls[0].p_data),['invite']);
  actor=null;await handler.module.exports(req,response);assert.equal(response.code,401);assert.equal(calls.length,1);
  actor=ids[0];req.body.invite='bad';await handler.module.exports(req,response);assert.equal(response.code,400);
  req.body={action:'request_email',email:' STUDENT2@EXAMPLE.TEST ',p_user:ids[1],id:ids[1]};
  await handler.module.exports(req,response);assert.equal(response.code,200);
  assert.deepEqual(calls.at(-1),{p_user:ids[0],p_action:'request_email',p_data:{email:'student2@example.test'}});
  for(const email of ['bad','x@y.test\nInjected: x','x'.repeat(255),null,['x@y.test']]){
    req.body.email=email;await handler.module.exports(req,response);assert.equal(response.code,400);
  }
  req.body={action:'request_username',username:'@ALEX_123',p_user:ids[1],email:'private@example.test'};
  await handler.module.exports(req,response);assert.equal(response.code,200);
  assert.deepEqual(calls.at(-1),{p_user:ids[0],p_action:'request_username',p_data:{username:'alex_123'}});
  for(const username of ['',null,[], 'ab','@@alex','name space','x'.repeat(26)]){
    req.body.username=username;await handler.module.exports(req,response);assert.equal(response.code,400);
  }
  req.body={action:'profile',name:'Alex',share:false,timezone:'UTC',username:'@ALEX_123'};
  await handler.module.exports(req,response);assert.equal(response.code,200);assert.equal(calls.at(-1).p_data.username,'alex_123');
  req.body.username='invalid space';await handler.module.exports(req,response);assert.equal(response.code,400);
});
