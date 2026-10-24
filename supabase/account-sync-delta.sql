-- Additive, account-scoped delta synchronization; existing clients keep working.
begin;
create or replace function public.sync_account_state(p_known jsonb default '{}'::jsonb,p_patch jsonb default null,p_expected timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  uid uuid:=auth.uid(); row_data public.user_states%rowtype;
  versions jsonb:='{}'; vals jsonb:='{}'; stamps jsonb:='{}'; key text; fingerprint text; conflict boolean:=false; created boolean:=false;
  allowed text[]:=array['bandeja_favoritos','bandeja_guardados','bandeja_materias','bandeja_recientes','bandeja_agenda','bandeja_horarios','bandeja_calendario_papelera','estudiemos_pomodoro_streak','estudiemos_pomodoro_sync','estudiemos_workspace_changed','estudiemos_android_devices','estudiemos_theme'];
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if jsonb_typeof(p_known) is distinct from 'object' or octet_length(p_known::text)>4096 then raise exception 'INVALID_DATA'; end if;
  if p_patch is not null then
    if jsonb_typeof(p_patch->'values') is distinct from 'object' or jsonb_typeof(p_patch->'changedAt') is distinct from 'object' or octet_length(p_patch::text)>1048576 then raise exception 'INVALID_DATA'; end if;
    for key in select jsonb_object_keys(p_patch->'values') loop
      if not key=any(allowed) or jsonb_typeof(p_patch->'changedAt'->key) is distinct from 'number' then raise exception 'INVALID_DATA'; end if;
    end loop;
    insert into public.user_states(user_id) values(uid) on conflict(user_id) do nothing returning * into row_data;
    created:=row_data.user_id is not null;
    select * into row_data from public.user_states where user_id=uid for update;
    conflict:=not created and p_expected is distinct from row_data.updated_at;
    if not conflict then
      update public.user_states set state=jsonb_build_object('version',2,'values',coalesce(row_data.state->'values','{}'::jsonb)||(p_patch->'values'),'changedAt',coalesce(row_data.state->'changedAt','{}'::jsonb)||(p_patch->'changedAt')),
        updated_at=greatest(clock_timestamp(),row_data.updated_at+interval '1 millisecond') where user_id=uid returning * into row_data;
    end if;
  else select * into row_data from public.user_states where user_id=uid;
  end if;
  if row_data.user_id is null then return jsonb_build_object('missing',true,'versions','{}'::jsonb); end if;
  foreach key in array allowed loop
    fingerprint:=md5(jsonb_build_array(row_data.state->'values'->key,row_data.state->'changedAt'->key)::text);
    versions:=versions||jsonb_build_object(key,fingerprint);
    if p_known->>key is distinct from fingerprint then
      if (row_data.state->'values')?key then vals:=vals||jsonb_build_object(key,row_data.state->'values'->key); end if;
      if (row_data.state->'changedAt')?key then stamps:=stamps||jsonb_build_object(key,row_data.state->'changedAt'->key); end if;
    end if;
  end loop;
  if p_patch is not null and not conflict then return jsonb_build_object('written',true,'updated_at',row_data.updated_at,'versions',versions); end if;
  return jsonb_build_object('partial',true,'conflict',conflict,'updated_at',row_data.updated_at,'versions',versions,'state',jsonb_build_object('version',2,'values',vals,'changedAt',stamps));
end $$;
revoke all on function public.sync_account_state(jsonb,jsonb,timestamptz) from public,anon,service_role;
grant execute on function public.sync_account_state(jsonb,jsonb,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;
