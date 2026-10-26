-- Read-only, account-scoped projection for native Android widget refreshes.
begin;
create or replace function public.get_android_widget_state(p_known jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); saved jsonb; values_out jsonb:='{}'; versions jsonb:='{}'; lists jsonb:='{}'; key text; value jsonb; fingerprint text; delta jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if jsonb_typeof(p_known) is distinct from 'object' or octet_length(p_known::text)>4096 then raise exception 'INVALID_DATA'; end if;
  select state into saved from public.user_states where user_id=uid;
  if not found then return jsonb_build_object('owner',uid,'values','{}'::jsonb,'versions','{}'::jsonb); end if;
  foreach key in array array['bandeja_agenda','estudiemos_pomodoro_streak'] loop
    value:=coalesce(saved->'values'->key,case when key='bandeja_agenda' then '[]'::jsonb else '{}'::jsonb end);
    fingerprint:=case when key='bandeja_agenda' then md5(jsonb_build_array(value,saved->'changedAt'->key)::text) else md5(value::text) end;
    versions:=versions||jsonb_build_object(key,fingerprint);
    if p_known->>key is distinct from fingerprint then
      delta:=saved->'_listDelta'->key;
      if key='bandeja_agenda' and delta->>'base'=p_known->>key and delta->>'target'=fingerprint then
        lists:=lists||jsonb_build_object(key,delta);
      else values_out:=values_out||jsonb_build_object(key,value); end if;
    end if;
  end loop;
  return jsonb_build_object('owner',uid,'values',values_out,'versions',versions,'lists',lists);
end $$;
revoke all on function public.get_android_widget_state(jsonb) from public,anon,service_role;
grant execute on function public.get_android_widget_state(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
