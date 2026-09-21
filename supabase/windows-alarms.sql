-- The alarm service needs a narrow projection, not SELECT on all user state.
create or replace function public.get_windows_alarm_snapshot(p_user_id uuid)
returns table (updated_at timestamptz, alarm_items jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  agenda jsonb;
  modified timestamptz;
begin
  select s.state -> 'values' -> 'bandeja_agenda', s.updated_at
    into agenda, modified
    from public.user_states as s
    where s.user_id = p_user_id;

  -- Older clients store the agenda as a JSON-encoded string.
  if pg_catalog.jsonb_typeof(agenda) = 'string' then
    begin
      agenda := (agenda #>> '{}')::jsonb;
    exception when invalid_text_representation then
      agenda := '[]'::jsonb;
    end;
  end if;
  if pg_catalog.jsonb_typeof(agenda) is distinct from 'array' then
    agenda := '[]'::jsonb;
  end if;

  return query
    select modified, coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', pg_catalog.left(entry.value ->> 'id', 180),
        'title', pg_catalog.left(coalesce(nullif(entry.value ->> 'title', ''), 'Tarea pendiente'), 90),
        'alarm', pg_catalog.jsonb_build_object(
          'date', entry.value -> 'alarm' -> 'date',
          'time', entry.value -> 'alarm' -> 'time',
          'repeat', entry.value -> 'alarm' -> 'repeat',
          'windows', true
        )
      ) order by entry.position
    ), '[]'::jsonb)
    from pg_catalog.jsonb_array_elements(agenda) with ordinality as entry(value, position)
    where entry.position <= 500
      and pg_catalog.jsonb_typeof(entry.value -> 'id') = 'string'
      and entry.value -> 'alarm' -> 'windows' = 'true'::jsonb
      and entry.value -> 'done' is distinct from 'true'::jsonb;
end;
$$;

revoke all on function public.get_windows_alarm_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.get_windows_alarm_snapshot(uuid) to service_role;
comment on function public.get_windows_alarm_snapshot(uuid) is
  'Server-only: enabled Windows alarm titles and schedules for the signed feed owner. No account state or write access.';
