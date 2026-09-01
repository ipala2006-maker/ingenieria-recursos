create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

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

drop function if exists public.export_user_registry(text);
drop table if exists private.app_secrets;
