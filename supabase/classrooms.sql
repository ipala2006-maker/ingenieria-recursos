-- Class data is shared only after an authenticated, explicit enrollment.
-- No access to user_states, Drive credentials, personal notes, or student emails.
begin;
create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  title text not null check(length(title) between 1 and 90),
  teacher_name text not null check(length(teacher_name) between 1 and 60),
  institution text not null default '' check(length(institution)<=90),
  timezone text not null,
  color text not null default 'blue' check(color in ('blue','teal','violet','rose','amber')),
  invite_code text not null unique check(invite_code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  archived boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);
create index if not exists classrooms_owner on public.classrooms(owner_id);
create table if not exists public.classroom_members (
  class_id uuid not null references public.classrooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default clock_timestamp(),
  primary key(class_id,user_id)
);
create index if not exists classroom_members_user on public.classroom_members(user_id);
create table if not exists public.classroom_events (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classrooms(id) on delete cascade,
  data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<=6000)
);
create index if not exists classroom_events_class on public.classroom_events(class_id);
create table if not exists public.classroom_materials (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classrooms(id) on delete cascade,
  title text not null check(length(title) between 1 and 120),
  url text not null check(length(url)<=1200 and url ~ '^https://(drive|docs)\.google\.com/')
);
create index if not exists classroom_materials_class on public.classroom_materials(class_id);
-- Additive upgrade: existing courses remain teacher-managed until their owner changes the mode.
alter table public.classrooms add column if not exists owner_role text not null default 'teacher' check(owner_role in ('teacher','collaborator'));
alter table public.classroom_members add column if not exists role text not null default 'student' check(role in ('student','moderator'));
alter table public.classroom_members add column if not exists permissions jsonb not null default '{}' check(jsonb_typeof(permissions)='object');
-- RESILIENCE SCHEMA BEGIN
alter table public.classrooms alter column owner_id drop not null;
alter table public.classrooms drop constraint if exists classrooms_owner_id_fkey;
alter table public.classrooms add constraint classrooms_owner_id_fkey foreign key(owner_id) references auth.users(id) on delete set null;
alter table public.classrooms add column if not exists calendar_updated_at timestamptz not null default clock_timestamp();
alter table public.classroom_events add column if not exists version bigint not null default 1 check(version>0);
alter table public.classroom_materials add column if not exists version bigint not null default 1 check(version>0);
create table if not exists public.classroom_blocks (
  class_id uuid not null references public.classrooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key(class_id,user_id)
);
create table if not exists public.classroom_changes (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classrooms(id) on delete cascade,
  actor_name text not null check(length(actor_name)<=60),
  actor_role text not null check(actor_role in ('teacher','collaborator','moderator')),
  action text not null check(length(action)<=40),
  label text not null check(length(label)<=120),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists classroom_changes_recent on public.classroom_changes(class_id,created_at desc,id desc);
alter table public.classroom_blocks enable row level security;
alter table public.classroom_blocks force row level security;
alter table public.classroom_changes enable row level security;
alter table public.classroom_changes force row level security;
revoke all on public.classroom_blocks,public.classroom_changes from public,anon,authenticated,service_role;
-- RESILIENCE SCHEMA END
alter table public.classrooms enable row level security;
alter table public.classrooms force row level security;
alter table public.classroom_members enable row level security;
alter table public.classroom_members force row level security;
alter table public.classroom_events enable row level security;
alter table public.classroom_events force row level security;
alter table public.classroom_materials enable row level security;
alter table public.classroom_materials force row level security;
revoke all on public.classrooms,public.classroom_members,public.classroom_events,public.classroom_materials from public,anon,authenticated;

-- RESILIENCE TOUCH BEGIN
-- Membership and materials do not invalidate unrelated calendar contents.
create or replace function public.classroom_touch()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.classrooms set updated_at=clock_timestamp(),
    calendar_updated_at=case when tg_table_name='classroom_events' then clock_timestamp() else calendar_updated_at end
    where id=case when tg_op='DELETE' then old.class_id else new.class_id end;
  if tg_op='UPDATE' and old.class_id is distinct from new.class_id then
    update public.classrooms set updated_at=clock_timestamp(),
      calendar_updated_at=case when tg_table_name='classroom_events' then clock_timestamp() else calendar_updated_at end where id=old.class_id;
  end if;
  return null;
end $$;
revoke all on function public.classroom_touch() from public,anon,authenticated,service_role;
create or replace trigger classroom_members_version after insert or update or delete on public.classroom_members for each row execute function public.classroom_touch();
create or replace trigger classroom_events_version after insert or update or delete on public.classroom_events for each row execute function public.classroom_touch();
create or replace trigger classroom_materials_version after insert or update or delete on public.classroom_materials for each row execute function public.classroom_touch();
create or replace function public.classroom_calendar_touch()
returns trigger language plpgsql set search_path='' as $$
begin
  new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
  if (new.title,new.timezone,new.archived) is distinct from (old.title,old.timezone,old.archived) then
    new.calendar_updated_at:=greatest(clock_timestamp(),old.calendar_updated_at+interval '1 microsecond');
  end if;
  return new;
end $$;
revoke all on function public.classroom_calendar_touch() from public,anon,authenticated,service_role;
create or replace trigger classroom_calendar_revision before update on public.classrooms for each row execute function public.classroom_calendar_touch();
-- RESILIENCE TOUCH END

create or replace function public.classroom_state(p_user uuid,p_revision text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare revision text; classes jsonb; calendar jsonb;
begin
  select md5('permissions-v1:'||coalesce(string_agg(c.id::text||c.updated_at::text||coalesce(m.joined_at::text,''),',' order by c.id),'')) into revision
    from public.classrooms c left join public.classroom_members m on m.class_id=c.id and m.user_id=p_user
    where c.id in (select id from public.classrooms where owner_id=p_user union select class_id from public.classroom_members where user_id=p_user);
  if p_revision=revision then return jsonb_build_object('revision',revision,'unchanged',true); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'teacherName',c.teacher_name,'institution',c.institution,'timezone',c.timezone,'color',c.color,'archived',c.archived,'ownerRole',c.owner_role,'role',case when c.owner_id=p_user then c.owner_role when c.owner_role='collaborator' then m.role else 'student' end,'permissions',case when c.owner_id<>p_user and c.owner_role='collaborator' and m.role='moderator' then m.permissions else '{}'::jsonb end,'code',case when c.owner_id=p_user then c.invite_code else null end,'memberCount',(select count(*) from public.classroom_members where class_id=c.id)) order by c.archived,c.title,c.id),'[]') into classes
    from public.classrooms c left join public.classroom_members m on m.class_id=c.id and m.user_id=p_user where c.owner_id=p_user or m.user_id=p_user;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'classId',c.id,'className',c.title,'timezone',c.timezone,'data',e.data) order by c.id,e.id),'[]') into calendar
    from public.classroom_events e join public.classrooms c on c.id=e.class_id where not c.archived and c.id in (select id from public.classrooms where owner_id=p_user union select class_id from public.classroom_members where user_id=p_user);
  return jsonb_build_object('revision',revision,'classes',classes,'calendar',calendar);
end $$;
revoke all on function public.classroom_state(uuid,text) from public,anon,authenticated,service_role;

create or replace function public.classroom_detail(p_user uuid,p_class uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare course public.classrooms; events jsonb; materials jsonb; members jsonb; delegates jsonb:='[]';
begin
  select * into course from public.classrooms c where c.id=p_class and (c.owner_id=p_user or exists(select 1 from public.classroom_members m where m.class_id=c.id and m.user_id=p_user));
  if course.id is null then raise exception 'CLASS_UNAVAILABLE'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'data',data,'version',version) order by data->>'date',id),'[]') into events from public.classroom_events where class_id=p_class;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'url',url,'version',version) order by title,id),'[]') into materials from public.classroom_materials where class_id=p_class;
  if course.owner_id=p_user then
    select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(nullif(p.username,''),'Estudiante '||upper(left(m.user_id::text,6))),'role',case when course.owner_role='collaborator' then m.role else 'student' end,'permissions',case when course.owner_role='collaborator' and m.role='moderator' then m.permissions else '{}'::jsonb end) order by m.joined_at,m.user_id),'[]') into members
    from public.classroom_members m left join public.friend_profiles p on p.user_id=m.user_id where m.class_id=p_class;
  else members:='[]'::jsonb; end if;
  if course.owner_role='collaborator' then
    select coalesce(jsonb_agg(jsonb_build_object('name',coalesce(nullif(p.username,''),'Estudiante '||upper(left(m.user_id::text,6))),'email',u.email,
      'permissions',jsonb_build_object('datesAdd',m.permissions @> '{"datesAdd":true}'::jsonb,'datesEdit',m.permissions @> '{"datesEdit":true}'::jsonb,'datesRemove',m.permissions @> '{"datesRemove":true}'::jsonb,
        'filesAdd',m.permissions @> '{"filesAdd":true}'::jsonb,'filesEdit',m.permissions @> '{"filesEdit":true}'::jsonb,'filesRemove',m.permissions @> '{"filesRemove":true}'::jsonb)) order by m.joined_at,m.user_id),'[]') into delegates
      from public.classroom_members m left join public.friend_profiles p on p.user_id=m.user_id left join auth.users u on u.id=m.user_id where m.class_id=p_class and m.role='moderator';
  end if;
  return jsonb_build_object('id',p_class,'events',events,'materials',materials,'members',members,
    'blocked',case when course.owner_id=p_user then (select coalesce(jsonb_agg(jsonb_build_object('id',b.user_id,'name',coalesce(nullif(p.username,''),'Alumno')) order by b.created_at),'[]') from public.classroom_blocks b left join public.friend_profiles p on p.user_id=b.user_id where b.class_id=p_class) else '[]'::jsonb end,'team',
    jsonb_build_object('owner',jsonb_build_object('name',course.teacher_name,'role',course.owner_role,'email',(select u.email from auth.users u where u.id=course.owner_id)),'delegates',delegates));
end $$;
revoke all on function public.classroom_detail(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.classroom_event_valid(v jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare d date; until_date date; day jsonb;
begin
  if jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(v->'title') is distinct from 'string' or length(trim(v->>'title')) not between 1 and 90
    or jsonb_typeof(v->'allDay') is distinct from 'boolean' or coalesce(v->>'color','') not in ('blue','teal','violet','rose','amber')
    or coalesce(v->>'type','') not in ('Clase','Examen','Entrega','Actividad') or length(coalesce(v->>'note',''))>1200
    or coalesce(v->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(v->>'repeat','') not in ('none','weekly') then return false; end if;
  d:=(v->>'date')::date; if to_char(d,'YYYY-MM-DD')<>v->>'date' then return false; end if;
  if not (v->>'allDay')::boolean and (coalesce(v->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(v->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v->>'end'<=v->>'start') then return false; end if;
  if v->>'repeat'='weekly' then
    if jsonb_typeof(v->'days') is distinct from 'array' then return false; end if;
    if jsonb_array_length(v->'days') not between 1 and 7 then return false; end if;
    for day in select value from jsonb_array_elements(v->'days') loop
      if day::text !~ '^[0-6]$' then return false; end if;
    end loop;
    if coalesce(v->>'endDate','')<>'' then
      until_date:=(v->>'endDate')::date;
      if to_char(until_date,'YYYY-MM-DD')<>v->>'endDate' or until_date<d then return false; end if;
    end if;
  end if;
  return true;
exception when others then return false;
end $$;
revoke all on function public.classroom_event_valid(jsonb) from public,anon,authenticated,service_role;

create or replace function public.classroom_permissions_valid(v jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare key text; value jsonb;
begin
  if jsonb_typeof(v) is distinct from 'object' then return false; end if;
  for key,value in select * from pg_catalog.jsonb_each(v) loop
    if key not in ('datesAdd','datesEdit','datesRemove','filesAdd','filesEdit','filesRemove') or jsonb_typeof(value)<>'boolean' then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.classroom_permissions_valid(jsonb) from public,anon,authenticated,service_role;

-- RESILIENCE HELPERS BEGIN
create or replace function public.classroom_state_compact(p_user uuid,p_revision text default '',p_versions jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rev text; versions jsonb; changed uuid[]; classes jsonb; events jsonb;
begin
  if p_user is null or not exists(select 1 from auth.users where id=p_user) then raise exception 'AUTH_REQUIRED'; end if;
  if jsonb_typeof(p_versions) is distinct from 'object' or octet_length(p_versions::text)>6500 or
    exists(select 1 from jsonb_each_text(p_versions) where key !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' or value !~ '^[a-f0-9]{32}$') then raise exception 'INVALID_DATA'; end if;
  select md5('permissions-v1:'||coalesce(string_agg(c.id::text||c.updated_at::text||coalesce(m.joined_at::text,''),',' order by c.id),'')),
    coalesce(jsonb_object_agg(c.id::text,md5(c.calendar_updated_at::text)) filter(where not c.archived),'{}'::jsonb),
    coalesce(array_agg(c.id) filter(where not c.archived and coalesce(p_versions->>c.id::text,'')<>md5(c.calendar_updated_at::text)),array[]::uuid[])
  into rev,versions,changed from public.classrooms c left join public.classroom_members m on m.class_id=c.id and m.user_id=p_user
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
  return jsonb_build_object('revision',rev,'classes',classes,'calendarPatch',jsonb_build_object('versions',versions,'classes',to_jsonb(changed),'events',events));
end $$;
revoke all on function public.classroom_state_compact(uuid,text,jsonb) from public,anon,authenticated,service_role;

create or replace function public.classroom_record_change(p_class uuid,p_actor uuid,p_action text,p_label text)
returns void language plpgsql security definer set search_path='' as $$
declare author text; actor_role text;
begin
  select case when c.owner_id=p_actor then c.teacher_name else coalesce(nullif(p.username,''),'Delegado') end,
    case when c.owner_id=p_actor then c.owner_role else 'moderator' end into author,actor_role
    from public.classrooms c left join public.friend_profiles p on p.user_id=p_actor where c.id=p_class;
  insert into public.classroom_changes(class_id,actor_name,actor_role,action,label) values(p_class,left(coalesce(author,'Equipo'),60),actor_role,left(p_action,40),left(coalesce(p_label,''),120));
  delete from public.classroom_changes where class_id=p_class and id in
    (select id from public.classroom_changes where class_id=p_class order by created_at desc,id desc offset 30);
end $$;
revoke all on function public.classroom_record_change(uuid,uuid,text,text) from public,anon,authenticated,service_role;

create or replace function public.classroom_history(p_user uuid,p_class uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.classrooms c where c.id=p_class and (c.owner_id=p_user or exists(select 1 from public.classroom_members m where m.class_id=c.id and m.user_id=p_user))) then raise exception 'CLASS_UNAVAILABLE'; end if;
  return jsonb_build_object('id',p_class,'changes',(select coalesce(jsonb_agg(jsonb_build_object('actor',actor_name,'role',actor_role,'action',action,'label',label,'at',created_at) order by created_at desc,id desc),'[]')
    from public.classroom_changes where class_id=p_class));
end $$;
revoke all on function public.classroom_history(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.classroom_transfer_owner()
returns trigger language plpgsql security definer set search_path='' as $$
declare course public.classrooms; successor uuid; successor_name text;
begin
  if tg_op='UPDATE' and (to_jsonb(new)->>'deleted_at' is null or to_jsonb(old)->>'deleted_at' is not null) then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('estudiemos.classrooms:'||old.id::text,0));
  for course in select * from public.classrooms where owner_id=old.id order by id for update loop
    successor:=null;
    select m.user_id,coalesce(nullif(p.username,''),'Colaborador') into successor,successor_name
      from public.classroom_members m join auth.users u on u.id=m.user_id left join public.friend_profiles p on p.user_id=m.user_id
      where m.class_id=course.id and m.user_id<>old.id and u.email_confirmed_at is not null and to_jsonb(u)->>'deleted_at' is null
        and coalesce(nullif(to_jsonb(u)->>'banned_until','')::timestamptz,'-infinity'::timestamptz)<=now()
        and not exists(select 1 from public.classroom_blocks b where b.class_id=course.id and b.user_id=m.user_id)
      order by (m.role='moderator') desc,m.joined_at,m.user_id limit 1 for update of m;
    if successor is not null then
      update public.classrooms set owner_id=successor,owner_role='collaborator',teacher_name=left(successor_name,60) where id=course.id;
      delete from public.classroom_members where class_id=course.id and user_id=successor;
      perform public.classroom_record_change(course.id,successor,'owner_transfer','Responsabilidad de la cátedra');
    else
      update public.classrooms set owner_id=null,archived=true,teacher_name='Sin responsable' where id=course.id;
    end if;
  end loop;
  if tg_op='UPDATE' then return new; end if;
  return old;
end $$;
revoke all on function public.classroom_transfer_owner() from public,anon,authenticated,service_role;

create or replace function public.classroom_read(p_action text default 'state',p_data jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or not exists(select 1 from auth.users u where u.id=actor and to_jsonb(u)->>'deleted_at' is null) then raise exception 'AUTH_REQUIRED'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>8192 then raise exception 'INVALID_DATA'; end if;
  if p_action='state' then
    if coalesce(p_data->>'revision','') !~ '^([a-f0-9]{32})?$' then raise exception 'INVALID_DATA'; end if;
    return public.classroom_state_compact(actor,coalesce(p_data->>'revision',''),coalesce(p_data->'calendarVersions','{}'));
  end if;
  if p_action='detail' then return public.classroom_detail(actor,(p_data->>'id')::uuid); end if;
  if p_action='history' then return public.classroom_history(actor,(p_data->>'id')::uuid); end if;
  raise exception 'INVALID_DATA';
end $$;
revoke all on function public.classroom_read(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.classroom_read(text,jsonb) to authenticated;
drop trigger if exists estudiemos_classroom_owner_transfer on auth.users;
create trigger estudiemos_classroom_owner_transfer before delete or update on auth.users for each row execute function public.classroom_transfer_owner();
-- RESILIENCE HELPERS END

-- RESILIENCE ACTION BEGIN
create or replace function public.classroom_action(p_user uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare course public.classrooms; member public.classroom_members; item uuid; result jsonb; touched boolean:=true; permission text; expected bigint; existing bigint; label text; change_kind text;
begin
  if not exists(select 1 from auth.users where id=p_user) then raise exception 'AUTH_REQUIRED'; end if;
  if p_action='state' then
    if p_data->>'stateProtocol'='2' then return public.classroom_state_compact(p_user,coalesce(p_data->>'revision',''),coalesce(p_data->'calendarVersions','{}')); end if;
    return public.classroom_state(p_user,coalesce(p_data->>'revision',''));
  end if;
  if p_action='detail' then return public.classroom_detail(p_user,(p_data->>'id')::uuid); end if;
  if p_action='history' then return public.classroom_history(p_user,(p_data->>'id')::uuid); end if;
  if p_action not in ('create','update','join','leave','rotate','archive','event_save','event_remove','material_save','material_remove','member_remove','member_unblock','member_permissions') then raise exception 'INVALID_DATA'; end if;
  if p_action in ('create','join') and not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then raise exception 'EMAIL_VERIFICATION_REQUIRED'; end if;
  -- Serialize each user's enrollment/creation limits, then each class's writes.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('estudiemos.classrooms:'||p_user::text,0));
  if p_action in ('create','update') then
    if p_data ? 'ownerRole' and coalesce(p_data->>'ownerRole','') not in ('teacher','collaborator') then raise exception 'INVALID_PERMISSIONS'; end if;
    if jsonb_typeof(p_data->'title') is distinct from 'string' or length(trim(p_data->>'title')) not between 1 and 90 or jsonb_typeof(p_data->'teacherName') is distinct from 'string' or length(trim(p_data->>'teacherName')) not between 1 and 60 or length(coalesce(p_data->>'institution',''))>90 or coalesce(p_data->>'color','') not in ('blue','teal','violet','rose','amber') then raise exception 'INVALID_DATA'; end if;
    if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_data->>'timezone') then raise exception 'INVALID_TIMEZONE'; end if;
  end if;
  if p_action='create' then
    if (select count(*) from public.classrooms where owner_id=p_user)>=10 then raise exception 'CLASS_LIMIT'; end if;
    insert into public.classrooms(owner_id,title,teacher_name,institution,timezone,color,invite_code,owner_role)
      values(p_user,trim(p_data->>'title'),trim(p_data->>'teacherName'),coalesce(p_data->>'institution',''),p_data->>'timezone',p_data->>'color',p_data->>'code',coalesce(p_data->>'ownerRole','teacher')) returning * into course;
    perform public.classroom_record_change(course.id,p_user,'course_create',course.title);
  else
    if p_action='join' then select * into course from public.classrooms where invite_code=p_data->>'code' and not archived for update;
    else select * into course from public.classrooms where id=(p_data->>'id')::uuid for update; end if;
    if course.id is null then
      if p_action='join' then raise exception 'INVALID_CODE'; end if;
      raise exception 'CLASS_UNAVAILABLE';
    end if;
    if p_action='join' then
      if exists(select 1 from public.classroom_blocks where class_id=course.id and user_id=p_user) then raise exception 'CLASS_BLOCKED'; end if;
      if course.owner_id is distinct from p_user and not exists(select 1 from public.classroom_members where class_id=course.id and user_id=p_user) then
        if (select count(*) from public.classroom_members where user_id=p_user)>=30 then raise exception 'CLASS_LIMIT'; end if;
        if (select count(*) from public.classroom_members where class_id=course.id)>=400 then raise exception 'CLASS_FULL'; end if;
        insert into public.classroom_members(class_id,user_id) values(course.id,p_user);
      else touched:=false; end if;
    elsif p_action='leave' then
      if course.owner_id=p_user or not exists(select 1 from public.classroom_members where class_id=course.id and user_id=p_user) then raise exception 'CLASS_UNAVAILABLE'; end if;
      delete from public.classroom_members where class_id=course.id and user_id=p_user;
    else
      if course.owner_id is distinct from p_user then
        select * into member from public.classroom_members where class_id=course.id and user_id=p_user;
        if member.user_id is null then raise exception 'CLASS_UNAVAILABLE'; end if;
        if course.owner_role<>'collaborator' or member.role<>'moderator' or p_action not in ('event_save','event_remove','material_save','material_remove') then raise exception 'PERMISSION_DENIED'; end if;
        item:=(p_data->>'itemId')::uuid;
        permission:=case p_action
          when 'event_save' then case when exists(select 1 from public.classroom_events where id=item) then 'datesEdit' else 'datesAdd' end
          when 'event_remove' then 'datesRemove'
          when 'material_save' then case when exists(select 1 from public.classroom_materials where id=item) then 'filesEdit' else 'filesAdd' end
          when 'material_remove' then 'filesRemove' end;
        if member.permissions->permission is distinct from 'true'::jsonb then raise exception 'PERMISSION_DENIED'; end if;
      end if;
      if course.archived and p_action<>'archive' then raise exception 'CLASS_ARCHIVED'; end if;
      if p_action='update' then
        update public.classrooms set title=trim(p_data->>'title'),teacher_name=trim(p_data->>'teacherName'),institution=coalesce(p_data->>'institution',''),timezone=p_data->>'timezone',color=p_data->>'color',owner_role=coalesce(p_data->>'ownerRole',owner_role) where id=course.id;
        if p_data->>'ownerRole'='teacher' then update public.classroom_members set role='student',permissions='{}' where class_id=course.id and (role<>'student' or permissions<>'{}'::jsonb); end if;
        perform public.classroom_record_change(course.id,p_user,'course_update',p_data->>'title');
      elsif p_action='rotate' then
        update public.classrooms set invite_code=p_data->>'code' where id=course.id;
        perform public.classroom_record_change(course.id,p_user,'invite_rotate','Enlace de invitación');
      elsif p_action='archive' then
        if jsonb_typeof(p_data->'archived') is distinct from 'boolean' then raise exception 'INVALID_DATA'; end if;
        update public.classrooms set archived=(p_data->>'archived')::boolean where id=course.id;
        perform public.classroom_record_change(course.id,p_user,case when (p_data->>'archived')::boolean then 'course_archive' else 'course_restore' end,course.title);
      elsif p_action='member_remove' then
        if (p_data->>'itemId')::uuid=course.owner_id then raise exception 'PERMISSION_DENIED'; end if;
        if not exists(select 1 from public.classroom_members where class_id=course.id and user_id=(p_data->>'itemId')::uuid) then raise exception 'CLASS_UNAVAILABLE'; end if;
        insert into public.classroom_blocks(class_id,user_id) values(course.id,(p_data->>'itemId')::uuid) on conflict do nothing;
        delete from public.classroom_members where class_id=course.id and user_id=(p_data->>'itemId')::uuid;
        perform public.classroom_record_change(course.id,p_user,'member_remove','Participación actualizada');
      elsif p_action='member_unblock' then
        delete from public.classroom_blocks where class_id=course.id and user_id=(p_data->>'itemId')::uuid;
        perform public.classroom_record_change(course.id,p_user,'member_unblock','Participación habilitada');
      elsif p_action='member_permissions' then
        if course.owner_role<>'collaborator' then raise exception 'PERMISSION_DENIED'; end if;
        if coalesce(p_data->>'role','') not in ('student','moderator') or not public.classroom_permissions_valid(p_data->'permissions') then raise exception 'INVALID_PERMISSIONS'; end if;
        update public.classroom_members set role=p_data->>'role',permissions=case when p_data->>'role'='moderator' then p_data->'permissions' else '{}'::jsonb end
          where class_id=course.id and user_id=(p_data->>'itemId')::uuid;
        if not found then raise exception 'CLASS_UNAVAILABLE'; end if;
        perform public.classroom_record_change(course.id,p_user,'member_permissions','Permisos actualizados');
      else
        item:=(p_data->>'itemId')::uuid;
        if p_action in ('event_save','event_remove') and exists(select 1 from public.classroom_events where id=item and class_id<>course.id)
          or p_action in ('material_save','material_remove') and exists(select 1 from public.classroom_materials where id=item and class_id<>course.id) then raise exception 'CLASS_UNAVAILABLE'; end if;
        if coalesce(p_data->>'expectedVersion','0') !~ '^[0-9]{1,16}$' then raise exception 'INVALID_DATA'; end if;
        expected:=coalesce(p_data->>'expectedVersion','0')::bigint;
        if p_action in ('event_save','event_remove') then select version,data->>'title' into existing,label from public.classroom_events where id=item and class_id=course.id;
        else select version,title into existing,label from public.classroom_materials where id=item and class_id=course.id; end if;
        if coalesce(existing,0)<>expected or p_action in ('event_remove','material_remove') and existing is null then raise exception 'VERSION_CONFLICT'; end if;
        change_kind:=case when existing is null then 'add' else 'edit' end;
        if p_action='event_save' then
          if not public.classroom_event_valid(p_data->'event') then raise exception 'INVALID_EVENT'; end if;
          if exists(select 1 from public.classroom_events where id=item and class_id<>course.id) then raise exception 'CLASS_UNAVAILABLE'; end if;
          if not exists(select 1 from public.classroom_events where id=item) and (select count(*) from public.classroom_events where class_id=course.id)>=100 then raise exception 'ITEM_LIMIT'; end if;
          insert into public.classroom_events(id,class_id,data) values(item,course.id,p_data->'event') on conflict(id) do update set data=excluded.data,version=classroom_events.version+1 where classroom_events.class_id=course.id;
          perform public.classroom_record_change(course.id,p_user,'event_'||change_kind,p_data->'event'->>'title');
        elsif p_action='event_remove' then
          delete from public.classroom_events where id=item and class_id=course.id;
          perform public.classroom_record_change(course.id,p_user,'event_remove',label);
        elsif p_action='material_save' then
          if jsonb_typeof(p_data->'material'->'title') is distinct from 'string' or length(trim(p_data->'material'->>'title')) not between 1 and 120 or length(coalesce(p_data->'material'->>'url',''))>1200 or coalesce(p_data->'material'->>'url','') !~ '^https://(drive|docs)\.google\.com/(file/d/|drive/(u/[0-9]+/)?folders/|(document|spreadsheets|presentation|forms|drawings)/(u/[0-9]+/)?d/)[A-Za-z0-9_-]{5,200}([/?].*)?$' then raise exception 'INVALID_MATERIAL'; end if;
          if exists(select 1 from public.classroom_materials where id=item and class_id<>course.id) then raise exception 'CLASS_UNAVAILABLE'; end if;
          if not exists(select 1 from public.classroom_materials where id=item) and (select count(*) from public.classroom_materials where class_id=course.id)>=50 then raise exception 'ITEM_LIMIT'; end if;
          insert into public.classroom_materials(id,class_id,title,url) values(item,course.id,trim(p_data->'material'->>'title'),p_data->'material'->>'url') on conflict(id) do update set title=excluded.title,url=excluded.url,version=classroom_materials.version+1 where classroom_materials.class_id=course.id;
          perform public.classroom_record_change(course.id,p_user,'material_'||change_kind,p_data->'material'->>'title');
        elsif p_action='material_remove' then
          delete from public.classroom_materials where id=item and class_id=course.id;
          perform public.classroom_record_change(course.id,p_user,'material_remove',label);
        end if;
      end if;
    end if;
    if touched then update public.classrooms set updated_at=clock_timestamp() where id=course.id; end if;
  end if;
  result:=case when p_data->>'stateProtocol'='2' then public.classroom_state_compact(p_user,'',coalesce(p_data->'calendarVersions','{}')) else public.classroom_state(p_user) end;
  if p_action<>'leave' then result:=result||jsonb_build_object('detail',public.classroom_detail(p_user,course.id)); end if;
  return result||jsonb_build_object('selected',course.id);
end $$;
revoke all on function public.classroom_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.classroom_action(uuid,text,jsonb) to service_role;
-- RESILIENCE ACTION END
notify pgrst,'reload schema';
commit;
