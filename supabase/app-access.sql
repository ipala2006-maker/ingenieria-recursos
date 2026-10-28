-- Stage before APP_ACCESS_MODE=restricted. This does not activate billing.
begin;
create or replace function public.get_app_access()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare target uuid:=auth.uid();
begin
  if target is null then raise exception 'AUTH_REQUIRED'; end if;
  return jsonb_build_object(
    'paidPro',exists(select 1 from public.user_plans p where p.user_id=target
      and p.plan_id='pro' and p.status='active'
      and (p.current_period_end is null or p.current_period_end>now())),
    'ownsClass',exists(select 1 from public.classrooms c where c.owner_id=target)
  );
end $$;
revoke all on function public.get_app_access() from public,anon,authenticated,service_role;
grant execute on function public.get_app_access() to authenticated;
notify pgrst,'reload schema';
commit;
