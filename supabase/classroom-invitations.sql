-- Keep direct table access closed; only the existing trusted server can call these.
begin;
create or replace function public.classroom_invitation(p_code text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare course public.classrooms; calendar jsonb;
begin
  if p_code is null or p_code !~ '^[A-HJ-NP-Z2-9]{10}$' then raise exception 'INVALID_CODE'; end if;
  select * into course from public.classrooms where invite_code=p_code and not archived;
  if course.id is null then raise exception 'INVALID_CODE'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'classId',course.id,'className',course.title,'timezone',course.timezone,
    'data',jsonb_build_object('title',e.data->'title','date',e.data->'date','start',e.data->'start','end',e.data->'end',
      'allDay',e.data->'allDay','type',e.data->'type','color',e.data->'color','repeat',e.data->'repeat',
      'days',coalesce(e.data->'days','[]'::jsonb),'endDate',coalesce(e.data->'endDate','""'::jsonb),'note',''))
    order by e.data->>'date',e.id),'[]'::jsonb) into calendar
    from (select id,data from public.classroom_events where class_id=course.id order by data->>'date',id limit 100) e;
  return jsonb_build_object('title',course.title,'teacherName',course.teacher_name,'institution',course.institution,'calendar',calendar);
end $$;
revoke all on function public.classroom_invitation(text) from public,anon,authenticated;
grant execute on function public.classroom_invitation(text) to service_role;

create or replace function public.classroom_delete(p_user uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
  if p_user is null or not exists(select 1 from auth.users where id=p_user) then raise exception 'AUTH_REQUIRED'; end if;
  select owner_id into owner from public.classrooms where id=p_id for update;
  if owner is null or owner<>p_user then raise exception 'CLASS_UNAVAILABLE'; end if;
  delete from public.classrooms where id=p_id and owner_id=p_user;
  return public.classroom_state(p_user)||jsonb_build_object('selected','');
end $$;
revoke all on function public.classroom_delete(uuid,uuid) from public,anon,authenticated;
grant execute on function public.classroom_delete(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
