-- Restrict internal trigger/helper functions that are not API endpoints.
revoke all on function public.enforce_workspace_plan_limit() from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;

-- Remove the superseded registry transport. The current export is server-only.
drop function if exists public.export_user_registry(text);
drop table if exists private.app_secrets;

-- Reassert the intended callable surface for plan and workspace helpers.
revoke all on function public.get_plan_status() from public, anon;
revoke all on function public.set_test_plan(text) from public, anon;
revoke all on function public.consume_plan_action(text) from public, anon;
revoke all on function public.consume_plan_action_for_user(uuid, text) from public, anon, authenticated;
revoke all on function public.workspace_parent_is_owned(uuid) from public, anon;
revoke all on function public.workspace_storage_upload_allowed(text, jsonb) from public, anon;

grant execute on function public.get_plan_status() to authenticated;
grant execute on function public.set_test_plan(text) to authenticated;
grant execute on function public.consume_plan_action(text) to authenticated;
grant execute on function public.consume_plan_action_for_user(uuid, text) to service_role;
grant execute on function public.workspace_parent_is_owned(uuid) to authenticated;
grant execute on function public.workspace_storage_upload_allowed(text, jsonb) to authenticated, service_role;
