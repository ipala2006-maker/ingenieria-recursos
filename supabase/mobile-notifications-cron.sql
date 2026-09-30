-- Prerequisite: store MOBILE_PUSH_CRON_SECRET in Vault as estudiemos_mobile_push_cron.
-- This job is internal to the existing database, not a paid Vercel Cron service.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.tick_mobile_push()
returns void language plpgsql security definer set search_path = '' as $$
declare token text;
begin
  select decrypted_secret into token from vault.decrypted_secrets where name='estudiemos_mobile_push_cron' limit 1;
  if token is null or length(token)<32 then return; end if;
  insert into public.mobile_push_health(id,heartbeat) values(true,now())
    on conflict(id) do update set heartbeat=excluded.heartbeat;
  delete from public.mobile_push_jobs where occurrence<now()-interval '2 days';
  delete from public.mobile_push_subscriptions where expires_at<now();
  -- Bounded rollout: at most 5000 jobs per day, with no automatic paid upgrade.
  if (select count(*) from public.mobile_push_jobs where occurrence>=date_trunc('day',now()))>=5000 then return; end if;
  insert into public.mobile_push_jobs(subscription_id,task_id,occurrence)
    select s.id,t.task_id,t.occurrence from public.mobile_push_subscriptions s
    cross join lateral public.mobile_due_tasks(s.user_id,s.timezone) t
    where s.expires_at>now() and not exists(select 1 from public.mobile_push_jobs q
      where q.subscription_id=s.id and q.task_id=t.task_id and q.occurrence=t.occurrence) limit 100
    on conflict(subscription_id,task_id,occurrence) do nothing;
  -- No HTTP invocation when there are no due alarms.
  if exists(select 1 from public.mobile_push_jobs where sent_at is null and attempts<3
    and available_at<=now() and occurrence>=now()-interval '10 minutes') then
    perform net.http_post(url:='https://estudiemos-app.vercel.app/api/widget-push?mobilePush=dispatch',
      headers:=jsonb_build_object('Authorization','Bearer '||token,'Content-Type','application/json'),
      body:='{}'::jsonb, timeout_milliseconds:=60000);
  end if;
end $$;
revoke all on function public.tick_mobile_push() from public, anon, authenticated, service_role;
select cron.schedule('estudiemos-mobile-alarms','* * * * *','select public.tick_mobile_push();');
