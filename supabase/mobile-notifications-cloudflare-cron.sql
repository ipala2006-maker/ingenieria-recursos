-- Stage only. Apply after real CPU, delivery and secrets checks pass.
-- With no dispatch config in Vault, existing Vercel delivery is preserved.
create or replace function public.tick_mobile_push()
returns void language plpgsql security definer set search_path = '' as $$
declare token text; pending integer; worker integer; settings jsonb;
  endpoint text := 'https://estudiemos-app.vercel.app/api/widget-push?mobilePush=dispatch';
  batch_size integer := 100;
  timeout_ms integer := 100000;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(1793025042, 1) then return; end if;
  select decrypted_secret into token from vault.decrypted_secrets where name='estudiemos_mobile_push_cron' limit 1;
  if token is null or length(token)<32 then return; end if;
  select decrypted_secret::jsonb into settings from vault.decrypted_secrets where name='estudiemos_mobile_push_dispatch_config' limit 1;
  if settings is not null then
    -- Fixed destinations: never send the cron credential to a caller's URL.
    if settings->>'url' not in (
      'https://estudiemos-push-candidate.estudiemos-services.workers.dev/dispatch',
      'https://estudiemos-push.estudiemos-services.workers.dev/dispatch'
    ) or settings->>'batchSize' is distinct from '1' or settings->>'url' is null then
      raise exception 'INVALID_PUSH_DISPATCH_CONFIG';
    end if;
    endpoint := settings->>'url'; batch_size := 1; timeout_ms := 60000;
  end if;
  insert into public.mobile_push_health(id,heartbeat) values(true,now())
    on conflict(id) do update set heartbeat=excluded.heartbeat;
  delete from public.mobile_push_jobs where occurrence<now()-interval '2 days';
  delete from public.mobile_push_subscriptions where expires_at<now();
  perform public.enqueue_mobile_push_jobs(1000);
  select count(*) into pending from (select 1 from public.mobile_push_jobs
    where sent_at is null and attempts<3 and available_at<=now()
      and occurrence-interval '30 seconds' between now()-interval '10 minutes' and now() limit 400) q;
  if pending>0 then
    -- 400 jobs means 400 small Workers calls, not four. Empty ticks make no HTTP call.
    for worker in 1..((pending+batch_size-1)/batch_size) loop
      perform net.http_post(url:=endpoint,
        headers:=jsonb_build_object('Authorization','Bearer '||token,'Content-Type','application/json'),
        body:='{}'::jsonb, timeout_milliseconds:=timeout_ms);
    end loop;
  end if;
end $$;
revoke all on function public.tick_mobile_push() from public, anon, authenticated, service_role;
-- Keep the existing minute schedule; never run a second scheduler in parallel.
