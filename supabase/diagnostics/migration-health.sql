-- Read-only aggregate diagnostics. Run as an operator, never grant this to clients.
-- No titles, addresses, tokens, subscription endpoints or document names are returned.
select jsonb_build_object(
  'checked_at', now(),
  'database_bytes', pg_database_size(current_database()),
  'users', (select count(*) from auth.users),
  'signed_in_last_30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
  'states', (select count(*) from public.user_states),
  'drive_connections', (select count(*) from public.drive_connections),
  'classrooms', (select count(*) from public.classrooms),
  'classroom_members', (select count(*) from public.classroom_members),
  'storage_objects', (select count(*) from storage.objects),
  'storage_bytes', (select coalesce(sum(case when metadata->>'size' ~ '^[0-9]+$'
    then (metadata->>'size')::numeric else 0 end), 0) from storage.objects),
  'user_states_rls', (select relrowsecurity from pg_class where oid = 'public.user_states'::regclass),
  'push_origins', (select jsonb_agg(jsonb_build_object(
    'origin', o.source_origin, 'key_id', o.vapid_key_id, 'enabled', o.enabled,
    'unexpired', (select count(*) from public.mobile_push_subscriptions s
      where s.source_origin = o.source_origin and s.vapid_key_id = o.vapid_key_id and s.expires_at > now())
    )) from public.mobile_push_origins o),
  'push_heartbeat_seconds', (select extract(epoch from now() - heartbeat)::integer from public.mobile_push_health where id),
  'push_jobs', (select jsonb_build_object(
    'sent', count(*) filter (where sent_at is not null),
    'pending', count(*) filter (where sent_at is null and attempts < 3),
    'exhausted', count(*) filter (where sent_at is null and attempts >= 3)
    ) from public.mobile_push_jobs),
  'alarm_cron', (select jsonb_agg(jsonb_build_object('name', jobname, 'schedule', schedule, 'active', active))
    from cron.job where jobname = 'estudiemos-mobile-alarms')
) as migration_health;
