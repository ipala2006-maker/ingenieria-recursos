-- Apply after mobile-notifications.sql, then mobile-notifications-cron.sql.
-- Private projections only. Personal notes remain in user_states unchanged.
begin;
create table if not exists public.mobile_push_alarm_tasks (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null check(length(task_id) between 1 and 180),
  title text not null,
  alarm_date date not null,
  alarm_time time not null,
  repeat text not null check(repeat in ('none','daily','weekdays','weekly','monthly')),
  primary key(user_id,task_id)
);
create table if not exists public.mobile_push_schedule (
  subscription_id uuid not null references public.mobile_push_subscriptions(id) on delete cascade,
  user_id uuid not null,
  task_id text not null,
  occurrence timestamptz,
  due_at timestamptz,
  primary key(subscription_id,task_id),
  foreign key(user_id,task_id) references public.mobile_push_alarm_tasks(user_id,task_id) on delete cascade
);
create index if not exists mobile_push_schedule_due on public.mobile_push_schedule(due_at) where due_at is not null;
create index if not exists mobile_push_schedule_task on public.mobile_push_schedule(user_id,task_id);
create index if not exists mobile_push_subscription_expiry on public.mobile_push_subscriptions(expires_at);
create index if not exists mobile_push_job_occurrence on public.mobile_push_jobs(occurrence);
alter table public.mobile_push_alarm_tasks enable row level security;
alter table public.mobile_push_alarm_tasks force row level security;
alter table public.mobile_push_schedule enable row level security;
alter table public.mobile_push_schedule force row level security;
revoke all on public.mobile_push_alarm_tasks,public.mobile_push_schedule from public,anon,authenticated,service_role;

-- Inclusive lower bound, using each device's wall clock (including DST).
create or replace function public.mobile_push_next_occurrence(p_date date,p_time time,p_repeat text,p_timezone text,p_after timestamptz)
returns timestamptz language plpgsql stable set search_path='' as $$
declare day date:=greatest(p_date,(p_after at time zone p_timezone)::date); candidate timestamptz; offset_day integer;
begin
  if p_repeat not in ('none','daily','weekdays','weekly','monthly') then return null; end if;
  if p_repeat='none' then
    candidate:=(p_date+p_time) at time zone p_timezone;
    return case when candidate>=p_after then candidate else null end;
  end if;
  for offset_day in 0..370 loop
    if p_repeat='daily' or (p_repeat='weekdays' and extract(isodow from day)<=5)
      or (p_repeat='weekly' and extract(isodow from day)=extract(isodow from p_date))
      or (p_repeat='monthly' and extract(day from day)=extract(day from p_date)) then
      candidate:=(day+p_time) at time zone p_timezone;
      if candidate>=p_after then return candidate; end if;
    end if;
    day:=day+1;
  end loop;
  return null;
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
    on conflict(subscription_id,task_id) do update set occurrence=excluded.occurrence,due_at=excluded.due_at;
  return new;
end $$;
drop trigger if exists mobile_push_task_schedule on public.mobile_push_alarm_tasks;
create trigger mobile_push_task_schedule after insert or update or delete on public.mobile_push_alarm_tasks
  for each row execute function public.mobile_push_task_schedule();

create or replace function public.mobile_push_project_agenda(p_user uuid,p_agenda jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare agenda jsonb:=p_agenda; item jsonb; alarm jsonb; start_day date; clock time; kind text; ids text[]:='{}';
begin
  if pg_catalog.jsonb_typeof(agenda)='string' then
    begin agenda:=(agenda#>>'{}')::jsonb; exception when others then agenda:='[]'; end;
  end if;
  if pg_catalog.jsonb_typeof(agenda) is distinct from 'array' then agenda:='[]'; end if;
  -- Parse on agenda changes, never on the minute tick. Notes without alarms
  -- don't consume the 500-active-alarm limit.
  for item in select value from pg_catalog.jsonb_array_elements(agenda) loop
    alarm:=item->'alarm';
    if item->'done'='true'::jsonb or pg_catalog.jsonb_typeof(item->'id') is distinct from 'string'
      or length(item->>'id') not between 1 and 180 or (item->>'id')=any(ids) then continue; end if;
    if coalesce(alarm->>'date','') !~ '^(20[0-9]{2}|2100)-[0-9]{2}-[0-9]{2}$'
      or coalesce(alarm->>'time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then continue; end if;
    begin start_day:=(alarm->>'date')::date; clock:=(alarm->>'time')::time;
      exception when others then continue; end;
    kind:=coalesce(alarm->>'repeat','none');
    if start_day<date '2020-01-01' or kind not in ('none','daily','weekdays','weekly','monthly') then continue; end if;
    ids:=array_append(ids,item->>'id');
    insert into public.mobile_push_alarm_tasks(user_id,task_id,title,alarm_date,alarm_time,repeat)
      values(p_user,item->>'id',left(coalesce(nullif(item->>'title',''),'Tarea pendiente'),160),start_day,clock,kind)
      on conflict(user_id,task_id) do update set title=excluded.title,alarm_date=excluded.alarm_date,alarm_time=excluded.alarm_time,repeat=excluded.repeat
      where (mobile_push_alarm_tasks.title,mobile_push_alarm_tasks.alarm_date,mobile_push_alarm_tasks.alarm_time,mobile_push_alarm_tasks.repeat)
        is distinct from (excluded.title,excluded.alarm_date,excluded.alarm_time,excluded.repeat);
    if cardinality(ids)>=500 then exit; end if;
  end loop;
  delete from public.mobile_push_alarm_tasks where user_id=p_user and not(task_id=any(ids));
end $$;

create or replace function public.mobile_push_state_changed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.mobile_push_subscriptions where user_id=new.user_id and expires_at>now()) then
    perform public.mobile_push_project_agenda(new.user_id,new.state->'values'->'bandeja_agenda');
  end if;
  return new;
end $$;
drop trigger if exists mobile_push_state_inserted on public.user_states;
drop trigger if exists mobile_push_state_changed on public.user_states;
create trigger mobile_push_state_inserted after insert on public.user_states
  for each row execute function public.mobile_push_state_changed();
create trigger mobile_push_state_changed after update of state on public.user_states
  for each row when ((old.state->'values'->'bandeja_agenda') is distinct from (new.state->'values'->'bandeja_agenda'))
  execute function public.mobile_push_state_changed();

create or replace function public.mobile_push_subscription_changed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='DELETE' then
    if not exists(select 1 from public.mobile_push_subscriptions where user_id=old.user_id and expires_at>now()) then
      delete from public.mobile_push_alarm_tasks where user_id=old.user_id;
    end if;
    return old;
  end if;
  if TG_OP='UPDATE' and old.timezone=new.timezone and old.expires_at>now() then return new; end if;
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
drop trigger if exists mobile_push_subscription_changed on public.mobile_push_subscriptions;
create trigger mobile_push_subscription_changed after insert or update or delete on public.mobile_push_subscriptions
  for each row execute function public.mobile_push_subscription_changed();

-- Compatibility for older dispatchers; no calendar JSON is read here either.
create or replace function public.mobile_due_tasks(p_user uuid,p_timezone text)
returns table(task_id text,title text,occurrence timestamptz)
language sql stable security definer set search_path='' as $$
  select t.task_id,t.title,n.at from public.mobile_push_alarm_tasks t
    cross join lateral (select public.mobile_push_next_occurrence(t.alarm_date,t.alarm_time,t.repeat,p_timezone,
      now()-interval '10 minutes'+interval '30 seconds') as at) n
    where t.user_id=p_user and n.at-interval '30 seconds'<=now();
$$;

create or replace function public.enqueue_mobile_push_jobs(p_limit integer default 1000)
returns integer language plpgsql security definer set search_path='' as $$
declare entry record; at_time timestamptz; next_time timestamptz; added integer:=0; remaining integer;
begin
  -- Bound abusive fan-out, but never stop delivery of jobs already queued.
  if not exists(select 1 from public.mobile_push_schedule where due_at<=now()) then return 0; end if;
  remaining:=greatest(0,20000-(select count(*) from public.mobile_push_jobs where occurrence>=date_trunc('day',now())));
  if remaining=0 then return 0; end if;
  for entry in select q.*,s.timezone,t.alarm_date,t.alarm_time,t.repeat from public.mobile_push_schedule q
    join public.mobile_push_subscriptions s on s.id=q.subscription_id
    join public.mobile_push_alarm_tasks t on t.user_id=q.user_id and t.task_id=q.task_id
    where q.due_at<=now() and s.expires_at>now()
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

create or replace function public.claim_mobile_push_batch(p_limit integer default 100)
returns table(id bigint,subscription jsonb,title text,tag text,owner uuid)
language plpgsql security definer set search_path='' as $$
declare j record;
begin
  for j in select q.id,s.subscription,s.user_id,t.title from public.mobile_push_jobs q
    join public.mobile_push_subscriptions s on s.id=q.subscription_id
    join public.mobile_push_alarm_tasks t on t.user_id=s.user_id and t.task_id=q.task_id
    where q.sent_at is null and q.attempts<3 and q.available_at<=now() and s.expires_at>now()
      and q.occurrence-interval '30 seconds'>=now()-interval '10 minutes'
      and q.occurrence-interval '30 seconds'<=now()
      and public.mobile_push_next_occurrence(t.alarm_date,t.alarm_time,t.repeat,s.timezone,q.occurrence)=q.occurrence
    order by q.available_at,q.id limit least(greatest(p_limit,1),100) for update of q skip locked loop
    update public.mobile_push_jobs set attempts=attempts+1,available_at=now()+interval '2 minutes' where mobile_push_jobs.id=j.id;
    id:=j.id;subscription:=j.subscription;title:=j.title;tag:='inbox-'||j.id::text;owner:=j.user_id;return next;
  end loop;
end $$;

-- Keep old deployments safe during rollout/rollback: their sender was serial.
create or replace function public.claim_mobile_push_jobs()
returns table(id bigint,subscription jsonb,title text,tag text,owner uuid)
language sql security definer set search_path='' as $$
  select * from public.claim_mobile_push_batch(5);
$$;

create or replace function public.finish_mobile_push_jobs(p_results jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results)>100 then raise exception 'INVALID_DATA'; end if;
  for result in select value from jsonb_array_elements(p_results) loop
    perform public.finish_mobile_push_job((result->>'id')::bigint,(result->>'ok')::boolean,(result->>'expired')::boolean);
  end loop;
end $$;

-- Populate only accounts with a live mobile subscription, once during migration.
do $$ declare account record; begin
  for account in select u.user_id,u.state->'values'->'bandeja_agenda' as agenda from public.user_states u
    where exists(select 1 from public.mobile_push_subscriptions s where s.user_id=u.user_id and s.expires_at>now()) loop
    perform public.mobile_push_project_agenda(account.user_id,account.agenda);
  end loop;
end $$;
revoke all on function public.mobile_push_next_occurrence(date,time,text,text,timestamptz),public.mobile_push_task_schedule(),
  public.mobile_push_project_agenda(uuid,jsonb),public.mobile_push_state_changed(),public.mobile_push_subscription_changed(),
  public.mobile_due_tasks(uuid,text),public.enqueue_mobile_push_jobs(integer),public.claim_mobile_push_batch(integer),public.claim_mobile_push_jobs(),public.finish_mobile_push_jobs(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.enqueue_mobile_push_jobs(integer),public.claim_mobile_push_batch(integer),public.claim_mobile_push_jobs(),public.finish_mobile_push_jobs(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
