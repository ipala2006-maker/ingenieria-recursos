create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_secrets (
  key text primary key,
  value text not null
);

insert into private.app_secrets (key, value)
values ('user_registry_export_sha256', 'cfd9fceaa9548b72a249684ff8a4134bd1d01cee75ea39049e7c590ef009b697')
on conflict (key) do update set value = excluded.value;

create table if not exists public.user_registry (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  registered_at timestamptz not null,
  confirmed_at timestamptz,
  last_sign_in_at timestamptz
);

alter table public.user_registry enable row level security;
alter table public.user_registry force row level security;
revoke all on table public.user_registry from public, anon, authenticated;
grant select on table public.user_registry to service_role;

create or replace function private.sync_user_registry()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  insert into public.user_registry (
    user_id,
    email,
    registered_at,
    confirmed_at,
    last_sign_in_at
  ) values (
    new.id,
    coalesce(new.email, ''),
    new.created_at,
    new.email_confirmed_at,
    new.last_sign_in_at
  )
  on conflict (user_id) do update set
    email = excluded.email,
    confirmed_at = excluded.confirmed_at,
    last_sign_in_at = excluded.last_sign_in_at;
  return new;
end;
$$;

drop trigger if exists on_auth_user_registry_change on auth.users;
create trigger on_auth_user_registry_change
after insert or update of email, email_confirmed_at, last_sign_in_at on auth.users
for each row execute function private.sync_user_registry();

insert into public.user_registry (
  user_id,
  email,
  registered_at,
  confirmed_at,
  last_sign_in_at
)
select
  id,
  coalesce(email, ''),
  created_at,
  email_confirmed_at,
  last_sign_in_at
from auth.users
on conflict (user_id) do update set
  email = excluded.email,
  confirmed_at = excluded.confirmed_at,
  last_sign_in_at = excluded.last_sign_in_at;

create or replace function public.export_user_registry(export_token text)
returns table (
  user_id uuid,
  email text,
  registered_at timestamptz,
  confirmed_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
begin
  if export_token is null or encode(extensions.digest(export_token, 'sha256'), 'hex') <>
    (select value from private.app_secrets where key = 'user_registry_export_sha256') then
    raise insufficient_privilege using message = 'Invalid export token';
  end if;

  return query
  select
    registry.user_id,
    registry.email,
    registry.registered_at,
    registry.confirmed_at,
    registry.last_sign_in_at
  from public.user_registry as registry
  order by registry.registered_at desc;
end;
$$;

revoke all on function public.export_user_registry(text) from public;
revoke all on function public.export_user_registry(text) from anon, authenticated;
grant execute on function public.export_user_registry(text) to service_role;
