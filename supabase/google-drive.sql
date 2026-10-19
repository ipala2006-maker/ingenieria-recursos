-- Only the authenticated backend can read these encrypted OAuth grants.
-- No file content, public policies, or client-side access is introduced.
begin;
create table if not exists public.drive_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credentials text not null check (length(credentials) between 40 and 24000),
  updated_at timestamptz not null default now()
);
alter table public.drive_connections enable row level security;
alter table public.drive_connections force row level security;
revoke all on public.drive_connections from public, anon, authenticated;
grant select, insert, update, delete on public.drive_connections to service_role;
notify pgrst, 'reload schema';
commit;
