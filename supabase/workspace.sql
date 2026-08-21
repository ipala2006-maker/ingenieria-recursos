create table if not exists public.workspace_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.workspace_items(id) on delete cascade,
  kind text not null check (kind in ('folder', 'file')),
  name text not null check (char_length(name) between 1 and 120),
  storage_path text,
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (kind = 'folder' and storage_path is null) or
    (kind = 'file' and storage_path is not null)
  )
);

create index if not exists workspace_items_user_parent_idx
on public.workspace_items (user_id, parent_id);

alter table public.workspace_items enable row level security;

revoke all on table public.workspace_items from anon;
grant select, insert, update, delete on table public.workspace_items to authenticated;

create or replace function public.workspace_parent_is_owned(target_parent uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_parent is null or exists (
    select 1
    from public.workspace_items
    where id = target_parent
      and user_id = (select auth.uid())
      and kind = 'folder'
  );
$$;

revoke all on function public.workspace_parent_is_owned(uuid) from public;
grant execute on function public.workspace_parent_is_owned(uuid) to authenticated;

drop policy if exists "Students read their workspace" on public.workspace_items;
create policy "Students read their workspace"
on public.workspace_items
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Students create workspace items" on public.workspace_items;
create policy "Students create workspace items"
on public.workspace_items
for insert
to authenticated
with check (
  (select auth.uid()) = user_id and
  public.workspace_parent_is_owned(parent_id)
);

drop policy if exists "Students update their workspace" on public.workspace_items;
create policy "Students update their workspace"
on public.workspace_items
for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id and
  public.workspace_parent_is_owned(parent_id)
);

drop policy if exists "Students delete their workspace items" on public.workspace_items;
create policy "Students delete their workspace items"
on public.workspace_items
for delete
to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('workspace-files', 'workspace-files', false, 52428800)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "Students read their private files" on storage.objects;
create policy "Students read their private files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'workspace-files' and
  (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Students upload their private files" on storage.objects;
create policy "Students upload their private files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'workspace-files' and
  (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Students update their private files" on storage.objects;
create policy "Students update their private files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'workspace-files' and
  (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'workspace-files' and
  (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Students delete their private files" on storage.objects;
create policy "Students delete their private files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'workspace-files' and
  (storage.foldername(name))[1] = (select auth.uid())::text
);
