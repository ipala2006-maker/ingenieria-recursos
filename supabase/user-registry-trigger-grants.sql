-- Existing installations: harden only the registry trigger, with no data rewrite.
begin;
alter function private.sync_user_registry() set search_path = '';
revoke execute on function private.sync_user_registry() from public, anon, authenticated, service_role;
commit;
