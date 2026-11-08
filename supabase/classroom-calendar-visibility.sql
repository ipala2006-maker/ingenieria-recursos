-- Account-scoped calendar visibility; no changes to shared events or memberships.
begin;
-- A row exists only when the member has hidden this course in their own calendar.
create table if not exists public.classroom_calendar_hidden (
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classrooms(id) on delete cascade,
  primary key(user_id,class_id)
);
create index if not exists classroom_calendar_hidden_class on public.classroom_calendar_hidden(class_id);
alter table public.classroom_calendar_hidden enable row level security;
alter table public.classroom_calendar_hidden force row level security;
revoke all on public.classroom_calendar_hidden from public,anon,authenticated,service_role;

create or replace function public.classroom_set_calendar_visibility(p_class uuid,p_visible boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or not exists(select 1 from auth.users u where u.id=actor and to_jsonb(u)->>'deleted_at' is null) then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_visible is null then raise exception 'INVALID_DATA'; end if;
  if not exists(select 1 from public.classrooms c where c.id=p_class and not c.archived and
    (c.owner_id=actor or exists(select 1 from public.classroom_members m where m.class_id=c.id and m.user_id=actor))) then
    raise exception 'CLASS_UNAVAILABLE';
  end if;
  if p_visible then
    delete from public.classroom_calendar_hidden where user_id=actor and class_id=p_class;
  else
    insert into public.classroom_calendar_hidden(user_id,class_id) values(actor,p_class) on conflict do nothing;
  end if;
  return p_visible;
end $$;
revoke all on function public.classroom_set_calendar_visibility(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.classroom_set_calendar_visibility(uuid,boolean) to authenticated;

create or replace function public.classroom_state_compact(p_user uuid,p_revision text default '',p_versions jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rev text; versions jsonb; changed uuid[]; classes jsonb; events jsonb; hidden jsonb;
begin
  if p_user is null or not exists(select 1 from auth.users where id=p_user) then raise exception 'AUTH_REQUIRED'; end if;
  if jsonb_typeof(p_versions) is distinct from 'object' or octet_length(p_versions::text)>6500 or
    exists(select 1 from jsonb_each_text(p_versions) where key !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' or value !~ '^[a-f0-9]{32}$') then raise exception 'INVALID_DATA'; end if;
  select md5('calendar-visibility-v1:'||coalesce(string_agg(c.id::text||c.updated_at::text||coalesce(m.joined_at::text,'')||(h.class_id is not null)::text,',' order by c.id),'')),
    coalesce(jsonb_object_agg(c.id::text,md5(c.calendar_updated_at::text)) filter(where not c.archived),'{}'::jsonb),
    coalesce(array_agg(c.id) filter(where not c.archived and coalesce(p_versions->>c.id::text,'')<>md5(c.calendar_updated_at::text)),array[]::uuid[]),
    coalesce(jsonb_agg(c.id order by c.id) filter(where h.class_id is not null and not c.archived),'[]'::jsonb)
  into rev,versions,changed,hidden from public.classrooms c left join public.classroom_members m on m.class_id=c.id and m.user_id=p_user
    left join public.classroom_calendar_hidden h on h.user_id=p_user and h.class_id=c.id
    where c.owner_id=p_user or m.user_id=p_user;
  if rev=p_revision and versions=p_versions then return jsonb_build_object('revision',rev,'unchanged',true); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'teacherName',c.teacher_name,'institution',c.institution,'timezone',c.timezone,'color',c.color,'archived',c.archived,'ownerRole',c.owner_role,
    'role',case when c.owner_id=p_user then c.owner_role when c.owner_role='collaborator' then m.role else 'student' end,
    'permissions',case when c.owner_id<>p_user and c.owner_role='collaborator' and m.role='moderator' then m.permissions else '{}'::jsonb end,
    'code',case when c.owner_id=p_user then c.invite_code else null end,'memberCount',(select count(*) from public.classroom_members where class_id=c.id))
    order by c.archived,c.title,c.id),'[]') into classes from public.classrooms c left join public.classroom_members m on m.class_id=c.id and m.user_id=p_user
    where c.owner_id=p_user or m.user_id=p_user;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'classId',c.id,'className',c.title,'timezone',c.timezone,'data',e.data) order by c.id,e.id),'[]') into events
    from public.classroom_events e join public.classrooms c on c.id=e.class_id where c.id=any(changed);
  return jsonb_build_object('revision',rev,'classes',classes,'calendarHidden',hidden,'calendarPatch',jsonb_build_object('versions',versions,'classes',to_jsonb(changed),'events',events));
end $$;
revoke all on function public.classroom_state_compact(uuid,text,jsonb) from public,anon,authenticated,service_role;

notify pgrst,'reload schema';
commit;
