-- Keep historical thresholds, and expose only today's aggregate to a connected PC.
create or replace function public.study_goal_for_day(data jsonb, day date, today date)
returns integer language plpgsql immutable set search_path='' as $$
declare value text; stamp text;
begin
  if day=today then
    stamp:=data->'goal'->>'updatedAt';
    if coalesce(stamp,'') !~ '^[0-9]{1,16}$' then return 25; end if;
    if stamp::bigint<=0 or stamp::bigint>9007199254740991 then return 25; end if;
  end if;
  value := case when day=today then data->'goal'->>'minutes'
    else data->'dailyGoals'->day::text->>'minutes' end;
  if coalesce(value,'') !~ '^[0-9]{1,3}$' then return 25; end if;
  if value::integer between 1 and 720 then return value::integer; end if;
  return 25;
end $$;
revoke all on function public.study_goal_for_day(jsonb,date,date) from public,anon,authenticated,service_role;

create or replace function public.get_windows_study_goal(p_user_id uuid,p_date date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare data jsonb; amount text; minutes integer:=0; configured boolean:=false;
begin
  if p_date is null or p_date < (now() at time zone 'UTC')::date-2 or p_date > (now() at time zone 'UTC')::date+2 then return null; end if;
  select s.state->'values'->'estudiemos_pomodoro_streak' into data from public.user_states s where s.user_id=p_user_id;
  if pg_catalog.jsonb_typeof(data)='string' then
    begin data:=(data#>>'{}')::jsonb; exception when invalid_text_representation then return null; end;
  end if;
  if pg_catalog.jsonb_typeof(data) is distinct from 'object' then return null; end if;
  amount:=data->'days'->>p_date::text;
  if coalesce(amount,'') ~ '^[0-9]{1,5}$' then minutes:=least(amount::integer,1440); end if;
  configured:=coalesce(data->'goal'->>'minutes','') ~ '^[0-9]{1,3}$'
    and coalesce(data->'goal'->>'updatedAt','') ~ '^[0-9]{1,16}$';
  if configured then configured:=(data->'goal'->>'minutes')::integer between 1 and 720 and (data->'goal'->>'updatedAt')::bigint between 1 and 9007199254740991; end if;
  return pg_catalog.jsonb_build_object('date',p_date::text,'minutes',minutes,
    'goalMinutes',public.study_goal_for_day(data,p_date,p_date),'configured',configured);
end $$;
revoke all on function public.get_windows_study_goal(uuid,date) from public,anon,authenticated;
grant execute on function public.get_windows_study_goal(uuid,date) to service_role;
comment on function public.get_windows_study_goal(uuid,date) is 'Server-only aggregate for a connected owner: local day, studied minutes and daily goal. No history, tasks, email or write access.';

create or replace function public.friend_streak(p_user uuid,p_zone text)
returns integer language plpgsql stable security definer set search_path='' as $$
declare data jsonb; day date; today date; minutes numeric; total integer:=0;
begin
  select state->'values'->'estudiemos_pomodoro_streak' into data from public.user_states where user_id=p_user;
  if pg_catalog.jsonb_typeof(data)='string' then
    begin data:=(data#>>'{}')::jsonb; exception when invalid_text_representation then return 0; end;
  end if;
  today:=(now() at time zone p_zone)::date; day:=today;
  if coalesce(data->'days'->>day::text,'') !~ '^[0-9]+(\.[0-9]+)?$' then minutes:=0;
  else minutes:=(data->'days'->>day::text)::numeric; end if;
  if minutes<public.study_goal_for_day(data,day,today) then day:=day-1; end if;
  for i in 1..730 loop
    if coalesce(data->'days'->>day::text,'') !~ '^[0-9]+(\.[0-9]+)?$' then exit; end if;
    if (data->'days'->>day::text)::numeric<public.study_goal_for_day(data,day,today) then exit; end if;
    total:=total+1; day:=day-1;
  end loop;
  return total;
end $$;
revoke all on function public.friend_streak(uuid,text) from public,anon,authenticated,service_role;
