-- Additive migration. Preserve existing subscriptions, alarms and queued jobs.
-- Cloudflare stays disabled until its credentials, code and delivery are tested.
begin;
create table if not exists public.mobile_push_origins (
  source_origin text not null,
  vapid_key_id text not null,
  enabled boolean not null default false,
  primary key(source_origin,vapid_key_id),
  check ((source_origin='https://estudiemos-app.vercel.app' and vapid_key_id='legacy')
    or (source_origin='https://estudiemos.estudiemos-services.workers.dev' and vapid_key_id='cf_20261029'))
);
alter table public.mobile_push_origins enable row level security;
alter table public.mobile_push_origins force row level security;
revoke all on public.mobile_push_origins from public,anon,authenticated,service_role;
insert into public.mobile_push_origins(source_origin,vapid_key_id,enabled) values
  ('https://estudiemos-app.vercel.app','legacy',true),
  ('https://estudiemos.estudiemos-services.workers.dev','cf_20261029',false)
  on conflict(source_origin,vapid_key_id) do nothing;

alter table public.mobile_push_subscriptions add column if not exists source_origin text not null default 'https://estudiemos-app.vercel.app';
alter table public.mobile_push_subscriptions add column if not exists vapid_key_id text not null default 'legacy';
do $$ begin
  if not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.mobile_push_subscriptions'::regclass and conname='mobile_push_subscription_scope') then
    alter table public.mobile_push_subscriptions add constraint mobile_push_subscription_scope
      foreign key(source_origin,vapid_key_id) references public.mobile_push_origins(source_origin,vapid_key_id);
  end if;
end $$;
create index if not exists mobile_push_subscription_scope_expiry
  on public.mobile_push_subscriptions(source_origin,vapid_key_id,expires_at);

create or replace function public.mobile_push_ready_for_origin(p_origin text,p_key_id text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.mobile_push_origins
    where source_origin=p_origin and vapid_key_id=p_key_id and enabled)
    and public.mobile_push_ready();
$$;

create or replace function public.register_mobile_push_for_origin(
  p_user uuid,p_subscription jsonb,p_timezone text,p_origin text,p_key_id text)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare endpoint_value text:=p_subscription->>'endpoint'; expiry timestamptz:=now()+interval '90 days';
begin
  if not exists(select 1 from public.mobile_push_origins where source_origin=p_origin and vapid_key_id=p_key_id and enabled)
    then raise exception 'PUSH_SCOPE_NOT_READY'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone)
    or endpoint_value is null or length(endpoint_value)>2048 then raise exception 'Invalid subscription'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,4300));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(endpoint_value,4301));
  if exists(select 1 from public.mobile_push_subscriptions where endpoint=endpoint_value
    and (user_id<>p_user or source_origin<>p_origin or vapid_key_id<>p_key_id))
    then raise exception 'Subscription belongs to another account or origin'; end if;
  if not exists(select 1 from public.mobile_push_subscriptions where endpoint=endpoint_value)
    and (select count(*) from public.mobile_push_subscriptions where user_id=p_user and expires_at>now())>=5
    then raise exception 'Device limit reached'; end if;
  insert into public.mobile_push_subscriptions(user_id,endpoint,subscription,timezone,expires_at,source_origin,vapid_key_id)
    values(p_user,endpoint_value,p_subscription,p_timezone,expiry,p_origin,p_key_id)
    on conflict(endpoint) do update set subscription=excluded.subscription,timezone=excluded.timezone,expires_at=excluded.expires_at;
  return expiry;
end $$;

-- Exact old signature: old Vercel clients cannot silently retag a new endpoint.
create or replace function public.register_mobile_push(p_user uuid,p_subscription jsonb,p_timezone text)
returns timestamptz language sql security definer set search_path='' as $$
  select public.register_mobile_push_for_origin(p_user,p_subscription,p_timezone,
    'https://estudiemos-app.vercel.app','legacy');
$$;

create or replace function public.claim_mobile_push_origin_batch(p_origin text,p_key_id text,p_limit integer default 1)
returns table(id bigint,subscription jsonb,title text,tag text,owner uuid)
language plpgsql security definer set search_path='' as $$
declare j record;
begin
  if not exists(select 1 from public.mobile_push_origins where source_origin=p_origin and vapid_key_id=p_key_id)
    then raise exception 'INVALID_PUSH_SCOPE'; end if;
  if not exists(select 1 from public.mobile_push_origins where source_origin=p_origin and vapid_key_id=p_key_id and enabled)
    then return; end if;
  for j in select q.id,s.subscription,s.user_id,t.title from public.mobile_push_jobs q
    join public.mobile_push_subscriptions s on s.id=q.subscription_id
    join public.mobile_push_alarm_tasks t on t.user_id=s.user_id and t.task_id=q.task_id
    where q.sent_at is null and q.attempts<3 and q.available_at<=now() and s.expires_at>now()
      and s.source_origin=p_origin and s.vapid_key_id=p_key_id
      and q.occurrence-interval '30 seconds'>=now()-interval '10 minutes'
      and q.occurrence-interval '30 seconds'<=now()
      and public.mobile_push_next_occurrence(t.alarm_date,t.alarm_time,t.repeat,s.timezone,q.occurrence)=q.occurrence
    order by q.available_at,q.id limit least(greatest(p_limit,1),100) for update of q skip locked loop
    update public.mobile_push_jobs set attempts=attempts+1,available_at=now()+interval '2 minutes' where mobile_push_jobs.id=j.id;
    id:=j.id;subscription:=j.subscription;title:=j.title;tag:='inbox-'||j.id::text;owner:=j.user_id;return next;
  end loop;
end $$;

-- Never let the old dispatcher reserve a job encrypted for the new key.
create or replace function public.claim_mobile_push_batch(p_limit integer default 100)
returns table(id bigint,subscription jsonb,title text,tag text,owner uuid)
language sql security definer set search_path='' as $$
  select * from public.claim_mobile_push_origin_batch('https://estudiemos-app.vercel.app','legacy',p_limit);
$$;
create or replace function public.claim_mobile_push_jobs()
returns table(id bigint,subscription jsonb,title text,tag text,owner uuid)
language sql security definer set search_path='' as $$ select * from public.claim_mobile_push_batch(5); $$;

-- One existing cron, two fixed destinations, no extra empty HTTP polling.
create or replace function public.tick_mobile_push()
returns void language plpgsql security definer set search_path='' as $$
declare token text; target record; pending integer; worker integer; pending_scopes integer;
  quota integer; endpoint text; batch_size integer; timeout_ms integer;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(1793025042,1) then return; end if;
  select decrypted_secret into token from vault.decrypted_secrets where name='estudiemos_mobile_push_cron' limit 1;
  if token is null or length(token)<32 then return; end if;
  insert into public.mobile_push_health(id,heartbeat) values(true,now()) on conflict(id) do update set heartbeat=excluded.heartbeat;
  delete from public.mobile_push_jobs where occurrence<now()-interval '2 days';
  delete from public.mobile_push_subscriptions where expires_at<now();
  perform public.enqueue_mobile_push_jobs(1000);
  select count(*) into pending_scopes from public.mobile_push_origins o where o.enabled and exists(
    select 1 from public.mobile_push_jobs q join public.mobile_push_subscriptions s on s.id=q.subscription_id
    where s.source_origin=o.source_origin and s.vapid_key_id=o.vapid_key_id and s.expires_at>now()
      and q.sent_at is null and q.attempts<3 and q.available_at<=now()
      and q.occurrence-interval '30 seconds' between now()-interval '10 minutes' and now());
  if pending_scopes=0 then return; end if;
  quota:=400/pending_scopes;
  for target in select * from public.mobile_push_origins where enabled order by source_origin loop
    select count(*) into pending from (select 1 from public.mobile_push_jobs q
      join public.mobile_push_subscriptions s on s.id=q.subscription_id
      where s.source_origin=target.source_origin and s.vapid_key_id=target.vapid_key_id and s.expires_at>now()
        and q.sent_at is null and q.attempts<3 and q.available_at<=now()
        and q.occurrence-interval '30 seconds' between now()-interval '10 minutes' and now() limit quota) jobs;
    if target.source_origin='https://estudiemos-app.vercel.app' and target.vapid_key_id='legacy' then
      endpoint:='https://estudiemos-app.vercel.app/api/widget-push?mobilePush=dispatch';batch_size:=100;timeout_ms:=100000;
    elsif target.source_origin='https://estudiemos.estudiemos-services.workers.dev' and target.vapid_key_id='cf_20261029' then
      endpoint:='https://estudiemos.estudiemos-services.workers.dev/api/widget-push?mobilePush=dispatch';batch_size:=1;timeout_ms:=60000;
    else raise exception 'INVALID_PUSH_SCOPE'; end if;
    if pending>0 then
      for worker in 1..((pending+batch_size-1)/batch_size) loop
        perform net.http_post(url:=endpoint,headers:=jsonb_build_object('Authorization','Bearer '||token,'Content-Type','application/json'),
          body:='{}'::jsonb,timeout_milliseconds:=timeout_ms);
      end loop;
    end if;
  end loop;
end $$;

revoke all on function public.mobile_push_ready_for_origin(text,text),public.register_mobile_push_for_origin(uuid,jsonb,text,text,text),
  public.register_mobile_push(uuid,jsonb,text),public.claim_mobile_push_origin_batch(text,text,integer),
  public.claim_mobile_push_batch(integer),public.claim_mobile_push_jobs(),public.tick_mobile_push()
  from public,anon,authenticated,service_role;
grant execute on function public.mobile_push_ready_for_origin(text,text),public.register_mobile_push_for_origin(uuid,jsonb,text,text,text),
  public.register_mobile_push(uuid,jsonb,text),public.claim_mobile_push_origin_batch(text,text,integer),
  public.claim_mobile_push_batch(integer),public.claim_mobile_push_jobs() to service_role;
notify pgrst,'reload schema';
commit;
