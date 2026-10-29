-- Prerequisite: store MOBILE_PUSH_CRON_SECRET in Vault as estudiemos_mobile_push_cron.
-- This job is internal to the existing database, not a paid Vercel Cron service.
do $$ begin
  if to_regclass('public.mobile_push_origins') is not null then raise exception 'PUSH_ORIGIN_MIGRATION_ACTIVE'; end if;
end $$;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.tick_mobile_push()
returns void language plpgsql security definer set search_path = '' as $$
declare token text; pending integer; worker integer;
begin
  -- Do not repeat queue work when two cron ticks overlap.
  if not pg_catalog.pg_try_advisory_xact_lock(1793025042, 1) then return; end if;
  select decrypted_secret into token from vault.decrypted_secrets where name='estudiemos_mobile_push_cron' limit 1;
  if token is null or length(token)<32 then return; end if;
  insert into public.mobile_push_health(id,heartbeat) values(true,now())
    on conflict(id) do update set heartbeat=excluded.heartbeat;
  delete from public.mobile_push_jobs where occurrence<now()-interval '2 days';
  delete from public.mobile_push_subscriptions where expires_at<now();
  perform public.enqueue_mobile_push_jobs(1000);
  select count(*) into pending from (select 1 from public.mobile_push_jobs
    where sent_at is null and attempts<3 and available_at<=now()
      and occurrence-interval '30 seconds' between now()-interval '10 minutes' and now() limit 400) q;
  -- Up to four bounded workers, only when needed. SKIP LOCKED leases prevent
  -- concurrent workers from sending the same occurrence.
  if pending>0 then
    for worker in 1..((pending+99)/100) loop
      perform net.http_post(url:='https://estudiemos-app.vercel.app/api/widget-push?mobilePush=dispatch',
        headers:=jsonb_build_object('Authorization','Bearer '||token,'Content-Type','application/json'),
        body:='{}'::jsonb, timeout_milliseconds:=100000);
    end loop;
  end if;
end $$;
revoke all on function public.tick_mobile_push() from public, anon, authenticated, service_role;
select cron.schedule('estudiemos-mobile-alarms','* * * * *','select public.tick_mobile_push();');
