create extension if not exists pgcrypto with schema extensions;

create table if not exists public.whatsapp_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wa_id text not null unique,
  display_name text not null default '',
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_link_codes (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_link_codes_user_idx
on public.whatsapp_link_codes (user_id, created_at desc);

create table if not exists public.whatsapp_pending_actions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wa_id text not null,
  source_message_id text not null unique,
  instruction text not null,
  plan jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_pending_user_idx
on public.whatsapp_pending_actions (user_id, created_at desc);

create table if not exists public.whatsapp_message_log (
  message_id text primary key,
  wa_id_hash text not null,
  status text not null default 'processing',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.whatsapp_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  command_count integer not null default 0 check (command_count >= 0),
  primary key (user_id, usage_date)
);

alter table public.whatsapp_links enable row level security;
alter table public.whatsapp_link_codes enable row level security;
alter table public.whatsapp_pending_actions enable row level security;
alter table public.whatsapp_message_log enable row level security;
alter table public.whatsapp_daily_usage enable row level security;
alter table public.whatsapp_links force row level security;
alter table public.whatsapp_link_codes force row level security;
alter table public.whatsapp_pending_actions force row level security;
alter table public.whatsapp_message_log force row level security;
alter table public.whatsapp_daily_usage force row level security;

revoke all on table public.whatsapp_links from public, anon, authenticated;
revoke all on table public.whatsapp_link_codes from public, anon, authenticated;
revoke all on table public.whatsapp_pending_actions from public, anon, authenticated;
revoke all on table public.whatsapp_message_log from public, anon, authenticated;
revoke all on table public.whatsapp_daily_usage from public, anon, authenticated;

grant select, insert, update, delete on table public.whatsapp_links to service_role;
grant select, insert, update, delete on table public.whatsapp_link_codes to service_role;
grant select, insert, update, delete on table public.whatsapp_pending_actions to service_role;
grant select, insert, update, delete on table public.whatsapp_message_log to service_role;
grant select, insert, update, delete on table public.whatsapp_daily_usage to service_role;

create or replace function public.increment_whatsapp_usage(target_user_id uuid, target_date date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_count integer;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;

  insert into public.whatsapp_daily_usage (user_id, usage_date, command_count)
  values (target_user_id, target_date, 1)
  on conflict (user_id, usage_date) do update
    set command_count = public.whatsapp_daily_usage.command_count + 1
  returning command_count into next_count;

  return next_count;
end;
$$;

revoke all on function public.increment_whatsapp_usage(uuid, date) from public, anon, authenticated;
grant execute on function public.increment_whatsapp_usage(uuid, date) to service_role;
