-- Read-only administrative report. No endpoints, tokens, titles, emails or IDs.
select pg_database_size(current_database()) as database_bytes,
  sum(pg_total_relation_size(relid)) filter(where schemaname='public') as public_relations_bytes
  from pg_catalog.pg_statio_user_tables;

select (select count(*) from auth.users) as registered_accounts,
  (select count(*) from public.mobile_push_subscriptions where expires_at>now()) as live_mobile_destinations,
  (select count(*) from public.mobile_push_alarm_tasks) as projected_alarms,
  (select count(*) from public.mobile_push_schedule where due_at<=now()) as schedules_due,
  (select heartbeat>now()-interval '3 minutes' from public.mobile_push_health where id) as cron_healthy;

select count(*) as queued_last_24h,
  count(*) filter(where sent_at is not null) as sent,
  count(*) filter(where sent_at is null and attempts>=3) as retries_exhausted,
  count(*) filter(where sent_at is null and occurrence<now()-interval '10 minutes') as expired_undelivered,
  percentile_cont(0.95) within group(order by greatest(0,extract(epoch from sent_at-occurrence)))
    filter(where sent_at is not null) as p95_nominal_delay_seconds
  from public.mobile_push_jobs where occurrence>=now()-interval '24 hours';

select count(*) as today_jobs,20000 as daily_queue_budget
  from public.mobile_push_jobs where occurrence>=date_trunc('day',now());
