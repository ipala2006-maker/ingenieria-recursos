-- Staged only. No rows are rewritten by applying this function.
begin;
create or replace function public.recipher_drive_connection(
  p_user uuid,p_expected_credentials text,p_expected_updated_at timestamptz,p_credentials text
) returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_user is null or p_expected_updated_at is null or p_expected_credentials is null
    or p_credentials is null or length(p_credentials) not between 40 and 24000
    or p_credentials !~ '^v2\.[a-z][a-z0-9_-]{0,31}\.[A-Za-z0-9_-]+$'
    or p_credentials=p_expected_credentials then raise exception 'INVALID_DRIVE_RECIPHER'; end if;
  update public.drive_connections set credentials=p_credentials,updated_at=clock_timestamp()
    where user_id=p_user and credentials=p_expected_credentials and updated_at=p_expected_updated_at;
  return found;
end $$;
revoke all on function public.recipher_drive_connection(uuid,text,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.recipher_drive_connection(uuid,text,timestamptz,text) to service_role;
notify pgrst,'reload schema';
commit;
