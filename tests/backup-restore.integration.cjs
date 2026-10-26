// Disposable PostgreSQL + age round trip only. Never accepts production hosts.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const {config,backup}=require('../scripts/backup-database.cjs');

async function run(){
  if(process.env.BACKUP_INTEGRATION!=='true')throw Error('Integration fixture not enabled.');
  const host=process.env.PGHOST||'localhost';
  if(!['localhost','127.0.0.1','postgres'].includes(host))throw Error('Only the disposable local fixture is allowed.');
  const env={...process.env,PGHOST:host,PGUSER:'postgres',PGPASSWORD:'fixture-only',PGSSLMODE:'disable'};
  const sql=(database,text)=>execFileSync('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1','-d',database,'-c',text],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  sql('postgres','create database backup_source');sql('postgres','create database backup_restored');
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'backup-roundtrip-'));
  try{
    sql('backup_source',`create schema auth;create schema private;
      create table auth.users(id uuid primary key,email text);
      create table auth.identities(user_id uuid references auth.users(id),provider text);
      create table auth.sessions(id integer);
      create table private.api_rate_limits(id integer);
      create table public.user_states(user_id uuid references auth.users(id),state jsonb);
      create table public.classrooms(id integer primary key,owner_id uuid references auth.users(id),title text);
      create table public.classroom_members(class_id integer references classrooms(id),user_id uuid references auth.users(id));
      create table public.classroom_events(class_id integer references classrooms(id),data jsonb);
      create table public.classroom_materials(class_id integer references classrooms(id),url text);
      create table public.mobile_push_subscriptions(id integer);
      create function public.backup_fixture_version() returns integer language sql as $$select 42$$;
      alter table user_states enable row level security;alter table user_states force row level security;
      create policy owner_only on user_states using(false);
      insert into auth.users values('00000000-0000-4000-8000-000000000001','student@example.test');
      insert into auth.identities values('00000000-0000-4000-8000-000000000001','email');
      insert into auth.sessions values(1);insert into private.api_rate_limits values(1);insert into mobile_push_subscriptions values(1);
      insert into user_states values('00000000-0000-4000-8000-000000000001','{"notes":["fixture only"]}');
      insert into classrooms values(1,'00000000-0000-4000-8000-000000000001','Algebra');
      insert into classroom_members values(1,'00000000-0000-4000-8000-000000000001');
      insert into classroom_events values(1,'{"title":"Parcial"}');
      insert into classroom_materials values(1,'https://drive.google.com/file/d/fixture/view');`);
    const identity=path.join(directory,'recovery.agekey');
    execFileSync('age-keygen',['-o',identity],{stdio:['ignore','pipe','pipe']});
    const recipient=execFileSync('age-keygen',['-y',identity],{encoding:'utf8'}).trim();
    const options=config({...process.env,BACKUP_LOCAL_TEST:'true',BACKUP_PROJECT_REF:'a'.repeat(20),
      BACKUP_DATABASE_URL:`postgres://postgres:fixture-only@${host}:5432/backup_source`,BACKUP_AGE_RECIPIENT:recipient,BACKUP_OUTPUT_DIR:directory});
    const manifest=await backup(options),encrypted=path.join(directory,manifest.file);
    const archive=execFileSync('age',['--decrypt','--identity',identity,encrypted],{maxBuffer:32*1024*1024});
    assert.equal(archive.subarray(0,5).toString(),'PGDMP');
    const damaged=await fs.readFile(encrypted);damaged[damaged.length-1]^=1;
    const rejected=spawnSync('age',['--decrypt','--identity',identity],{input:damaged,maxBuffer:32*1024*1024});
    assert.notEqual(rejected.status,0,'Tampered ciphertext must not decrypt successfully');
    const restored=spawnSync('pg_restore',['--clean','--if-exists','--no-owner','--no-privileges','--exit-on-error','--dbname=backup_restored'],{env,input:archive,maxBuffer:1024*1024});
    if(restored.status!==0)throw Error('Fixture restore failed: '+restored.stderr.toString());
    for(const table of ['auth.users','auth.identities','public.user_states','public.classrooms','public.classroom_members','public.classroom_events','public.classroom_materials'])assert.equal(sql('backup_restored',`select count(*) from ${table}`),'1',table);
    for(const table of ['auth.sessions','private.api_rate_limits','public.mobile_push_subscriptions'])assert.equal(sql('backup_restored',`select count(*) from ${table}`),'0',table);
    assert.equal(sql('backup_restored','select backup_fixture_version()'),'42');
    assert.equal(sql('backup_restored',"select relrowsecurity and relforcerowsecurity from pg_class where oid='user_states'::regclass"),'t');
    assert.equal(sql('backup_restored',"select count(*) from pg_policies where policyname='owner_only'"),'1');
    console.log('PASS: pg_dump -> age -> decrypt -> pg_restore; accounts, classes, notes, schema, FK and RLS preserved.');
  }finally{await fs.rm(directory,{recursive:true,force:true});}
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
