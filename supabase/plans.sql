create table if not exists public.user_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null default 'initial' check (plan_id in ('initial', 'plus', 'pro')),
  status text not null default 'test' check (status in ('test', 'active', 'past_due', 'cancelled')),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_month date not null,
  feature text not null check (feature in ('ai', 'whatsapp')),
  action_count integer not null default 0 check (action_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_month, feature)
);

alter table public.user_plans enable row level security;
alter table public.plan_usage_monthly enable row level security;

revoke all on table public.user_plans from public, anon, authenticated;
revoke all on table public.plan_usage_monthly from public, anon, authenticated;
grant select on table public.user_plans to authenticated;
grant select on table public.plan_usage_monthly to authenticated;
grant select, insert, update, delete on table public.user_plans to service_role;
grant select, insert, update, delete on table public.plan_usage_monthly to service_role;

drop policy if exists "Students read their own plan" on public.user_plans;
create policy "Students read their own plan"
on public.user_plans for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Students read their own usage" on public.plan_usage_monthly;
create policy "Students read their own usage"
on public.plan_usage_monthly for select to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.estudiemos_plan_limits(target_plan text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case target_plan
    when 'plus' then jsonb_build_object('storage_bytes', 5368709120, 'ai', 300, 'whatsapp', 100)
    when 'pro' then jsonb_build_object('storage_bytes', 21474836480, 'ai', 1000, 'whatsapp', 500)
    else jsonb_build_object('storage_bytes', 262144000, 'ai', 20, 'whatsapp', 5)
  end;
$$;

create or replace function public.estudiemos_current_plan(target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select plan_id from public.user_plans
    where user_id = target_user_id
      and status in ('test', 'active')
    limit 1
  ), 'initial');
$$;

create or replace function public.get_plan_status()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_user uuid := auth.uid();
  selected_plan text;
  limits jsonb;
  month_start date := date_trunc('month', timezone('America/Argentina/Buenos_Aires', now()))::date;
  ai_used integer := 0;
  whatsapp_used integer := 0;
begin
  if target_user is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  insert into public.user_plans (user_id) values (target_user) on conflict (user_id) do nothing;
  selected_plan := public.estudiemos_current_plan(target_user);
  limits := public.estudiemos_plan_limits(selected_plan);
  select coalesce(max(action_count) filter (where feature = 'ai'), 0),
         coalesce(max(action_count) filter (where feature = 'whatsapp'), 0)
    into ai_used, whatsapp_used
  from public.plan_usage_monthly
  where user_id = target_user and usage_month = month_start;
  return jsonb_build_object(
    'planId', selected_plan,
    'mode', 'test',
    'billingEnabled', false,
    'storageBytes', (limits->>'storage_bytes')::bigint,
    'ai', jsonb_build_object('used', ai_used, 'limit', (limits->>'ai')::integer),
    'whatsapp', jsonb_build_object('used', whatsapp_used, 'limit', (limits->>'whatsapp')::integer)
  );
end;
$$;

create or replace function public.set_test_plan(target_plan text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_user uuid := auth.uid();
begin
  if target_user is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  if target_plan not in ('initial', 'plus', 'pro') then raise invalid_parameter_value using message = 'Invalid plan'; end if;
  insert into public.user_plans (user_id, plan_id, status, updated_at)
  values (target_user, target_plan, 'test', now())
  on conflict (user_id) do update set plan_id = excluded.plan_id, status = 'test', updated_at = now();
  return public.get_plan_status();
end;
$$;

create or replace function public.consume_plan_action(target_feature text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_user uuid := auth.uid();
  selected_plan text;
  limits jsonb;
  allowed_count integer;
  next_count integer;
  month_start date := date_trunc('month', timezone('America/Argentina/Buenos_Aires', now()))::date;
begin
  if target_user is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  if target_feature not in ('ai', 'whatsapp') then raise invalid_parameter_value using message = 'Invalid feature'; end if;
  selected_plan := public.estudiemos_current_plan(target_user);
  limits := public.estudiemos_plan_limits(selected_plan);
  allowed_count := (limits->>target_feature)::integer;
  insert into public.plan_usage_monthly (user_id, usage_month, feature, action_count)
  values (target_user, month_start, target_feature, 1)
  on conflict (user_id, usage_month, feature) do update
    set action_count = public.plan_usage_monthly.action_count + 1, updated_at = now()
  returning action_count into next_count;
  if next_count > allowed_count then
    update public.plan_usage_monthly set action_count = allowed_count
    where user_id = target_user and usage_month = month_start and feature = target_feature;
    return jsonb_build_object('allowed', false, 'planId', selected_plan, 'used', allowed_count, 'limit', allowed_count);
  end if;
  return jsonb_build_object('allowed', true, 'planId', selected_plan, 'used', next_count, 'limit', allowed_count);
end;
$$;

create or replace function public.consume_plan_action_for_user(target_user_id uuid, target_feature text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_plan text;
  limits jsonb;
  allowed_count integer;
  next_count integer;
  month_start date := date_trunc('month', timezone('America/Argentina/Buenos_Aires', now()))::date;
begin
  if target_feature not in ('ai', 'whatsapp') then raise invalid_parameter_value using message = 'Invalid feature'; end if;
  selected_plan := public.estudiemos_current_plan(target_user_id);
  limits := public.estudiemos_plan_limits(selected_plan);
  allowed_count := (limits->>target_feature)::integer;
  insert into public.plan_usage_monthly (user_id, usage_month, feature, action_count)
  values (target_user_id, month_start, target_feature, 1)
  on conflict (user_id, usage_month, feature) do update
    set action_count = public.plan_usage_monthly.action_count + 1, updated_at = now()
  returning action_count into next_count;
  if next_count > allowed_count then
    update public.plan_usage_monthly set action_count = allowed_count
    where user_id = target_user_id and usage_month = month_start and feature = target_feature;
    return jsonb_build_object('allowed', false, 'planId', selected_plan, 'used', allowed_count, 'limit', allowed_count);
  end if;
  return jsonb_build_object('allowed', true, 'planId', selected_plan, 'used', next_count, 'limit', allowed_count);
end;
$$;

create or replace function public.enforce_workspace_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_total bigint;
  old_size bigint := 0;
  storage_limit bigint;
begin
  if new.kind <> 'file' then return new; end if;
  if tg_op = 'UPDATE' and old.kind = 'file' then old_size := old.size_bytes; end if;
  select coalesce(sum(size_bytes), 0) into current_total
  from public.workspace_items where user_id = new.user_id and kind = 'file';
  storage_limit := (public.estudiemos_plan_limits(public.estudiemos_current_plan(new.user_id))->>'storage_bytes')::bigint;
  if current_total - old_size + new.size_bytes > storage_limit then
    raise check_violation using message = 'PLAN_STORAGE_LIMIT_REACHED';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_workspace_plan_limit on public.workspace_items;
create trigger enforce_workspace_plan_limit
before insert or update of size_bytes, kind on public.workspace_items
for each row execute function public.enforce_workspace_plan_limit();

revoke all on function public.estudiemos_plan_limits(text) from public, anon, authenticated;
revoke all on function public.estudiemos_current_plan(uuid) from public, anon, authenticated;
revoke all on function public.get_plan_status() from public, anon;
revoke all on function public.set_test_plan(text) from public, anon;
revoke all on function public.consume_plan_action(text) from public, anon;
revoke all on function public.consume_plan_action_for_user(uuid, text) from public, anon, authenticated;
grant execute on function public.get_plan_status() to authenticated;
grant execute on function public.set_test_plan(text) to authenticated;
grant execute on function public.consume_plan_action(text) to authenticated;
grant execute on function public.consume_plan_action_for_user(uuid, text) to service_role;
