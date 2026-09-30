-- Server-only Web Push. No public table access; no paid scheduler or SMS provider.
create table if not exists public.mobile_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) <= 2048),
  subscription jsonb not null,
  timezone text not null,
  expires_at timestamptz not null default now() + interval '90 days'
);
create index if not exists mobile_push_user on public.mobile_push_subscriptions(user_id);
create table if not exists public.mobile_push_jobs (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.mobile_push_subscriptions(id) on delete cascade,
  task_id text not null,
  occurrence timestamptz not null,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  unique(subscription_id, task_id, occurrence)
);
create index if not exists mobile_push_pending on public.mobile_push_jobs(available_at) where sent_at is null;
create table if not exists public.mobile_push_health (
  id boolean primary key default true check(id),
  heartbeat timestamptz not null
);
alter table public.mobile_push_subscriptions enable row level security;
alter table public.mobile_push_subscriptions force row level security;
alter table public.mobile_push_jobs enable row level security;
alter table public.mobile_push_jobs force row level security;
alter table public.mobile_push_health enable row level security;
alter table public.mobile_push_health force row level security;
revoke all on public.mobile_push_subscriptions, public.mobile_push_jobs, public.mobile_push_health from public, anon, authenticated;

create or replace function public.register_mobile_push(p_user uuid, p_subscription jsonb, p_timezone text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare endpoint_value text := p_subscription->>'endpoint'; expiry timestamptz := now() + interval '90 days';
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone)
    or length(endpoint_value) > 2048 or endpoint_value is null then raise exception 'Invalid subscription'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text, 4300));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(endpoint_value, 4301));
  if exists(select 1 from public.mobile_push_subscriptions where endpoint = endpoint_value and user_id <> p_user)
    then raise exception 'Subscription belongs to another account'; end if;
  if not exists(select 1 from public.mobile_push_subscriptions where endpoint = endpoint_value)
    and (select count(*) from public.mobile_push_subscriptions where user_id = p_user and expires_at > now()) >= 5
    then raise exception 'Device limit reached'; end if;
  insert into public.mobile_push_subscriptions(user_id, endpoint, subscription, timezone, expires_at)
    values(p_user, endpoint_value, p_subscription, p_timezone, expiry)
    on conflict(endpoint) do update set subscription=excluded.subscription, timezone=excluded.timezone, expires_at=excluded.expires_at;
  return expiry;
end $$;

-- Recurrence uses the subscribed device's timezone, never the database server's timezone.
create or replace function public.mobile_due_tasks(p_user uuid, p_timezone text)
returns table(task_id text, title text, occurrence timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare agenda jsonb; item jsonb; alarm jsonb; start_day date; day date; clock time; candidate timestamptz; kind text;
begin
  select state->'values'->'bandeja_agenda' into agenda from public.user_states where user_id = p_user;
  if pg_catalog.jsonb_typeof(agenda) = 'string' then
    begin agenda := (agenda #>> '{}')::jsonb; exception when others then return; end;
  end if;
  if pg_catalog.jsonb_typeof(agenda) is distinct from 'array' then return; end if;
  for item in select value from pg_catalog.jsonb_array_elements(agenda) limit 500 loop
    alarm := item->'alarm';
    if item->'done' = 'true'::jsonb or pg_catalog.jsonb_typeof(item->'id') is distinct from 'string'
       or length(item->>'id') > 180 or coalesce(item->>'id','') = '' then continue; end if;
    if coalesce(alarm->>'date','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
       or coalesce(alarm->>'time','') !~ '^[0-2][0-9]:[0-5][0-9]$' then continue; end if;
    begin start_day := (alarm->>'date')::date; clock := (alarm->>'time')::time;
    exception when others then continue; end;
    kind := coalesce(alarm->>'repeat','none');
    for day in select d::date from pg_catalog.generate_series(
      ((now() - interval '10 minutes') at time zone p_timezone)::date::timestamp,
      (now() at time zone p_timezone)::date::timestamp, interval '1 day') d loop
      if day < start_day then continue; end if;
      if not (kind='daily' or (kind='none' and day=start_day)
        or (kind='weekdays' and extract(isodow from day)<=5)
        or (kind='weekly' and extract(isodow from day)=extract(isodow from start_day))
        or (kind='monthly' and extract(day from day)=extract(day from start_day))) then continue; end if;
      candidate := (day + clock) at time zone p_timezone;
      if candidate > now() or candidate < now() - interval '10 minutes' then continue; end if;
      task_id := item->>'id'; title := left(coalesce(nullif(item->>'title',''),'Tarea pendiente'),160);
      occurrence := candidate; return next;
    end loop;
  end loop;
end $$;

create or replace function public.claim_mobile_push_jobs()
returns table(id bigint, subscription jsonb, title text, tag text, owner uuid)
language plpgsql security definer set search_path = '' as $$
declare j record; task record;
begin
  -- Bound work per invocation. A short lease allows transient failures to retry.
  for j in select q.*, s.subscription, s.user_id, s.timezone from public.mobile_push_jobs q
    join public.mobile_push_subscriptions s on s.id=q.subscription_id
    where q.sent_at is null and q.attempts<3 and q.available_at<=now()
      and q.occurrence >= now()-interval '10 minutes' and s.expires_at>now()
    order by q.available_at limit 5 for update of q skip locked loop
    select t.* into task from public.mobile_due_tasks(j.user_id,j.timezone) t
      where t.task_id=j.task_id and t.occurrence=j.occurrence;
    if not found then delete from public.mobile_push_jobs where mobile_push_jobs.id=j.id; continue; end if;
    update public.mobile_push_jobs set attempts=attempts+1, available_at=now()+interval '2 minutes' where mobile_push_jobs.id=j.id;
    id:=j.id; subscription:=j.subscription; title:=task.title;
    tag:='inbox-'||j.id::text; owner:=j.user_id; return next;
  end loop;
end $$;

create or replace function public.finish_mobile_push_job(p_id bigint, p_ok boolean, p_expired boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_expired then
    delete from public.mobile_push_subscriptions where id=(select subscription_id from public.mobile_push_jobs where id=p_id);
  elsif p_ok then update public.mobile_push_jobs set sent_at=now() where id=p_id;
  end if;
end $$;
create or replace function public.mobile_push_ready()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.mobile_push_health where heartbeat>now()-interval '3 minutes');
$$;

revoke all on function public.register_mobile_push(uuid,jsonb,text), public.mobile_due_tasks(uuid,text),
  public.claim_mobile_push_jobs(), public.finish_mobile_push_job(bigint,boolean,boolean), public.mobile_push_ready()
  from public, anon, authenticated;
grant execute on function public.register_mobile_push(uuid,jsonb,text), public.claim_mobile_push_jobs(),
  public.finish_mobile_push_job(bigint,boolean,boolean), public.mobile_push_ready() to service_role;

-- Run the optional activation file only after VAPID and the shared cron secret are configured.
