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
alter table public.workspace_items force row level security;

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

create or replace function public.workspace_mime_is_allowed(target_mime text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(coalesce(target_mime, '')) = any (array[
    'application/7z',
    'application/json',
    'application/msword',
    'application/pdf',
    'application/rtf',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.rar',
    'application/x-7z-compressed',
    'application/x-rar-compressed',
    'application/xml',
    'application/zip',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/csv',
    'text/markdown',
    'text/plain',
    'text/rtf',
    'text/xml',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]);
$$;

revoke all on function public.workspace_mime_is_allowed(text) from public, anon;
grant execute on function public.workspace_mime_is_allowed(text) to authenticated, service_role;

create or replace function public.workspace_name_has_allowed_extension(target_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(coalesce(target_name, '')) ~ '\.(7z|csv|doc|docx|gif|heic|jpeg|jpg|json|m4a|md|mov|mp3|mp4|pdf|png|ppt|pptx|rar|rtf|txt|wav|webm|webp|xls|xlsx|xml|zip)$';
$$;

revoke all on function public.workspace_name_has_allowed_extension(text) from public, anon;
grant execute on function public.workspace_name_has_allowed_extension(text) to authenticated, service_role;

create or replace function public.protect_workspace_item_fields()
returns trigger
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  stored_size bigint;
  stored_mime text;
begin
  new.name := btrim(regexp_replace(coalesce(new.name, ''), '[[:cntrl:]\\/]+', ' ', 'g'));
  if char_length(new.name) not between 1 and 120 then
    raise check_violation using message = 'INVALID_WORKSPACE_NAME';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.user_id is distinct from old.user_id
      or new.kind is distinct from old.kind
      or new.storage_path is distinct from old.storage_path
      or new.mime_type is distinct from old.mime_type
      or new.size_bytes is distinct from old.size_bytes then
      raise insufficient_privilege using message = 'IMMUTABLE_WORKSPACE_FIELDS';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if new.kind = 'folder' then
    new.storage_path := null;
    new.mime_type := null;
    new.size_bytes := 0;
    return new;
  end if;

  if new.storage_path is null
    or new.storage_path not like new.user_id::text || '/' || new.id::text || '/%' then
    raise check_violation using message = 'INVALID_WORKSPACE_PATH';
  end if;
  if not public.workspace_name_has_allowed_extension(new.storage_path) then
    raise check_violation using message = 'WORKSPACE_FILE_EXTENSION_NOT_ALLOWED';
  end if;

  select nullif(objects.metadata->>'size', '')::bigint,
         lower(coalesce(objects.metadata->>'mimetype', ''))
    into stored_size, stored_mime
  from storage.objects as objects
  where objects.bucket_id = 'workspace-files'
    and objects.name = new.storage_path
  limit 1;

  if stored_size is null or stored_size <= 0 or stored_size > 52428800 then
    raise check_violation using message = 'INVALID_WORKSPACE_FILE_SIZE';
  end if;
  if not public.workspace_mime_is_allowed(stored_mime) then
    raise check_violation using message = 'WORKSPACE_FILE_TYPE_NOT_ALLOWED';
  end if;

  new.size_bytes := stored_size;
  new.mime_type := stored_mime;
  return new;
end;
$$;

revoke all on function public.protect_workspace_item_fields() from public, anon, authenticated;
grant execute on function public.protect_workspace_item_fields() to service_role;

drop trigger if exists protect_workspace_item_fields on public.workspace_items;
drop trigger if exists a_protect_workspace_item_fields on public.workspace_items;
create trigger a_protect_workspace_item_fields
before insert or update on public.workspace_items
for each row execute function public.protect_workspace_item_fields();

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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workspace-files', 'workspace-files', false, 52428800, array[
  'application/json', 'application/msword', 'application/pdf', 'application/rtf',
  'application/vnd.ms-excel', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.rar', 'application/x-7z-compressed', 'application/x-rar-compressed', 'application/xml', 'application/zip',
  'audio/mp4', 'audio/mpeg', 'audio/wav', 'image/gif', 'image/heic', 'image/heif', 'image/jpeg', 'image/png', 'image/webp',
  'text/csv', 'text/markdown', 'text/plain', 'text/rtf', 'text/xml', 'video/mp4', 'video/quicktime', 'video/webm'
])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.workspace_storage_upload_allowed(target_name text, target_metadata jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  target_user uuid := auth.uid();
  incoming_size bigint;
  incoming_mime text;
  current_total bigint;
  storage_limit bigint;
begin
  if target_user is null or target_name not like target_user::text || '/%' then return false; end if;
  if not public.workspace_name_has_allowed_extension(target_name) then return false; end if;
  incoming_size := nullif(target_metadata->>'size', '')::bigint;
  incoming_mime := lower(coalesce(target_metadata->>'mimetype', ''));
  if incoming_size is null or incoming_size <= 0 or incoming_size > 52428800 then return false; end if;
  if not public.workspace_mime_is_allowed(incoming_mime) then return false; end if;

  select coalesce(sum(nullif(objects.metadata->>'size', '')::bigint), 0)
    into current_total
  from storage.objects as objects
  where objects.bucket_id = 'workspace-files'
    and objects.name like target_user::text || '/%'
    and objects.name <> target_name;

  storage_limit := (public.estudiemos_plan_limits(public.estudiemos_current_plan(target_user))->>'storage_bytes')::bigint;
  return current_total + incoming_size <= storage_limit;
exception when others then
  return false;
end;
$$;

revoke all on function public.workspace_storage_upload_allowed(text, jsonb) from public, anon;
grant execute on function public.workspace_storage_upload_allowed(text, jsonb) to authenticated, service_role;

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
  (storage.foldername(name))[1] = (select auth.uid())::text and
  public.workspace_storage_upload_allowed(name, metadata)
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
  (storage.foldername(name))[1] = (select auth.uid())::text and
  public.workspace_storage_upload_allowed(name, metadata)
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
