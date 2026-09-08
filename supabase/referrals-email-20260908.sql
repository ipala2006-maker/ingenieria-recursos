-- Existing grants and all account data are preserved.

begin;

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

commit;
