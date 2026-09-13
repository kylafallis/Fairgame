-- ---------------------------------------------------------------------
-- MIGRATION 12 - THE JUDGE ROLE
-- ---------------------------------------------------------------------
-- A judge could never reach their portal. fg_self_provision_role refuses
-- 'judge' (migration 10), fg_claim_mentor_role only grants 'mentor', and
-- the admin's Activate button writes judges.status without ever touching
-- user_roles. So requireAuth('judge') found no role and bounced every
-- judge to the login page - including the ones whose magic link had just
-- verified perfectly. People then requested link after link and started
-- hitting otp_expired, which is how this surfaced.
--
-- This is the judge counterpart to fg_claim_mentor_role: the admin's
-- Activate click is the human decision, and this only delivers its
-- effect so an approved judge is not stuck waiting for someone to run
-- a query by hand.


-- ---------------------------------------------------------------------
-- PART 1 - CLAIMING THE ROLE
-- ---------------------------------------------------------------------
-- Gated on judges.status = 'active', which is exactly what the admin
-- Activate button sets. An application still sitting at 'unverified'
-- returns null rather than raising: the caller turns that into an
-- under-review screen, and a raise would be indistinguishable from a
-- real fault.

create or replace function public.fg_claim_judge_role()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_role  text;
  v_name  text;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    raise exception 'Not signed in';
  end if;

  -- The gate. Anything other than an activated application declines.
  if not exists (
    select 1 from public.judges
    where lower(email) = lower(v_email)
      and status = 'active'
  ) then
    return null;
  end if;

  v_name := coalesce(
    (select name from public.judges
      where lower(email) = lower(v_email)
      order by created_at desc limit 1),
    auth.jwt() -> 'user_metadata' ->> 'name');

  -- Does nothing on conflict, so this can never overwrite a role that is
  -- already on file. An admin who also judges stays an admin.
  insert into public.user_roles (user_id, role, full_name)
  values (auth.uid(), 'judge', v_name)
  on conflict (user_id) do nothing;

  select role into v_role from public.user_roles where user_id = auth.uid();
  return v_role;
end;
$$;

grant execute on function public.fg_claim_judge_role() to authenticated;


-- ---------------------------------------------------------------------
-- PART 2 - TELLING A WAITING JUDGE FROM A STRANGER
-- ---------------------------------------------------------------------
-- Without this the portal cannot distinguish "approved judge, not yet
-- activated" from "no application at all", and both end up redirected to
-- the login page, which is the loop this migration exists to end.
--
-- Returns the caller's own application status only, so it does not widen
-- what a signed-in user can read about anyone else.

create or replace function public.fg_judge_status()
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_email  text;
  v_status text;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then return null; end if;

  select status into v_status
  from public.judges
  where lower(email) = lower(v_email)
  order by created_at desc
  limit 1;

  return v_status;
end;
$$;

grant execute on function public.fg_judge_status() to authenticated;


-- ---------------------------------------------------------------------
-- PART 3 - JUDGES ALREADY WAITING
-- ---------------------------------------------------------------------
-- Everyone who was activated before this migration existed has an
-- auth.users row and an active judges row but no user_roles row. They
-- are the people who have been retrying links for weeks, so grant the
-- role now rather than making them sign in again to trigger the claim.

insert into public.user_roles (user_id, role, full_name)
select u.id, 'judge', coalesce(j.name, u.raw_user_meta_data ->> 'name')
from public.judges j
join auth.users u on lower(u.email) = lower(j.email)
where j.status = 'active'
on conflict (user_id) do nothing;
