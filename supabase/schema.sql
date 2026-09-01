create table if not exists public.user_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_states enable row level security;
alter table public.user_states force row level security;

revoke all on table public.user_states from anon;
grant select, insert, update, delete on table public.user_states to authenticated;

drop policy if exists "Students read their own state" on public.user_states;
create policy "Students read their own state"
on public.user_states
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Students create their own state" on public.user_states;
create policy "Students create their own state"
on public.user_states
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Students update their own state" on public.user_states;
create policy "Students update their own state"
on public.user_states
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Students delete their own state" on public.user_states;
create policy "Students delete their own state"
on public.user_states
for delete
to authenticated
using ((select auth.uid()) = user_id);
