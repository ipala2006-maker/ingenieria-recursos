-- Class data is shared only after an authenticated, explicit enrollment.
-- No access to user_states, Drive credentials, personal notes, or student emails.
begin;
create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
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
alter table public.classrooms enable row level security;
alter table public.classrooms force row level security;
alter table public.classroom_members enable row level security;
alter table public.classroom_members force row level security;
alter table public.classroom_events enable row level security;
alter table public.classroom_events force row level security;
alter table public.classroom_materials enable row level security;
alter table public.classroom_materials force row level security;
revoke all on public.classrooms,public.classroom_members,public.classroom_events,public.classroom_materials from public,anon,authenticated;

-- Keep conditional caches current even for FK cascades or administrative edits.
create or replace function public.classroom_touch()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.classrooms set updated_at=clock_timestamp()
    where id=case when tg_op='DELETE' then old.class_id else new.class_id end;
  if tg_op='UPDATE' and old.class_id is distinct from new.class_id then
    update public.classrooms set updated_at=clock_timestamp() where id=old.class_id;
  end if;
  return null;
end $$;
revoke all on function public.classroom_touch() from public,anon,authenticated,service_role;
create or replace trigger classroom_members_version after insert or update or delete on public.classroom_members for each row execute function public.classroom_touch();
create or replace trigger classroom_events_version after insert or update or delete on public.classroom_events for each row execute function public.classroom_touch();
create or replace trigger classroom_materials_version after insert or update or delete on public.classroom_materials for each row execute function public.classroom_touch();

create or replace function public.classroom_state(p_user uuid,p_revision text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare revision text; classes jsonb; calendar jsonb;
begin
  select md5(coalesce(string_agg(c.id::text||c.updated_at::text||coalesce(m.joined_at::text,''),',' order by c.id),'')) into revision
    from public.classrooms c left join public.classroom_members m on m.class_id=c.id and m.user_id=p_user
    where c.id in (select id from public.classrooms where owner_id=p_user union select class_id from public.classroom_members where user_id=p_user);
  if p_revision=revision then return jsonb_build_object('revision',revision,'unchanged',true); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'teacherName',c.teacher_name,'institution',c.institution,'timezone',c.timezone,'color',c.color,'archived',c.archived,'role',case when c.owner_id=p_user then 'teacher' else 'student' end,'code',case when c.owner_id=p_user then c.invite_code else null end,'memberCount',(select count(*) from public.classroom_members where class_id=c.id)) order by c.archived,c.title,c.id),'[]') into classes
    from public.classrooms c where c.id in (select id from public.classrooms where owner_id=p_user union select class_id from public.classroom_members where user_id=p_user);
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'classId',c.id,'className',c.title,'timezone',c.timezone,'data',e.data) order by c.id,e.id),'[]') into calendar
    from public.classroom_events e join public.classrooms c on c.id=e.class_id where not c.archived and c.id in (select id from public.classrooms where owner_id=p_user union select class_id from public.classroom_members where user_id=p_user);
  return jsonb_build_object('revision',revision,'classes',classes,'calendar',calendar);
end $$;
revoke all on function public.classroom_state(uuid,text) from public,anon,authenticated,service_role;

create or replace function public.classroom_detail(p_user uuid,p_class uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare course public.classrooms; events jsonb; materials jsonb; members jsonb;
begin
  select * into course from public.classrooms c where c.id=p_class and (c.owner_id=p_user or exists(select 1 from public.classroom_members m where m.class_id=c.id and m.user_id=p_user));
  if course.id is null then raise exception 'CLASS_UNAVAILABLE'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'data',data) order by data->>'date',id),'[]') into events from public.classroom_events where class_id=p_class;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'url',url) order by title,id),'[]') into materials from public.classroom_materials where class_id=p_class;
  if course.owner_id=p_user then
    select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(nullif(p.username,''),'Estudiante '||upper(left(m.user_id::text,6)))) order by m.joined_at),'[]') into members
    from public.classroom_members m left join public.friend_profiles p on p.user_id=m.user_id where m.class_id=p_class;
  else members:='[]'::jsonb; end if;
  return jsonb_build_object('id',p_class,'events',events,'materials',materials,'members',members);
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

create or replace function public.classroom_action(p_user uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare course public.classrooms; item uuid; result jsonb; touched boolean:=true;
begin
  if not exists(select 1 from auth.users where id=p_user) then raise exception 'AUTH_REQUIRED'; end if;
  if p_action='state' then return public.classroom_state(p_user,coalesce(p_data->>'revision','')); end if;
  if p_action='detail' then return public.classroom_detail(p_user,(p_data->>'id')::uuid); end if;
  if p_action not in ('create','update','join','leave','rotate','archive','event_save','event_remove','material_save','material_remove','member_remove') then raise exception 'INVALID_DATA'; end if;
  if p_action in ('create','join') and not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then raise exception 'EMAIL_VERIFICATION_REQUIRED'; end if;
  -- Serialize each user's enrollment/creation limits, then each class's writes.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('estudiemos.classrooms:'||p_user::text,0));
  if p_action in ('create','update') then
    if jsonb_typeof(p_data->'title') is distinct from 'string' or length(trim(p_data->>'title')) not between 1 and 90 or jsonb_typeof(p_data->'teacherName') is distinct from 'string' or length(trim(p_data->>'teacherName')) not between 1 and 60 or length(coalesce(p_data->>'institution',''))>90 or coalesce(p_data->>'color','') not in ('blue','teal','violet','rose','amber') then raise exception 'INVALID_DATA'; end if;
    if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_data->>'timezone') then raise exception 'INVALID_TIMEZONE'; end if;
  end if;
  if p_action='create' then
    if (select count(*) from public.classrooms where owner_id=p_user)>=10 then raise exception 'CLASS_LIMIT'; end if;
    insert into public.classrooms(owner_id,title,teacher_name,institution,timezone,color,invite_code)
      values(p_user,trim(p_data->>'title'),trim(p_data->>'teacherName'),coalesce(p_data->>'institution',''),p_data->>'timezone',p_data->>'color',p_data->>'code') returning * into course;
  else
    if p_action='join' then select * into course from public.classrooms where invite_code=p_data->>'code' and not archived for update;
    else select * into course from public.classrooms where id=(p_data->>'id')::uuid for update; end if;
    if course.id is null then
      if p_action='join' then raise exception 'INVALID_CODE'; end if;
      raise exception 'CLASS_UNAVAILABLE';
    end if;
    if p_action='join' then
      if course.owner_id<>p_user and not exists(select 1 from public.classroom_members where class_id=course.id and user_id=p_user) then
        if (select count(*) from public.classroom_members where user_id=p_user)>=30 then raise exception 'CLASS_LIMIT'; end if;
        if (select count(*) from public.classroom_members where class_id=course.id)>=400 then raise exception 'CLASS_FULL'; end if;
        insert into public.classroom_members(class_id,user_id) values(course.id,p_user);
      else touched:=false; end if;
    elsif p_action='leave' then
      if course.owner_id=p_user or not exists(select 1 from public.classroom_members where class_id=course.id and user_id=p_user) then raise exception 'CLASS_UNAVAILABLE'; end if;
      delete from public.classroom_members where class_id=course.id and user_id=p_user;
    else
      if course.owner_id<>p_user then raise exception 'CLASS_UNAVAILABLE'; end if;
      if course.archived and p_action<>'archive' then raise exception 'CLASS_ARCHIVED'; end if;
      if p_action='update' then update public.classrooms set title=trim(p_data->>'title'),teacher_name=trim(p_data->>'teacherName'),institution=coalesce(p_data->>'institution',''),timezone=p_data->>'timezone',color=p_data->>'color' where id=course.id;
      elsif p_action='rotate' then update public.classrooms set invite_code=p_data->>'code' where id=course.id;
      elsif p_action='archive' then
        if jsonb_typeof(p_data->'archived') is distinct from 'boolean' then raise exception 'INVALID_DATA'; end if;
        update public.classrooms set archived=(p_data->>'archived')::boolean where id=course.id;
      elsif p_action='member_remove' then delete from public.classroom_members where class_id=course.id and user_id=(p_data->>'itemId')::uuid;
      else
        item:=(p_data->>'itemId')::uuid;
        if p_action='event_save' then
          if not public.classroom_event_valid(p_data->'event') then raise exception 'INVALID_EVENT'; end if;
          if exists(select 1 from public.classroom_events where id=item and class_id<>course.id) then raise exception 'CLASS_UNAVAILABLE'; end if;
          if not exists(select 1 from public.classroom_events where id=item) and (select count(*) from public.classroom_events where class_id=course.id)>=100 then raise exception 'ITEM_LIMIT'; end if;
          insert into public.classroom_events(id,class_id,data) values(item,course.id,p_data->'event') on conflict(id) do update set data=excluded.data where classroom_events.class_id=course.id;
        elsif p_action='event_remove' then delete from public.classroom_events where id=item and class_id=course.id;
        elsif p_action='material_save' then
          if jsonb_typeof(p_data->'material'->'title') is distinct from 'string' or length(trim(p_data->'material'->>'title')) not between 1 and 120 or length(coalesce(p_data->'material'->>'url',''))>1200 or coalesce(p_data->'material'->>'url','') !~ '^https://(drive|docs)\.google\.com/(file/d/|drive/(u/[0-9]+/)?folders/|(document|spreadsheets|presentation|forms|drawings)/(u/[0-9]+/)?d/)[A-Za-z0-9_-]{5,200}([/?].*)?$' then raise exception 'INVALID_MATERIAL'; end if;
          if exists(select 1 from public.classroom_materials where id=item and class_id<>course.id) then raise exception 'CLASS_UNAVAILABLE'; end if;
          if not exists(select 1 from public.classroom_materials where id=item) and (select count(*) from public.classroom_materials where class_id=course.id)>=50 then raise exception 'ITEM_LIMIT'; end if;
          insert into public.classroom_materials(id,class_id,title,url) values(item,course.id,trim(p_data->'material'->>'title'),p_data->'material'->>'url') on conflict(id) do update set title=excluded.title,url=excluded.url where classroom_materials.class_id=course.id;
        elsif p_action='material_remove' then delete from public.classroom_materials where id=item and class_id=course.id;
        end if;
      end if;
    end if;
    if touched then update public.classrooms set updated_at=clock_timestamp() where id=course.id; end if;
  end if;
  result:=public.classroom_state(p_user);
  if p_action<>'leave' then result:=result||jsonb_build_object('detail',public.classroom_detail(p_user,course.id)); end if;
  return result||jsonb_build_object('selected',course.id);
end $$;
revoke all on function public.classroom_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.classroom_action(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
