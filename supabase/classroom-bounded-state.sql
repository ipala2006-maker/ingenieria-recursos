-- Preserve response revisions and grants; change only the lookup plan.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '10s';

create or replace function public.classroom_state_compact(p_user uuid,p_revision text default '',p_versions jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rev text; versions jsonb; changed uuid[]; classes jsonb; events jsonb; hidden jsonb; accessible uuid[];
begin
  if p_user is null or not exists(select 1 from auth.users where id=p_user) then raise exception 'AUTH_REQUIRED'; end if;
  if jsonb_typeof(p_versions) is distinct from 'object' or octet_length(p_versions::text)>6500 or
    exists(select 1 from jsonb_each_text(p_versions) where key !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' or value !~ '^[a-f0-9]{32}$') then raise exception 'INVALID_DATA'; end if;
  select md5('calendar-visibility-v1:'||coalesce(string_agg(c.id::text||c.updated_at::text||coalesce(m.joined_at::text,'')||(h.class_id is not null)::text,',' order by c.id),'')),
    coalesce(jsonb_object_agg(c.id::text,md5(c.calendar_updated_at::text)) filter(where not c.archived),'{}'::jsonb),
    coalesce(array_agg(c.id) filter(where not c.archived and coalesce(p_versions->>c.id::text,'')<>md5(c.calendar_updated_at::text)),array[]::uuid[]),
    coalesce(jsonb_agg(c.id order by c.id) filter(where h.class_id is not null and not c.archived),'[]'::jsonb),
    coalesce(array_agg(c.id),array[]::uuid[])
  into rev,versions,changed,hidden,accessible
    from (select id from public.classrooms where owner_id=p_user
          union select class_id from public.classroom_members where user_id=p_user) scope
    join public.classrooms c on c.id=scope.id
    left join public.classroom_members m on m.class_id=c.id and m.user_id=p_user
    left join public.classroom_calendar_hidden h on h.user_id=p_user and h.class_id=c.id;
  if rev=p_revision and versions=p_versions then return jsonb_build_object('revision',rev,'unchanged',true); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'teacherName',c.teacher_name,'institution',c.institution,'timezone',c.timezone,'color',c.color,'archived',c.archived,'ownerRole',c.owner_role,
    'role',case when c.owner_id=p_user then c.owner_role when c.owner_role='collaborator' then m.role else 'student' end,
    'permissions',case when c.owner_id<>p_user and c.owner_role='collaborator' and m.role='moderator' then m.permissions else '{}'::jsonb end,
    'code',case when c.owner_id=p_user then c.invite_code else null end,'memberCount',(select count(*) from public.classroom_members where class_id=c.id))
    order by c.archived,c.title,c.id),'[]') into classes from public.classrooms c left join public.classroom_members m on m.class_id=c.id and m.user_id=p_user
    where c.id=any(accessible);
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'classId',c.id,'className',c.title,'timezone',c.timezone,'data',e.data) order by c.id,e.id),'[]') into events
    from public.classroom_events e join public.classrooms c on c.id=e.class_id where c.id=any(changed);
  return jsonb_build_object('revision',rev,'classes',classes,'calendarHidden',hidden,'calendarPatch',jsonb_build_object('versions',versions,'classes',to_jsonb(changed),'events',events));
end $$;
revoke all on function public.classroom_state_compact(uuid,text,jsonb) from public,anon,authenticated,service_role;

commit;
