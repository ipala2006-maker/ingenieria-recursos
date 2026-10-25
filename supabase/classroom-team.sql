-- Same private function and ACL: expose only the course team to existing members.
begin;
create or replace function public.classroom_detail(p_user uuid,p_class uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare course public.classrooms; events jsonb; materials jsonb; members jsonb; delegates jsonb:='[]';
begin
  select * into course from public.classrooms c where c.id=p_class and (c.owner_id=p_user or exists(select 1 from public.classroom_members m where m.class_id=c.id and m.user_id=p_user));
  if course.id is null then raise exception 'CLASS_UNAVAILABLE'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'data',data) order by data->>'date',id),'[]') into events from public.classroom_events where class_id=p_class;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'url',url) order by title,id),'[]') into materials from public.classroom_materials where class_id=p_class;
  if course.owner_id=p_user then
    select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(nullif(p.username,''),'Estudiante '||upper(left(m.user_id::text,6))),'role',case when course.owner_role='collaborator' then m.role else 'student' end,'permissions',case when course.owner_role='collaborator' and m.role='moderator' then m.permissions else '{}'::jsonb end) order by m.joined_at,m.user_id),'[]') into members
    from public.classroom_members m left join public.friend_profiles p on p.user_id=m.user_id where m.class_id=p_class;
  else members:='[]'::jsonb; end if;
  if course.owner_role='collaborator' then
    select coalesce(jsonb_agg(jsonb_build_object('name',coalesce(nullif(p.username,''),'Estudiante '||upper(left(m.user_id::text,6))),
      'permissions',jsonb_build_object('datesAdd',m.permissions @> '{"datesAdd":true}'::jsonb,'datesEdit',m.permissions @> '{"datesEdit":true}'::jsonb,'datesRemove',m.permissions @> '{"datesRemove":true}'::jsonb,
        'filesAdd',m.permissions @> '{"filesAdd":true}'::jsonb,'filesEdit',m.permissions @> '{"filesEdit":true}'::jsonb,'filesRemove',m.permissions @> '{"filesRemove":true}'::jsonb)) order by m.joined_at,m.user_id),'[]') into delegates
      from public.classroom_members m left join public.friend_profiles p on p.user_id=m.user_id where m.class_id=p_class and m.role='moderator';
  end if;
  return jsonb_build_object('id',p_class,'events',events,'materials',materials,'members',members,'team',
    jsonb_build_object('owner',jsonb_build_object('name',course.teacher_name,'role',course.owner_role),'delegates',delegates));
end $$;
notify pgrst,'reload schema';
commit;
