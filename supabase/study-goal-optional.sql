-- Apply after study-goals.sql. Preserve the private helper's existing grants.
create or replace function public.study_goal_for_day(data jsonb, day date, today date)
returns integer language plpgsql immutable set search_path='' as $$
declare value text; stamp text;
begin
  if day=today then
    if data->'goal'->'enabled' = 'false'::jsonb then return 1; end if;
    stamp:=data->'goal'->>'updatedAt';
    if coalesce(stamp,'') !~ '^[0-9]{1,16}$' then return 1; end if;
    if stamp::bigint not between 1 and 9007199254740991 then return 1; end if;
    value:=data->'goal'->>'minutes';
  else
    value:=data->'dailyGoals'->day::text->>'minutes';
  end if;
  if coalesce(value,'') ~ '^[0-9]{1,3}$' then
    if value::integer between 1 and 720 then return value::integer; end if;
  end if;
  -- Old days without a recorded threshold retain the original rule.
  return case when day=today then 1 else 25 end;
end $$;
