-- Final cutover after mobile-push-origins.sql. No account, note or subscription deletion.
-- The legacy origin is disabled; only the fixed Cloudflare destination is dispatched.
begin;

do $$ begin
  if not public.mobile_push_ready_for_origin(
    'https://estudiemos.estudiemos-services.workers.dev', 'cf_20261029') then
    raise exception 'CLOUDFLARE_PUSH_NOT_READY';
  end if;
end $$;

update public.mobile_push_origins set enabled=false
  where source_origin='https://estudiemos-app.vercel.app' and vapid_key_id='legacy';

create or replace function public.register_mobile_push_for_origin(
  p_user uuid,p_subscription jsonb,p_timezone text,p_origin text,p_key_id text)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare endpoint_value text:=p_subscription->>'endpoint'; expiry timestamptz:=now()+interval '90 days';
begin
  if p_origin is distinct from 'https://estudiemos.estudiemos-services.workers.dev'
    or p_key_id is distinct from 'cf_20261029' then raise exception 'PUSH_ORIGIN_RETIRED'; end if;
  if not exists(select 1 from public.mobile_push_origins
    where source_origin=p_origin and vapid_key_id=p_key_id and enabled)
    then raise exception 'PUSH_SCOPE_NOT_READY'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone)
    or endpoint_value is null or length(endpoint_value)>2048 then raise exception 'Invalid subscription'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,4300));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(endpoint_value,4301));
  if exists(select 1 from public.mobile_push_subscriptions where endpoint=endpoint_value
    and (user_id<>p_user or source_origin<>p_origin or vapid_key_id<>p_key_id))
    then raise exception 'Subscription belongs to another account or origin'; end if;
  if not exists(select 1 from public.mobile_push_subscriptions where endpoint=endpoint_value)
    and (select count(*) from public.mobile_push_subscriptions where user_id=p_user
      and source_origin=p_origin and vapid_key_id=p_key_id and expires_at>now())>=5
    then raise exception 'Device limit reached'; end if;
  insert into public.mobile_push_subscriptions(user_id,endpoint,subscription,timezone,expires_at,source_origin,vapid_key_id)
    values(p_user,endpoint_value,p_subscription,p_timezone,expiry,p_origin,p_key_id)
    on conflict(endpoint) do update set subscription=excluded.subscription,timezone=excluded.timezone,expires_at=excluded.expires_at;
  return expiry;
end $$;

-- Keep the signatures private but make retired senders a no-op: never reserve jobs.
create or replace function public.claim_mobile_push_batch(p_limit integer default 100)
returns table(id bigint,subscription jsonb,title text,tag text,owner uuid)
language sql security definer set search_path='' as $$
  select null::bigint,null::jsonb,null::text,null::text,null::uuid where false;
$$;
create or replace function public.claim_mobile_push_jobs()
returns table(id bigint,subscription jsonb,title text,tag text,owner uuid)
language sql security definer set search_path='' as $$
  select * from public.claim_mobile_push_batch(1);
$$;

create or replace function public.mobile_push_state_changed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.mobile_push_subscriptions s where s.user_id=new.user_id
    and s.source_origin='https://estudiemos.estudiemos-services.workers.dev'
    and s.vapid_key_id='cf_20261029' and s.expires_at>now()) then
    perform public.mobile_push_project_agenda(new.user_id,new.state->'values'->'bandeja_agenda');
  end if;
  return new;
end $$;

create or replace function public.mobile_push_task_schedule()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='DELETE' then
    delete from public.mobile_push_jobs q using public.mobile_push_subscriptions s
      where q.subscription_id=s.id and s.user_id=old.user_id and q.task_id=old.task_id and q.sent_at is null;
    return old;
  end if;
  if TG_OP='UPDATE' and (new.alarm_date,new.alarm_time,new.repeat) is not distinct from
    (old.alarm_date,old.alarm_time,old.repeat) then return new; end if;
  if TG_OP='UPDATE' then
    delete from public.mobile_push_jobs q using public.mobile_push_subscriptions s
      where q.subscription_id=s.id and s.user_id=new.user_id and q.task_id=new.task_id and q.sent_at is null;
  end if;
  insert into public.mobile_push_schedule(subscription_id,user_id,task_id,occurrence,due_at)
    select s.id,new.user_id,new.task_id,n.at,n.at-interval '30 seconds'
    from public.mobile_push_subscriptions s
    cross join lateral (select public.mobile_push_next_occurrence(new.alarm_date,new.alarm_time,new.repeat,s.timezone,
      now()-interval '10 minutes'+interval '30 seconds') as at) n
    where s.user_id=new.user_id and s.expires_at>now()
      and s.source_origin='https://estudiemos.estudiemos-services.workers.dev' and s.vapid_key_id='cf_20261029'
    on conflict(subscription_id,task_id) do update set occurrence=excluded.occurrence,due_at=excluded.due_at;
  return new;
end $$;

create or replace function public.mobile_push_subscription_changed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='DELETE' then
    if not exists(select 1 from public.mobile_push_subscriptions where user_id=old.user_id
      and source_origin='https://estudiemos.estudiemos-services.workers.dev' and vapid_key_id='cf_20261029' and expires_at>now()) then
      delete from public.mobile_push_alarm_tasks where user_id=old.user_id;
    end if;
    return old;
  end if;
  if new.source_origin<>'https://estudiemos.estudiemos-services.workers.dev' or new.vapid_key_id<>'cf_20261029' then return new; end if;
  if TG_OP='UPDATE' and old.timezone=new.timezone and old.expires_at>now()
    and old.source_origin=new.source_origin and old.vapid_key_id=new.vapid_key_id then return new; end if;
  delete from public.mobile_push_jobs where subscription_id=new.id and sent_at is null;
  perform public.mobile_push_project_agenda(new.user_id,(select state->'values'->'bandeja_agenda' from public.user_states where user_id=new.user_id));
  insert into public.mobile_push_schedule(subscription_id,user_id,task_id,occurrence,due_at)
    select new.id,t.user_id,t.task_id,n.at,n.at-interval '30 seconds'
    from public.mobile_push_alarm_tasks t
    cross join lateral (select public.mobile_push_next_occurrence(t.alarm_date,t.alarm_time,t.repeat,new.timezone,
      now()-interval '10 minutes'+interval '30 seconds') as at) n
    where t.user_id=new.user_id and new.expires_at>now()
    on conflict(subscription_id,task_id) do update set occurrence=excluded.occurrence,due_at=excluded.due_at;
  return new;
end $$;

create or replace function public.enqueue_mobile_push_jobs(p_limit integer default 1000)
returns integer language plpgsql security definer set search_path='' as $$
declare entry record; at_time timestamptz; next_time timestamptz; added integer:=0; remaining integer;
begin
  if not exists(select 1 from public.mobile_push_origins where enabled
    and source_origin='https://estudiemos.estudiemos-services.workers.dev' and vapid_key_id='cf_20261029') then return 0; end if;
  if not exists(select 1 from public.mobile_push_schedule q join public.mobile_push_subscriptions s on s.id=q.subscription_id
    where q.due_at<=now() and s.expires_at>now() and s.source_origin='https://estudiemos.estudiemos-services.workers.dev'
      and s.vapid_key_id='cf_20261029') then return 0; end if;
  remaining:=greatest(0,20000-(select count(*) from public.mobile_push_jobs q
    join public.mobile_push_subscriptions s on s.id=q.subscription_id
    where q.occurrence>=date_trunc('day',now())
      and s.source_origin='https://estudiemos.estudiemos-services.workers.dev' and s.vapid_key_id='cf_20261029'));
  if remaining=0 then return 0; end if;
  for entry in select q.*,s.timezone,t.alarm_date,t.alarm_time,t.repeat from public.mobile_push_schedule q
    join public.mobile_push_subscriptions s on s.id=q.subscription_id
    join public.mobile_push_alarm_tasks t on t.user_id=q.user_id and t.task_id=q.task_id
    where q.due_at<=now() and s.expires_at>now()
      and s.source_origin='https://estudiemos.estudiemos-services.workers.dev' and s.vapid_key_id='cf_20261029'
    order by q.due_at,q.subscription_id,q.task_id limit least(greatest(p_limit,1),1000,remaining)
    for update of q skip locked loop
    at_time:=entry.occurrence;
    if at_time-interval '30 seconds'<now()-interval '10 minutes' then
      at_time:=public.mobile_push_next_occurrence(entry.alarm_date,entry.alarm_time,entry.repeat,entry.timezone,
        now()-interval '10 minutes'+interval '30 seconds');
    end if;
    if at_time-interval '30 seconds'<=now() then
      insert into public.mobile_push_jobs(subscription_id,task_id,occurrence)
        values(entry.subscription_id,entry.task_id,at_time) on conflict(subscription_id,task_id,occurrence) do nothing;
      if found then added:=added+1; end if;
      next_time:=public.mobile_push_next_occurrence(entry.alarm_date,entry.alarm_time,entry.repeat,entry.timezone,at_time+interval '1 microsecond');
    else next_time:=at_time; end if;
    update public.mobile_push_schedule set occurrence=next_time,due_at=next_time-interval '30 seconds'
      where subscription_id=entry.subscription_id and task_id=entry.task_id;
  end loop;
  return added;
end $$;

create or replace function public.tick_mobile_push()
returns void language plpgsql security definer set search_path='' as $$
declare token text; pending integer; worker integer;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(1793025042,1) then return; end if;
  if not exists(select 1 from public.mobile_push_origins where enabled
    and source_origin='https://estudiemos.estudiemos-services.workers.dev' and vapid_key_id='cf_20261029') then return; end if;
  select decrypted_secret into token from vault.decrypted_secrets where name='estudiemos_mobile_push_cron' limit 1;
  if token is null or length(token)<32 then return; end if;
  insert into public.mobile_push_health(id,heartbeat) values(true,now()) on conflict(id) do update set heartbeat=excluded.heartbeat;
  delete from public.mobile_push_jobs where occurrence<now()-interval '2 days';
  delete from public.mobile_push_subscriptions where expires_at<now();
  perform public.enqueue_mobile_push_jobs(1000);
  select count(*) into pending from (select 1 from public.mobile_push_jobs q
    join public.mobile_push_subscriptions s on s.id=q.subscription_id
    where s.source_origin='https://estudiemos.estudiemos-services.workers.dev' and s.vapid_key_id='cf_20261029'
      and s.expires_at>now() and q.sent_at is null and q.attempts<3 and q.available_at<=now()
      and q.occurrence-interval '30 seconds' between now()-interval '10 minutes' and now() limit 400) jobs;
  if pending>0 then
    for worker in 1..pending loop
      perform net.http_post(url:='https://estudiemos.estudiemos-services.workers.dev/api/widget-push?mobilePush=dispatch',
        headers:=jsonb_build_object('Authorization','Bearer '||token,'Content-Type','application/json'),
        body:='{}'::jsonb,timeout_milliseconds:=60000);
    end loop;
  end if;
end $$;

comment on function public.tick_mobile_push() is 'estudiemos-cloudflare-only-v1';

revoke all on function public.register_mobile_push_for_origin(uuid,jsonb,text,text,text),
  public.claim_mobile_push_batch(integer),public.claim_mobile_push_jobs(),public.mobile_push_state_changed(),
  public.mobile_push_task_schedule(),public.mobile_push_subscription_changed(),public.enqueue_mobile_push_jobs(integer),public.tick_mobile_push()
  from public,anon,authenticated,service_role;
grant execute on function public.register_mobile_push_for_origin(uuid,jsonb,text,text,text),
  public.claim_mobile_push_batch(integer),public.claim_mobile_push_jobs(),public.enqueue_mobile_push_jobs(integer) to service_role;
notify pgrst,'reload schema';
commit;
