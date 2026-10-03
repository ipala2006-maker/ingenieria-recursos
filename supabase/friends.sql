-- Private social graph. Only the authenticated server may call friends_action.
begin;
create table if not exists public.friend_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Estudiante' check (length(name) between 1 and 32),
  share_streak boolean not null default false,
  timezone text not null default 'UTC',
  action_window timestamptz not null default now(),
  action_count integer not null default 0,
  invite text not null unique default replace(gen_random_uuid()::text,'-','')
);
create table if not exists public.friend_links (
  sender uuid not null references public.friend_profiles(user_id) on delete cascade,
  recipient uuid not null references public.friend_profiles(user_id) on delete cascade,
  accepted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key(sender,recipient), check(sender<>recipient)
);
alter table public.friend_profiles add column if not exists email_window timestamptz not null default now();
alter table public.friend_profiles add column if not exists email_count integer not null default 0;
create unique index if not exists friend_pair on public.friend_links(least(sender,recipient),greatest(sender,recipient));
create index if not exists friend_recipient on public.friend_links(recipient);
create table if not exists public.friend_blocks (
  owner uuid not null references public.friend_profiles(user_id) on delete cascade,
  blocked uuid not null references public.friend_profiles(user_id) on delete cascade,
  primary key(owner,blocked), check(owner<>blocked)
);
alter table public.friend_profiles enable row level security;
alter table public.friend_profiles force row level security;
alter table public.friend_links enable row level security;
alter table public.friend_links force row level security;
alter table public.friend_blocks enable row level security;
alter table public.friend_blocks force row level security;
revoke all on public.friend_profiles,public.friend_links,public.friend_blocks from public,anon,authenticated;

-- Same rule as Pomodoro: 25 min/day; yesterday keeps the streak alive until today ends.
-- Never expose the underlying history or other user-state fields.
create or replace function public.friend_streak(p_user uuid,p_zone text)
returns integer language plpgsql stable security definer set search_path='' as $$
declare data jsonb; day date; minutes numeric; total integer:=0;
begin
  select state->'values'->'estudiemos_pomodoro_streak' into data from public.user_states where user_id=p_user;
  if jsonb_typeof(data)='string' then
    begin data:=(data#>>'{}')::jsonb; exception when others then return 0; end;
  end if;
  data:=data->'days';
  day:=(now() at time zone p_zone)::date;
  if coalesce(data->>day::text,'') !~ '^[0-9]+(\.[0-9]+)?$' then minutes:=0;
  else minutes:=(data->>day::text)::numeric; end if;
  if minutes<25 then day:=day-1; end if;
  for i in 1..3660 loop
    if coalesce(data->>day::text,'') !~ '^[0-9]+(\.[0-9]+)?$' then exit; end if;
    if (data->>day::text)::numeric<25 then exit; end if;
    total:=total+1; day:=day-1;
  end loop;
  return total;
end $$;
revoke all on function public.friend_streak(uuid,text) from public,anon,authenticated,service_role;

create or replace function public.friends_action(p_user uuid,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid; mine jsonb; people jsonb; incoming jsonb; outgoing jsonb; blocked jsonb; zone text; target_email text;
begin
  if not exists(select 1 from auth.users where id=p_user) then raise exception 'AUTH_REQUIRED'; end if;
  if p_action not in ('list','profile','request','request_email','accept','decline','remove','block','unblock','rotate') then raise exception 'INVALID_ACTION'; end if;
  if p_action='request' then
    select user_id into target from public.friend_profiles where invite=p_data->>'invite';
    if target is null or target=p_user then raise exception 'INVALID_INVITE'; end if;
  elsif p_action='request_email' then
    target_email:=lower(trim(p_data->>'email'));
    if jsonb_typeof(p_data->'email') is distinct from 'string' or length(target_email)>254
      or target_email !~ '^[^[:space:]@[:cntrl:]]+@[^[:space:]@[:cntrl:]]+\.[^[:space:]@[:cntrl:]]+$' then raise exception 'INVALID_EMAIL'; end if;
    if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then raise exception 'EMAIL_VERIFICATION_REQUIRED'; end if;
    -- Exact server-only lookup, never an email directory or prefix search.
    select u.id into target from auth.users u where lower(u.email)=target_email
      and u.email_confirmed_at is not null and u.id<>p_user limit 1;
  elsif p_action in ('accept','decline','remove','block','unblock') then
    begin target:=(p_data->>'id')::uuid; exception when others then raise exception 'INVALID_TARGET'; end;
    if target is null or target=p_user then raise exception 'INVALID_TARGET'; end if;
  end if;
  -- First-time email contacts must create both profiles in the same lock order too.
  insert into public.friend_profiles(user_id) select id from auth.users
    where id in (p_user,target) order by id on conflict do nothing;
  -- Deterministic locks prevent duplicate reciprocal invitations and limit races.
  perform 1 from public.friend_profiles where user_id in (p_user,target) order by user_id for update;
  if p_action<>'list' then
    update public.friend_profiles set action_count=case when action_window<now()-interval '1 minute' then 1 else action_count+1 end,
      action_window=case when action_window<now()-interval '1 minute' then now() else action_window end where user_id=p_user;
    if (select action_count from public.friend_profiles where user_id=p_user)>20 then raise exception 'TOO_MANY_ACTIONS'; end if;
  end if;
  if p_action='request_email' then
    update public.friend_profiles set email_count=case when email_window<now()-interval '10 minutes' then 1 else email_count+1 end,
      email_window=case when email_window<now()-interval '10 minutes' then now() else email_window end where user_id=p_user;
    if (select email_count from public.friend_profiles where user_id=p_user)>10 then raise exception 'EMAIL_REQUEST_LIMIT'; end if;
    -- Unknown, own, unverified, blocked or unavailable addresses use the same no-op.
    -- Return the caller's normal graph; no searched account data is returned separately.
    if target is not null and (exists(select 1 from public.friend_blocks where (owner=p_user and friend_blocks.blocked=target) or (owner=target and friend_blocks.blocked=p_user))
      or (select count(*) from public.friend_links where sender=target or recipient=target)>=100) then target:=null; end if;
  end if;
  if p_action='profile' then
    if jsonb_typeof(p_data->'name') is distinct from 'string' or length(trim(p_data->>'name')) not between 1 and 32
      or (p_data->>'name') ~ '[[:cntrl:]]' or jsonb_typeof(p_data->'share') is distinct from 'boolean'
      then raise exception 'INVALID_PROFILE'; end if;
    zone:=p_data->>'timezone';
    if not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then raise exception 'INVALID_TIMEZONE'; end if;
    update public.friend_profiles set name=trim(p_data->>'name'),share_streak=(p_data->>'share')::boolean,timezone=zone where user_id=p_user;
  elsif p_action='rotate' then
    update public.friend_profiles set invite=replace(gen_random_uuid()::text,'-','') where user_id=p_user;
  elsif p_action in ('request','request_email','accept') and target is not null then
    if exists(select 1 from public.friend_blocks where (owner=p_user and friend_blocks.blocked=target) or (owner=target and friend_blocks.blocked=p_user)) then raise exception 'INVALID_INVITE'; end if;
    if p_action in ('request','request_email') and not exists(select 1 from public.friend_links where (sender=p_user and recipient=target) or (sender=target and recipient=p_user))
      and ((select count(*) from public.friend_links where sender=p_user or recipient=p_user)>=100
      or (select count(*) from public.friend_links where sender=target or recipient=target)>=100) then raise exception 'FRIEND_LIMIT'; end if;
    if p_action in ('request','request_email') then
      insert into public.friend_links(sender,recipient) values(p_user,target) on conflict do nothing;
    else
      update public.friend_links set accepted=true where sender=target and recipient=p_user and not accepted;
      if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
    end if;
  elsif p_action in ('decline','remove','block') then
    if p_action='block' and not exists(select 1 from public.friend_links where (sender=p_user and recipient=target) or (sender=target and recipient=p_user)) then raise exception 'REQUEST_NOT_FOUND'; end if;
    if p_action='block' then
      if (select count(*) from public.friend_blocks where owner=p_user)>=200 then raise exception 'FRIEND_LIMIT'; end if;
      insert into public.friend_blocks(owner,blocked) values(p_user,target) on conflict do nothing;
    end if;
    delete from public.friend_links where ((sender=p_user and recipient=target) or (sender=target and recipient=p_user))
      and (p_action<>'decline' or not accepted);
  elsif p_action='unblock' then
    delete from public.friend_blocks where owner=p_user and friend_blocks.blocked=target;
  end if;
  select jsonb_build_object('id',p.user_id,'name',p.name,'share',p.share_streak,'invite',p.invite,
    'streak',public.friend_streak(p_user,p.timezone)) into mine from public.friend_profiles p where p.user_id=p_user;
  select coalesce(jsonb_agg(row),'[]'::jsonb) into people from (
    select p.user_id as id,p.name,p.share_streak as share,
      case when p.share_streak then public.friend_streak(p.user_id,p.timezone) else null end as streak
    from public.friend_links l join public.friend_profiles p on p.user_id=case when l.sender=p_user then l.recipient else l.sender end
    where (l.sender=p_user or l.recipient=p_user) and l.accepted
    order by streak desc nulls last,p.name,p.user_id
  ) row;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'name',p.name)),'[]'::jsonb) into incoming
    from public.friend_links l join public.friend_profiles p on p.user_id=l.sender where l.recipient=p_user and not l.accepted;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'name',p.name)),'[]'::jsonb) into outgoing
    from public.friend_links l join public.friend_profiles p on p.user_id=l.recipient where l.sender=p_user and not l.accepted;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'name',p.name)),'[]'::jsonb) into blocked
    from public.friend_blocks b join public.friend_profiles p on p.user_id=b.blocked where b.owner=p_user;
  return jsonb_build_object('me',mine,'friends',people,'incoming',incoming,'outgoing',outgoing,'blocked',blocked);
end $$;
revoke all on function public.friends_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.friends_action(uuid,text,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
