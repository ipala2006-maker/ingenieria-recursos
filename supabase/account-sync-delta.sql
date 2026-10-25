-- Additive, account-scoped delta synchronization; existing clients keep working.
begin;
create or replace function public.sync_account_state(p_known jsonb default '{}'::jsonb,p_patch jsonb default null,p_expected timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  uid uuid:=auth.uid(); row_data public.user_states%rowtype;
  versions jsonb:='{}'; vals jsonb:='{}'; stamps jsonb:='{}'; lists jsonb:='{}'; key text; fingerprint text; conflict boolean:=false; created boolean:=false;
  saved_deltas jsonb; previous_list jsonb; next_list jsonb; delta jsonb; put_items jsonb; remove_ids jsonb; previous_order jsonb; next_order jsonb;
  list_keys text[]:=array['bandeja_favoritos','bandeja_guardados','bandeja_materias','bandeja_recientes','bandeja_agenda','bandeja_horarios','bandeja_calendario_papelera','estudiemos_android_devices'];
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
      saved_deltas:=case when jsonb_typeof(row_data.state->'_listDelta')='object' then row_data.state->'_listDelta' else '{}'::jsonb end;
      for key in select jsonb_object_keys(p_patch->'values') loop
        if not key=any(list_keys) then continue; end if;
        previous_list:=row_data.state->'values'->key; next_list:=p_patch->'values'->key;
        saved_deltas:=saved_deltas-key;
        -- Keep only the latest small edit, not an unbounded operation history.
        -- Old/irregular lists keep the exact full-value transport.
        if jsonb_typeof(previous_list) is distinct from 'array' or jsonb_typeof(next_list) is distinct from 'array' then continue; end if;
        if jsonb_array_length(previous_list)>2000 or jsonb_array_length(next_list)>2000 then continue; end if;
        if exists(select 1 from jsonb_array_elements(previous_list||next_list) x where jsonb_typeof(x->'id') is distinct from 'string' or length(x->>'id') not between 1 and 180)
          or (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(previous_list) x)
          or (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(next_list) x) then continue; end if;
        select coalesce(jsonb_agg(n.value order by n.ordinality),'[]') into put_items
          from jsonb_array_elements(next_list) with ordinality n
          left join jsonb_array_elements(previous_list) o on o->>'id'=n.value->>'id'
          where o is distinct from n.value;
        select coalesce(jsonb_agg(o->'id'),'[]') into remove_ids from jsonb_array_elements(previous_list) o
          where not exists(select 1 from jsonb_array_elements(next_list) n where n->>'id'=o->>'id');
        select coalesce(jsonb_agg(x.value->'id' order by x.ordinality),'[]') into previous_order from jsonb_array_elements(previous_list) with ordinality x;
        select coalesce(jsonb_agg(x.value->'id' order by x.ordinality),'[]') into next_order from jsonb_array_elements(next_list) with ordinality x;
        delta:=jsonb_build_object('base',md5(jsonb_build_array(previous_list,row_data.state->'changedAt'->key)::text),
          'target',md5(jsonb_build_array(next_list,p_patch->'changedAt'->key)::text),'put',put_items,'remove',remove_ids,
          'order',case when previous_order is distinct from next_order then next_order else null end);
        if octet_length(delta::text)<=4096 and octet_length(delta::text)<octet_length(next_list::text) then
          saved_deltas:=saved_deltas||jsonb_build_object(key,delta);
        end if;
      end loop;
      update public.user_states set state=jsonb_build_object('version',2,'values',coalesce(row_data.state->'values','{}'::jsonb)||(p_patch->'values'),'changedAt',coalesce(row_data.state->'changedAt','{}'::jsonb)||(p_patch->'changedAt'),'_listDelta',saved_deltas),
        updated_at=greatest(clock_timestamp(),row_data.updated_at+interval '1 millisecond') where user_id=uid returning * into row_data;
    end if;
  else select * into row_data from public.user_states where user_id=uid;
  end if;
  if row_data.user_id is null then return jsonb_build_object('missing',true,'versions','{}'::jsonb); end if;
  foreach key in array allowed loop
    fingerprint:=md5(jsonb_build_array(row_data.state->'values'->key,row_data.state->'changedAt'->key)::text);
    versions:=versions||jsonb_build_object(key,fingerprint);
    if p_known->>key is distinct from fingerprint then
      delta:=row_data.state->'_listDelta'->key;
      if p_known->>'_listDelta'='1' and key=any(list_keys) and delta->>'base'=p_known->>key and delta->>'target'=fingerprint then
        lists:=lists||jsonb_build_object(key,delta);
      elsif (row_data.state->'values')?key then vals:=vals||jsonb_build_object(key,row_data.state->'values'->key); end if;
      if (row_data.state->'changedAt')?key then stamps:=stamps||jsonb_build_object(key,row_data.state->'changedAt'->key); end if;
    end if;
  end loop;
  if p_known->>'_compactVersions'='1' then
    select coalesce(jsonb_object_agg(e.key,e.value),'{}') into versions from jsonb_each(versions) e
      where p_known->>e.key is distinct from e.value#>>'{}';
  end if;
  if p_patch is not null and not conflict then return jsonb_build_object('written',true,'updated_at',row_data.updated_at,'versions',versions)||
    case when p_known->>'_compactVersions'='1' then '{"versionsPartial":true}'::jsonb else '{}'::jsonb end; end if;
  return jsonb_build_object('partial',true,'conflict',conflict,'updated_at',row_data.updated_at,'versions',versions,'state',jsonb_build_object('version',2,'values',vals,'changedAt',stamps,'lists',lists))||
    case when p_known->>'_compactVersions'='1' then '{"versionsPartial":true}'::jsonb else '{}'::jsonb end;
end $$;
revoke all on function public.sync_account_state(jsonb,jsonb,timestamptz) from public,anon,service_role;
grant execute on function public.sync_account_state(jsonb,jsonb,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;
