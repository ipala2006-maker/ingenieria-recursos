const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
test('real database permissions hide encrypted Drive grants from anonymous and authenticated clients',async()=>{
  const db=new PGlite(),user='11111111-1111-4111-8111-111111111111';
  try{
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);');
    const sql=fs.readFileSync(path.join(__dirname,'../supabase/google-drive.sql'),'utf8');await db.exec(sql);await db.exec(sql);
    await db.query('insert into auth.users values($1)',[user]);
    await db.exec('set role service_role');await db.query('insert into drive_connections(user_id,credentials) values($1,$2)',[user,'x'.repeat(80)]);
    assert.equal((await db.query('select user_id from drive_connections')).rows[0].user_id,user);
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);
      for(const query of ['select * from drive_connections','delete from drive_connections',"update drive_connections set credentials='stolen'",`insert into drive_connections(user_id,credentials) values('${user}','${'y'.repeat(80)}')`])await assert.rejects(db.query(query),/permission denied/);
    }
    await db.exec('reset role');await db.query('delete from auth.users where id=$1',[user]);assert.equal((await db.query('select * from drive_connections')).rows.length,0);
  }finally{await db.close();}
});
