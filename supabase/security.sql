create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.api_rate_limits (
  rate_key text not null,
  route text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (rate_key, route, window_start)
);

alter table private.api_rate_limits enable row level security;
alter table private.api_rate_limits force row level security;
revoke all on table private.api_rate_limits from public, anon, authenticated;

create or replace function public.consume_api_rate_limit(
  target_key text,
  target_route text,
  target_limit integer,
  target_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  current_time timestamptz := clock_timestamp();
  current_window timestamptz;
  reset_time timestamptz;
  next_count integer;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;
  if target_key is null or char_length(target_key) not between 4 and 80 then
    raise invalid_parameter_value using message = 'Invalid rate key';
  end if;
  if target_route is null or char_length(target_route) not between 1 and 80 then
    raise invalid_parameter_value using message = 'Invalid route';
  end if;
  if target_limit not between 1 and 1000 or target_window_seconds not between 1 and 3600 then
    raise invalid_parameter_value using message = 'Invalid rate limit';
  end if;

  current_window := to_timestamp(
    floor(extract(epoch from current_time) / target_window_seconds) * target_window_seconds
  );
  reset_time := current_window + make_interval(secs => target_window_seconds);

  insert into private.api_rate_limits (rate_key, route, window_start, request_count)
  values (target_key, target_route, current_window, 1)
  on conflict (rate_key, route, window_start) do update
    set request_count = private.api_rate_limits.request_count + 1
  returning request_count into next_count;

  if random() < 0.02 then
    delete from private.api_rate_limits where window_start < current_time - interval '2 days';
  end if;

  return jsonb_build_object(
    'allowed', next_count <= target_limit,
    'count', next_count,
    'remaining', greatest(0, target_limit - next_count),
    'resetAt', reset_time
  );
end;
$$;

revoke all on function public.consume_api_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer) to service_role;

-- The account registry must never be callable directly with the public API key.
do $$
begin
  if to_regclass('public.user_registry') is not null then
    revoke all on table public.user_registry from public, anon, authenticated;
    grant select on table public.user_registry to service_role;
  end if;
end;
$$;
