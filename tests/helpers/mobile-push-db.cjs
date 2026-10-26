const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'../..');
const user='00000000-0000-4000-8000-000000000001';
const subscription=(suffix='one')=>({endpoint:'https://web.push.apple.com/Q/'+suffix,keys:{p256dh:'B'.repeat(87),auth:'a'.repeat(22)}});
async function mobileDatabase({indexed=true,cron=true}={}) {
  const db=new PGlite();
  await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table public.user_states(user_id uuid primary key references auth.users(id) on delete cascade,state jsonb,updated_at timestamptz default now());create function public.test_clock() returns timestamptz language sql stable as $$select current_setting('test.clock')::timestamptz$$;");
  await db.query("select set_config('test.clock',$1,false)",['2026-10-26T11:59:35Z']);
  for(const file of ['mobile-notifications.sql',...(indexed?['mobile-notifications-indexed.sql']:[])]){
    await db.exec(fs.readFileSync(path.join(root,'supabase',file),'utf8').replace(/\bnow\(\)/g,'public.test_clock()'));
  }
  if(cron){
    await db.exec("create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);create schema cron;create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;create schema net;create table net.requests(body jsonb);create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$begin insert into net.requests values(body);return 1;end$$;");
    await db.exec(fs.readFileSync(path.join(root,'supabase/mobile-notifications-cron.sql'),'utf8').replace(/^create extension .*;$/gm,'').replace(/\bnow\(\)/g,'public.test_clock()'));
    await db.query('insert into vault.decrypted_secrets values($1,$2)',['estudiemos_mobile_push_cron','fixture-only-'.repeat(4)]);
  }
  await db.query('insert into auth.users values($1)',[user]);
  const save=async(items,extra={})=>db.query('insert into user_states(user_id,state) values($1,$2) on conflict(user_id) do update set state=excluded.state',[user,{values:{bandeja_agenda:items,...extra}}]);
  const register=async(zone='UTC',suffix='one')=>db.query('select register_mobile_push($1,$2,$3)',[user,subscription(suffix),zone]);
  return {db,save,register,clock:value=>db.query("select set_config('test.clock',$1,false)",[value])};
}
module.exports={mobileDatabase,user,subscription};
