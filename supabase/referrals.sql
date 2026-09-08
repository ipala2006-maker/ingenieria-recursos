create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.referral_identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  referral_code text not null unique check (referral_code ~ '^[A-Z0-9]{8,12}$'),
  phone_hash text unique check (phone_hash is null or length(phone_hash) = 64),
  phone_masked text,
  phone_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id bigint generated always as identity primary key,
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  invited_user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'qualified' check (status in ('verified', 'qualified', 'rejected')),
  first_payment_reference text unique,
  registered_at timestamptz not null default now(),
  qualified_at timestamptz,
  check (inviter_user_id <> invited_user_id)
);

alter table public.referrals alter column status set default 'qualified';

create index if not exists referrals_inviter_status_idx on public.referrals (inviter_user_id, status);

create table if not exists public.referral_benefits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  discount_percent smallint not null default 0 check (discount_percent in (0, 35, 45)),
  qualified_direct_count integer not null default 0 check (qualified_direct_count >= 0),
  reason text not null default 'none' check (reason in ('none', 'verified_invite', 'three_verified', 'cascade', 'three_paid')),
  benefit_month date,
  discount_valid_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.referral_benefits add column if not exists benefit_month date;
alter table public.referral_benefits add column if not exists discount_valid_until timestamptz;

alter table public.referral_benefits drop constraint if exists referral_benefits_reason_check;
alter table public.referral_benefits add constraint referral_benefits_reason_check
  check (reason in ('none', 'verified_invite', 'three_verified', 'cascade', 'three_paid'));

alter table public.referral_identities enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_benefits enable row level security;
alter table public.referral_identities force row level security;
alter table public.referrals force row level security;
alter table public.referral_benefits force row level security;

revoke all on table public.referral_identities from public, anon, authenticated;
revoke all on table public.referrals from public, anon, authenticated;
revoke all on table public.referral_benefits from public, anon, authenticated;
grant select, insert, update, delete on table public.referral_identities to service_role;
grant select, insert, update, delete on table public.referrals to service_role;
grant select, insert, update, delete on table public.referral_benefits to service_role;
grant usage, select on sequence public.referrals_id_seq to service_role;

create or replace function private.ensure_referral_identity(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  candidate text;
begin
  if target_user is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  if exists (select 1 from public.referral_identities where user_id = target_user) then return; end if;
  loop
    candidate := upper(substr(md5(target_user::text || clock_timestamp()::text || random()::text), 1, 10));
    begin
      insert into public.referral_identities (user_id, referral_code) values (target_user, candidate);
      return;
    exception when unique_violation then
      if exists (select 1 from public.referral_identities where user_id = target_user) then return; end if;
    end;
  end loop;
end;
$$;

create or replace function private.refresh_referral_benefit(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  direct_count integer;
  arrived_as_qualified_referral boolean;
  month_start date := date_trunc('month', timezone('America/Argentina/Buenos_Aires', now()))::date;
  month_end timestamptz;
  next_discount smallint := 0;
  next_reason text := 'none';
begin
  month_end := ((month_start + interval '1 month')::timestamp at time zone 'America/Argentina/Buenos_Aires');
  select count(*)::integer into direct_count
  from public.referrals
  where inviter_user_id = target_user
    and status = 'qualified'
    and (qualified_at at time zone 'America/Argentina/Buenos_Aires')::date >= month_start;
  select exists (
    select 1 from public.referrals
    where invited_user_id = target_user
      and status = 'qualified'
      and (qualified_at at time zone 'America/Argentina/Buenos_Aires')::date >= month_start
  ) into arrived_as_qualified_referral;
  if direct_count >= 3 then
    next_discount := 45; next_reason := 'three_verified';
  elsif arrived_as_qualified_referral then
    next_discount := 35; next_reason := 'verified_invite';
  end if;
  insert into public.referral_benefits (user_id, discount_percent, qualified_direct_count, reason, benefit_month, discount_valid_until, updated_at)
  values (target_user, next_discount, direct_count, next_reason, month_start, month_end, now())
  on conflict (user_id) do update set
    discount_percent = excluded.discount_percent,
    qualified_direct_count = excluded.qualified_direct_count,
    reason = excluded.reason,
    benefit_month = excluded.benefit_month,
    discount_valid_until = excluded.discount_valid_until,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.get_referral_status()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  target_user uuid := auth.uid();
  identity_row public.referral_identities%rowtype;
  benefit_row public.referral_benefits%rowtype;
  pending_count integer := 0;
  was_referred boolean := false;
begin
  if target_user is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  perform private.ensure_referral_identity(target_user);
  perform private.refresh_referral_benefit(target_user);
  select * into identity_row from public.referral_identities where user_id = target_user;
  select * into benefit_row from public.referral_benefits where user_id = target_user;
  select count(*)::integer into pending_count from public.referrals
    where inviter_user_id = target_user and status = 'verified';
  select exists (select 1 from public.referrals where invited_user_id = target_user)
    into was_referred;
  return jsonb_build_object(
    'code', identity_row.referral_code,
    'emailVerified', exists (select 1 from auth.users where id = target_user and email_confirmed_at is not null and nullif(trim(email), '') is not null),
    'phoneVerified', identity_row.phone_verified_at is not null,
    'phoneMasked', coalesce(identity_row.phone_masked, ''),
    'wasReferred', was_referred,
    'qualifiedDirectCount', coalesce(benefit_row.qualified_direct_count, 0),
    'pendingPaymentCount', pending_count,
    'discountPercent', coalesce(benefit_row.discount_percent, 0),
    'discountValidUntil', benefit_row.discount_valid_until,
    'reason', coalesce(benefit_row.reason, 'none')
  );
end;
$$;

create or replace function public.claim_referral_code(target_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  target_user uuid := auth.uid();
  inviter_id uuid;
begin
  if target_user is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  perform private.ensure_referral_identity(target_user);
  if not exists (select 1 from auth.users where id = target_user and email_confirmed_at is not null and nullif(trim(email), '') is not null) then
    raise check_violation using message = 'EMAIL_VERIFICATION_REQUIRED';
  end if;
  if exists (select 1 from public.referrals where invited_user_id = target_user) then
    raise unique_violation using message = 'REFERRAL_ALREADY_CLAIMED';
  end if;
  select identity.user_id into inviter_id from public.referral_identities identity
    join auth.users account on account.id = identity.user_id
    where identity.referral_code = upper(regexp_replace(coalesce(target_code, ''), '[^A-Za-z0-9]', '', 'g'))
      and account.email_confirmed_at is not null and nullif(trim(account.email), '') is not null;
  if inviter_id is null then raise invalid_parameter_value using message = 'INVALID_REFERRAL_CODE'; end if;
  if inviter_id = target_user then raise check_violation using message = 'SELF_REFERRAL_NOT_ALLOWED'; end if;
  if exists (select 1 from auth.users inviter join auth.users invited
    on lower(trim(inviter.email)) = lower(trim(invited.email))
    where inviter.id = inviter_id and invited.id = target_user) then
    raise check_violation using message = 'SELF_REFERRAL_NOT_ALLOWED';
  end if;
  -- Serialize concurrent invitations so the third registration cannot be lost.
  perform 1 from public.referral_identities where user_id = inviter_id for update;
  insert into public.referrals (inviter_user_id, invited_user_id, status, qualified_at)
  values (inviter_id, target_user, 'qualified', now());
  perform private.refresh_referral_benefit(inviter_id);
  perform private.refresh_referral_benefit(target_user);
  return public.get_referral_status();
end;
$$;

-- Convierte relaciones antiguas que ya tenían ambas identidades verificadas.
update public.referrals as relation
set status = 'qualified', qualified_at = coalesce(relation.qualified_at, now())
where relation.status = 'verified'
  and exists (
    select 1 from public.referral_identities as invited
    where invited.user_id = relation.invited_user_id and invited.phone_verified_at is not null
  )
  and exists (
    select 1 from public.referral_identities as inviter
    where inviter.user_id = relation.inviter_user_id and inviter.phone_verified_at is not null
  );

do $$
declare identity_row record;
begin
  for identity_row in select user_id from public.referral_identities loop
    perform private.refresh_referral_benefit(identity_row.user_id);
  end loop;
end;
$$;

create or replace function public.register_verified_referral_phone(target_user_id uuid, target_phone_hash text, target_phone_masked text)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if target_user_id is null or length(coalesce(target_phone_hash, '')) <> 64 then
    raise invalid_parameter_value using message = 'INVALID_PHONE_IDENTITY';
  end if;
  perform private.ensure_referral_identity(target_user_id);
  update public.referral_identities set
    phone_hash = target_phone_hash,
    phone_masked = left(coalesce(target_phone_masked, ''), 32),
    phone_verified_at = now(),
    updated_at = now()
  where user_id = target_user_id;
end;
$$;

create or replace function public.qualify_referral_after_first_payment(target_user_id uuid, payment_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  relation public.referrals%rowtype;
begin
  if length(trim(coalesce(payment_reference, ''))) < 6 then
    raise invalid_parameter_value using message = 'INVALID_PAYMENT_REFERENCE';
  end if;
  if not exists (select 1 from auth.users where id = target_user_id and email_confirmed_at is not null and nullif(trim(email), '') is not null) then
    raise check_violation using message = 'EMAIL_VERIFICATION_REQUIRED';
  end if;
  select * into relation from public.referrals where invited_user_id = target_user_id for update;
  if relation.id is null then return jsonb_build_object('qualified', false, 'reason', 'not_referred'); end if;
  if relation.status = 'qualified' then
    return jsonb_build_object('qualified', true, 'idempotent', true);
  end if;
  update public.referrals set status = 'qualified', first_payment_reference = trim(payment_reference), qualified_at = now()
    where id = relation.id;
  perform private.refresh_referral_benefit(relation.inviter_user_id);
  perform private.refresh_referral_benefit(target_user_id);
  return jsonb_build_object('qualified', true, 'idempotent', false);
end;
$$;

revoke all on function private.ensure_referral_identity(uuid) from public, anon, authenticated;
revoke all on function private.refresh_referral_benefit(uuid) from public, anon, authenticated;
revoke all on function public.get_referral_status() from public, anon;
revoke all on function public.claim_referral_code(text) from public, anon;
revoke all on function public.register_verified_referral_phone(uuid, text, text) from public, anon, authenticated;
revoke all on function public.qualify_referral_after_first_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.get_referral_status() to authenticated;
grant execute on function public.claim_referral_code(text) to authenticated;
grant execute on function public.register_verified_referral_phone(uuid, text, text) to service_role;
grant execute on function public.qualify_referral_after_first_payment(uuid, text) to service_role;
