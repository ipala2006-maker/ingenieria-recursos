begin;

-- The local Windows installer gets one bounded snapshot after explicit consent.
create or replace function public.get_windows_local_setup_snapshot(p_user_id uuid, p_date date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  agenda jsonb; progress jsonb; modified timestamptz; items jsonb;
  amount text; minutes integer:=0; configured boolean:=false; study jsonb:=null;
begin
  if p_date is null or p_date < (now() at time zone 'UTC')::date-2
    or p_date > (now() at time zone 'UTC')::date+2 then
    raise invalid_parameter_value using message='Invalid local setup date';
  end if;
  select s.state->'values'->'bandeja_agenda',
    s.state->'values'->'estudiemos_pomodoro_streak', s.updated_at
    into agenda,progress,modified from public.user_states s where s.user_id=p_user_id;
  if pg_catalog.jsonb_typeof(agenda)='string' then
    begin agenda:=(agenda#>>'{}')::jsonb; exception when invalid_text_representation then agenda:='[]'::jsonb; end;
  end if;
  if pg_catalog.jsonb_typeof(agenda) is distinct from 'array' then agenda:='[]'::jsonb; end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',pg_catalog.left(entry.value->>'id',180),
    'title',pg_catalog.left(coalesce(nullif(entry.value->>'title',''),'Tarea pendiente'),90),
    'alarm',pg_catalog.jsonb_build_object('date',entry.value->'alarm'->'date',
      'time',entry.value->'alarm'->'time','repeat',entry.value->'alarm'->'repeat','windows',true)
    ) order by entry.position),'[]'::jsonb) into items
    from pg_catalog.jsonb_array_elements(agenda) with ordinality entry(value,position)
    where entry.position<=500 and pg_catalog.jsonb_typeof(entry.value->'id')='string'
      and pg_catalog.jsonb_typeof(entry.value->'alarm')='object'
      and entry.value->'done' is distinct from 'true'::jsonb;
  if pg_catalog.jsonb_typeof(progress)='string' then
    begin progress:=(progress#>>'{}')::jsonb; exception when invalid_text_representation then progress:=null; end;
  end if;
  if pg_catalog.jsonb_typeof(progress)='object' then
    amount:=progress->'days'->>p_date::text;
    if coalesce(amount,'') ~ '^[0-9]{1,5}$' then minutes:=least(amount::integer,1440); end if;
    configured:=coalesce(progress->'goal'->>'minutes','') ~ '^[0-9]{1,3}$'
      and coalesce(progress->'goal'->>'updatedAt','') ~ '^[0-9]{1,16}$';
    if configured then configured:=(progress->'goal'->>'minutes')::integer between 1 and 720
      and (progress->'goal'->>'updatedAt')::bigint between 1 and 9007199254740991; end if;
    study:=pg_catalog.jsonb_build_object('date',p_date::text,'minutes',minutes,
      'goalMinutes',public.study_goal_for_day(progress,p_date,p_date),'configured',configured);
  end if;
  return pg_catalog.jsonb_build_object('version',1,'updatedAt',modified,'items',items,'study',study);
end $$;
revoke all on function public.get_windows_local_setup_snapshot(uuid,date) from public,anon,authenticated;
grant execute on function public.get_windows_local_setup_snapshot(uuid,date) to service_role;

-- Old callers get constants: no account reads, JSON scans or state changes.
create or replace function public.get_windows_alarm_snapshot(p_user_id uuid)
returns table(updated_at timestamptz,alarm_items jsonb)
language sql stable set search_path='' as $$ select null::timestamptz,'[]'::jsonb $$;
create or replace function public.get_windows_study_goal(p_user_id uuid,p_date date)
returns jsonb language sql stable set search_path='' as $$
  select '{"deprecated":true,"code":"WINDOWS_LOCAL_ALARMS_REQUIRED"}'::jsonb
$$;
revoke all on function public.get_windows_alarm_snapshot(uuid) from public,anon,authenticated;
revoke all on function public.get_windows_study_goal(uuid,date) from public,anon,authenticated;
grant execute on function public.get_windows_alarm_snapshot(uuid) to service_role;
grant execute on function public.get_windows_study_goal(uuid,date) to service_role;

-- Keep historical objects private and readable/deletable by their owners.
drop policy if exists "Students upload their private files" on storage.objects;
drop policy if exists "Students update their private files" on storage.objects;
drop policy if exists "Retired workspace rejects uploads" on storage.objects;
create policy "Retired workspace rejects uploads" on storage.objects as restrictive
  for insert to anon,authenticated with check(bucket_id<>'workspace-files');
drop policy if exists "Retired workspace rejects updates" on storage.objects;
create policy "Retired workspace rejects updates" on storage.objects as restrictive
  for update to anon,authenticated using(bucket_id<>'workspace-files') with check(bucket_id<>'workspace-files');
revoke insert,update on public.workspace_items from anon,authenticated;
revoke truncate,trigger,references on public.workspace_items from public,anon,authenticated,service_role;
create or replace function public.workspace_storage_upload_allowed(target_name text,target_metadata jsonb)
returns boolean language sql immutable set search_path='' as $$ select false $$;
revoke all on function public.workspace_storage_upload_allowed(text,jsonb) from public,anon,authenticated;

-- Test plans are archived, never a source of commercial entitlements.
create or replace function public.set_test_plan(target_plan text)
returns jsonb language plpgsql set search_path='' as $$
begin raise feature_not_supported using message='PLAN_ASSIGNMENT_DISABLED'; end $$;
revoke all on function public.set_test_plan(text) from public,anon,authenticated,service_role;

comment on function public.get_windows_alarm_snapshot(uuid) is 'Retired constant response. Never reads user state. Use local Windows scheduling.';
comment on function public.get_windows_study_goal(uuid,date) is 'Retired constant response. Never reads study history.';
comment on function public.get_windows_local_setup_snapshot(uuid,date) is 'Server-only one-time local Windows setup after signed consent, not a periodic feed.';
commit;
