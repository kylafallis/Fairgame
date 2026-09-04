-- =====================================================================
-- FairGame Initiative
-- Migration 08: Guardian consent signing, account linking, mentor role
-- Run after 01-07. Safe to run more than once.
-- =====================================================================
--
-- WHY THIS EXISTS
--
--   Migration 07 built the safety model but left three things that stop
--   it working end to end. All three are the same class of problem: a
--   record exists but nothing connects it to a person.
--
--   1. ACCOUNT LINKING. fg_create_mentorship copied names and emails
--      out of portal_requests but never set student_user_id or
--      mentor_user_id. Those columns are what the read policy and the
--      portal both filter on, so a fully gated match showed an empty
--      thread to both people in it. A match nobody can see is worse
--      than no match, because the admin screen says it is working.
--
--   2. THE MENTOR ROLE. Approving a mentor set portal_requests.status
--      to 'active' and nothing else. Mentors cannot self-provision
--      (migration 06 allows only student, ambassador, teacher), so an
--      approved mentor had no role anywhere and was bounced straight
--      back to the login page. fg_claim_mentor_role below closes that
--      without weakening 06: the role is granted only when an admin has
--      already approved that exact email address.
--
--   3. GUARDIAN CONSENT. The table, the validity rules and the
--      revocation cascade were all enforced, but a guardian had no way
--      to actually sign. Rows had to be typed by hand, so in practice
--      every match would sit at 'pending' forever. That is the safe
--      failure mode and an unusable one.
--
-- HOW CONSENT SIGNING WORKS
--
--   A guardian is not a user of this platform and should not have to
--   become one to say yes. So consent is signed through a single-use
--   link carrying an unguessable token:
--
--     admin creates the consent row  ->  token generated
--     admin emails the link to the guardian
--     guardian opens /consent.html?t=<token>
--     page calls fg_consent_lookup(token)  - anon, read only
--     guardian signs                        - fg_consent_sign(token, ...)
--     guardian may later revoke             - fg_consent_revoke(token)
--
--   The three token functions are the only things on this platform an
--   anonymous caller may touch here. Each one is security definer and
--   narrow: lookup returns the few fields needed to render the page and
--   nothing about any other student, sign writes only the signature
--   fields, revoke only sets revoked_at. A token is scoped to exactly
--   one consent row, expires, and stops working the moment it is used
--   for its purpose.
--
--   Revocation deliberately keeps working after signing and does not
--   expire. A guardian must be able to withdraw permission at any time,
--   and making that harder than granting it would be indefensible.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART 1 - ACCOUNT LINKING
-- ---------------------------------------------------------------------
-- portal_requests identifies people by email; auth.users is the only
-- place an id exists. This resolves one to the other. It is written to
-- be run repeatedly - a student who creates their account a week after
-- being matched gets linked on the next run.

create or replace function public.fg_link_mentorship_accounts(p_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if not public.fg_is_admin() then
    raise exception 'Only an admin can link mentorship accounts';
  end if;

  -- Written as two straightforward statements rather than one clever
  -- join, because this runs rarely and being obviously correct matters
  -- more than being short.
  update public.mentorships m
  set student_user_id = u.id
  from auth.users u
  where m.student_user_id is null
    and m.student_email is not null
    and lower(u.email) = lower(m.student_email)
    and (p_id is null or m.id = p_id);

  update public.mentorships m
  set mentor_user_id = u.id
  from auth.users u
  where m.mentor_user_id is null
    and m.mentor_email is not null
    and lower(u.email) = lower(m.mentor_email)
    and (p_id is null or m.id = p_id);

  select count(*)::integer into v_n
  from public.mentorships
  where (p_id is null or id = p_id)
    and student_user_id is not null
    and mentor_user_id is not null;

  return v_n;
end;
$$;

grant execute on function public.fg_link_mentorship_accounts(uuid) to authenticated;

-- A match with no linked accounts cannot be activated, because neither
-- party could read it. This is checked in fg_activate_mentorship below.


-- ---------------------------------------------------------------------
-- PART 2 - THE MENTOR ROLE
-- ---------------------------------------------------------------------
-- The narrow counterpart to migration 06's fg_self_provision_role.
-- A signed-in user may claim the 'mentor' role only when an admin has
-- already approved a mentor application for their exact email address.
-- The approval is the human decision; this just delivers its effect.

create or replace function public.fg_claim_mentor_role()
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

  -- The gate: an approved mentor application on this address.
  if not exists (
    select 1 from public.portal_requests
    where type = 'mentor' and status = 'active'
      and lower(email) = lower(v_email)
  ) then
    return null;
  end if;

  v_name := coalesce(
    (select name from public.portal_requests
      where type = 'mentor' and lower(email) = lower(v_email)
      order by created_at desc limit 1),
    auth.jwt() -> 'user_metadata' ->> 'name');

  -- Does nothing on conflict, so this can never overwrite an existing
  -- role - an admin who is also an approved mentor stays an admin.
  insert into public.user_roles (user_id, role, full_name)
  values (auth.uid(), 'mentor', v_name)
  on conflict (user_id) do nothing;

  select role into v_role from public.user_roles where user_id = auth.uid();

  -- Newly linked account may complete a match that was waiting on it.
  update public.mentorships
  set mentor_user_id = auth.uid()
  where mentor_user_id is null and lower(mentor_email) = lower(v_email);

  return v_role;
end;
$$;

grant execute on function public.fg_claim_mentor_role() to authenticated;

-- Same courtesy for students, who do self-provision but may have been
-- matched before they ever created an account.
create or replace function public.fg_link_own_mentorships()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_n integer := 0;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then return 0; end if;

  update public.mentorships
  set student_user_id = auth.uid()
  where student_user_id is null and lower(student_email) = lower(v_email);
  get diagnostics v_n = row_count;

  return v_n;
end;
$$;

grant execute on function public.fg_link_own_mentorships() to authenticated;


-- ---------------------------------------------------------------------
-- PART 3 - MENTOR CONDUCT ATTESTATION
-- ---------------------------------------------------------------------
-- Migration 07 put mentor_attested_at on mentorships, which only an
-- admin can write. That left the mentor portal unable to record the
-- mentor's own signature. This lets a mentor attest for themselves -
-- and only for themselves, on their own matches.

-- Signing is recorded per person, not per match, so a mentor carrying
-- three students is asked once rather than three times.
create table if not exists public.mentor_attestations (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  policy_version text not null,
  signed_at      timestamptz not null default now()
);

alter table public.mentor_attestations enable row level security;

drop policy if exists "mentor_attestations_self" on public.mentor_attestations;
create policy "mentor_attestations_self" on public.mentor_attestations
  for select to authenticated
  using (user_id = auth.uid() or public.fg_is_admin());

create or replace function public.fg_attest_conduct_policy(p_version text default '2026-01')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer := 0;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  update public.mentorships
  set mentor_attested_at = now()
  where mentor_user_id = auth.uid()
    and mentor_attested_at is null;
  get diagnostics v_n = row_count;

  -- Recorded even with no matches yet, so a mentor who signs before
  -- being matched is not asked again. fg_create_mentorship reads this.
  insert into public.mentor_attestations (user_id, policy_version, signed_at)
  values (auth.uid(), p_version, now())
  on conflict (user_id) do update set policy_version = excluded.policy_version,
                                      signed_at      = excluded.signed_at;
  return v_n;
end;
$$;

grant execute on function public.fg_attest_conduct_policy(text) to authenticated;

-- A match created for a mentor who already attested inherits it, so the
-- mentor is not asked to sign the same policy once per student.
create or replace function public.fg_inherit_attestation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.mentor_attested_at is null and new.mentor_user_id is not null then
    select signed_at into new.mentor_attested_at
    from public.mentor_attestations where user_id = new.mentor_user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists mentorships_inherit_attestation on public.mentorships;
create trigger mentorships_inherit_attestation before insert or update on public.mentorships
  for each row execute function public.fg_inherit_attestation();


-- ---------------------------------------------------------------------
-- PART 4 - CONSENT TOKENS
-- ---------------------------------------------------------------------

alter table public.guardian_consents
  add column if not exists token uuid not null default gen_random_uuid();
alter table public.guardian_consents
  add column if not exists token_expires_at timestamptz not null default (now() + interval '30 days');
alter table public.guardian_consents
  add column if not exists sent_at timestamptz;
alter table public.guardian_consents
  add column if not exists student_grade text;
alter table public.guardian_consents
  add column if not exists mentor_name text;

create unique index if not exists guardian_consents_token_idx
  on public.guardian_consents (token);

comment on column public.guardian_consents.token is
  'Single-purpose secret in the signing link. Unguessable, expires, and scoped to exactly one consent row.';

-- ── Lookup ───────────────────────────────────────────────────────────
-- Returns only what the signing page has to render. Deliberately does
-- not return the student's email, the guardian's phone, or anything
-- about any other record, so a leaked token discloses the minimum.

create or replace function public.fg_consent_lookup(p_token uuid)
returns table (
  student_name    text,
  student_grade   text,
  guardian_name   text,
  mentor_name     text,
  policy_version  text,
  consent_text    text,
  signed_at       timestamptz,
  revoked_at      timestamptz,
  expired         boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.student_name,
         c.student_grade,
         c.guardian_name,
         c.mentor_name,
         c.policy_version,
         c.consent_text,
         c.signed_at,
         c.revoked_at,
         (c.token_expires_at < now()) as expired
  from public.guardian_consents c
  where c.token = p_token;
$$;

grant execute on function public.fg_consent_lookup(uuid) to anon, authenticated;

-- ── Sign ─────────────────────────────────────────────────────────────

create or replace function public.fg_consent_sign(
  p_token        uuid,
  p_guardian_name text,
  p_relationship  text,
  p_guardian_phone text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.guardian_consents;
begin
  select * into c from public.guardian_consents where token = p_token;

  if not found                     then return 'INVALID'; end if;
  if c.revoked_at is not null      then return 'REVOKED'; end if;
  if c.signed_at  is not null      then return 'ALREADY_SIGNED'; end if;
  if c.token_expires_at < now()    then return 'EXPIRED'; end if;

  if coalesce(trim(p_guardian_name), '') = '' then
    return 'NAME_REQUIRED';
  end if;

  update public.guardian_consents
  set signed_at      = now(),
      guardian_name  = trim(p_guardian_name),
      relationship   = coalesce(nullif(trim(p_relationship), ''), relationship),
      guardian_phone = coalesce(nullif(trim(p_guardian_phone), ''), guardian_phone),
      -- Consent is for a school year, not forever. Renewing is a
      -- deliberate act by the guardian, not a silent rollover.
      expires_at     = coalesce(expires_at, now() + interval '1 year')
  where token = p_token;

  return 'OK';
end;
$$;

grant execute on function public.fg_consent_sign(uuid, text, text, text) to anon, authenticated;

-- ── Revoke ───────────────────────────────────────────────────────────
-- Intentionally easier than signing: it works after signing, it does
-- not expire with the token, and it needs no reason. The trigger from
-- migration 07 pauses any live channel the moment this lands.

create or replace function public.fg_consent_revoke(p_token uuid, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.guardian_consents;
begin
  select * into c from public.guardian_consents where token = p_token;
  if not found                then return 'INVALID'; end if;
  if c.revoked_at is not null then return 'OK';      end if;

  update public.guardian_consents
  set revoked_at     = now(),
      revoked_reason = coalesce(nullif(trim(p_reason), ''), 'Withdrawn by guardian')
  where token = p_token;

  return 'OK';
end;
$$;

grant execute on function public.fg_consent_revoke(uuid, text) to anon, authenticated;

-- ── Admin: create a consent request ──────────────────────────────────

create or replace function public.fg_request_consent(
  p_student_request_id uuid,
  p_guardian_name  text,
  p_guardian_email text,
  p_mentor_name    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student record;
  v_id uuid;
begin
  if not public.fg_is_admin() then
    raise exception 'Only an admin can request guardian consent';
  end if;

  select * into v_student from public.portal_requests
   where id = p_student_request_id and type = 'student_mentor_request';
  if not found then raise exception 'Student request not found'; end if;

  -- Reuse a live unsigned request for the same student rather than
  -- minting a second token, so a guardian who was emailed twice does
  -- not end up with two links that disagree.
  select id into v_id from public.guardian_consents
  where lower(student_email) = lower(coalesce(v_student.email,''))
    and signed_at is null and revoked_at is null and token_expires_at > now()
  limit 1;

  if v_id is not null then
    update public.guardian_consents
    set guardian_name  = p_guardian_name,
        guardian_email = p_guardian_email,
        mentor_name    = coalesce(p_mentor_name, mentor_name),
        sent_at        = now()
    where id = v_id;
    return v_id;
  end if;

  insert into public.guardian_consents (
    student_name, student_email, student_grade,
    guardian_name, guardian_email, mentor_name, sent_at
  ) values (
    v_student.name, v_student.email, v_student.data ->> 'grade',
    p_guardian_name, p_guardian_email, p_mentor_name, now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.fg_request_consent(uuid, text, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- PART 5 - MATCH CREATION, CORRECTED
-- ---------------------------------------------------------------------
-- Same contract as migration 07, with the account linking that was
-- missing. Replacing the whole function rather than patching around it,
-- so there is one definition to read.

create or replace function public.fg_create_mentorship(
  p_student_request_id uuid,
  p_mentor_request_id  uuid,
  p_score              integer default null,
  p_reasons            jsonb   default '[]'::jsonb,
  p_supervising_teacher uuid   default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student  record;
  v_mentor   record;
  v_consent  public.guardian_consents;
  v_suid     uuid;
  v_muid     uuid;
  v_id       uuid;
begin
  if not public.fg_is_admin() then
    raise exception 'Only an admin can create a mentorship';
  end if;

  select * into v_student from public.portal_requests
   where id = p_student_request_id and type = 'student_mentor_request';
  if not found then raise exception 'Student request not found'; end if;

  select * into v_mentor from public.portal_requests
   where id = p_mentor_request_id and type = 'mentor';
  if not found then raise exception 'Mentor request not found'; end if;

  if v_mentor.status <> 'active' then
    raise exception 'Mentor % is not approved (status: %)', v_mentor.name, v_mentor.status;
  end if;

  -- Resolve both accounts up front. Null is allowed here - the person
  -- may not have signed up yet - but fg_activate_mentorship refuses to
  -- open a channel until both are resolved, because a channel neither
  -- party can read is not a channel.
  select id into v_suid from auth.users where lower(email) = lower(coalesce(v_student.email,''));
  select id into v_muid from auth.users where lower(email) = lower(coalesce(v_mentor.email,''));

  select c.* into v_consent
  from public.guardian_consents c
  where public.fg_consent_is_valid(c)
    and v_student.email is not null
    and lower(c.student_email) = lower(v_student.email)
  order by c.signed_at desc
  limit 1;

  insert into public.mentorships (
    student_name, student_email, mentor_name, mentor_email,
    student_user_id, mentor_user_id,
    school, topic, field, format,
    status, student_request_id, mentor_request_id, consent_id,
    match_score, match_reasons, matched_by,
    supervising_teacher_id, started_at
  ) values (
    v_student.name, v_student.email, v_mentor.name, v_mentor.email,
    v_suid, v_muid,
    v_student.school,
    coalesce(v_student.data ->> 'title', v_student.data ->> 'desc'),
    coalesce((public.fg_text_array(v_student.data -> 'topics'))[1], v_mentor.data ->> 'field'),
    coalesce(v_student.data ->> 'format', 'Either works'),
    'pending',
    p_student_request_id, p_mentor_request_id, v_consent.id,
    p_score, coalesce(p_reasons, '[]'::jsonb), auth.uid(),
    p_supervising_teacher, current_date
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.fg_create_mentorship(uuid, uuid, integer, jsonb, uuid) to authenticated;


-- ---------------------------------------------------------------------
-- PART 6 - ACTIVATION, CORRECTED
-- ---------------------------------------------------------------------
-- Adds the two checks migration 07 could not make: both accounts must
-- exist, and the consent lookup is re-run at activation time rather
-- than trusting whatever was attached at match time.

create or replace function public.fg_activate_mentorship(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.mentorships;
  c public.guardian_consents;
  v_missing text[] := '{}';
begin
  if not public.fg_is_admin() then
    raise exception 'Only an admin can open a mentoring channel';
  end if;

  select * into m from public.mentorships where id = p_id;
  if not found then raise exception 'Mentorship not found'; end if;

  -- Late-binding: someone may have signed up since the match was made.
  perform public.fg_link_mentorship_accounts(p_id);
  select * into m from public.mentorships where id = p_id;

  -- Consent may have been signed after the match was created, so look
  -- again rather than trusting the id attached at match time.
  if m.consent_id is null and m.student_email is not null then
    select gc.* into c from public.guardian_consents gc
    where public.fg_consent_is_valid(gc)
      and lower(gc.student_email) = lower(m.student_email)
    order by gc.signed_at desc limit 1;
    if c.id is not null then
      update public.mentorships set consent_id = c.id where id = p_id;
      m.consent_id := c.id;
    end if;
  else
    select * into c from public.guardian_consents where id = m.consent_id;
  end if;

  if m.student_user_id is null then
    v_missing := v_missing || 'the student has not created an account yet';
  end if;
  if m.mentor_user_id is null then
    v_missing := v_missing || 'the mentor has not created an account yet';
  end if;
  if m.mentor_attested_at is null then
    v_missing := v_missing || 'mentor has not signed the conduct policy';
  end if;
  if not m.background_check_on_file then
    v_missing := v_missing || 'no background check on file';
  end if;
  if c.id is null then
    v_missing := v_missing || 'no guardian consent on file';
  elsif not public.fg_consent_is_valid(c) then
    v_missing := v_missing || 'guardian consent is expired or revoked';
  end if;

  if array_length(v_missing, 1) is not null then
    return 'BLOCKED: ' || array_to_string(v_missing, '; ');
  end if;

  update public.mentorships
  set status = 'active', closed_reason = null
  where id = p_id;

  return 'OK';
end;
$$;

grant execute on function public.fg_activate_mentorship(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- PART 7 - ADMIN GATE CONTROLS
-- ---------------------------------------------------------------------
-- Recording a background check is a deliberate, attributable act. It
-- takes a reference so the row says which check, run by whom, not just
-- that a box was ticked.

create or replace function public.fg_record_background_check(
  p_mentorship_id uuid,
  p_reference     text,
  p_on_file       boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.fg_is_admin() then
    raise exception 'Only an admin can record a background check';
  end if;
  if p_on_file and coalesce(trim(p_reference), '') = '' then
    raise exception 'A background check needs a reference - which check, run when, by whom';
  end if;

  update public.mentorships
  set background_check_on_file = p_on_file,
      match_reasons = match_reasons || jsonb_build_object(
        'background_check', jsonb_build_object(
          'reference',   p_reference,
          'recorded_by', auth.uid(),
          'recorded_at', now()
        ))
  where id = p_mentorship_id;
end;
$$;

grant execute on function public.fg_record_background_check(uuid, text, boolean) to authenticated;


-- ---------------------------------------------------------------------
-- PART 8 - WHAT AN ADMIN STILL HAS TO DO
-- ---------------------------------------------------------------------
create or replace view public.fg_mentorship_readiness as
select
  m.id,
  m.student_name,
  m.mentor_name,
  m.status,
  (m.student_user_id     is not null) as student_account,
  (m.mentor_user_id      is not null) as mentor_account,
  (m.mentor_attested_at  is not null) as policy_signed,
  m.background_check_on_file          as background_check,
  (c.id is not null and public.fg_consent_is_valid(c)) as consent_valid,
  (m.supervising_teacher_id is not null) as teacher_assigned,
  c.signed_at   as consent_signed_at,
  c.guardian_email
from public.mentorships m
left join public.guardian_consents c on c.id = m.consent_id
where m.status in ('pending', 'paused');

comment on view public.fg_mentorship_readiness is
  'Every match not yet open, and exactly which gate is holding it up.';


do $$
begin
  raise notice '─────────────────────────────────────────────────';
  raise notice 'Migration 08 applied.';
  raise notice '';
  raise notice 'Fixed: matches now link to auth accounts, so both';
  raise notice '  parties can actually see their own thread.';
  raise notice 'Fixed: approved mentors can claim the mentor role';
  raise notice '  on first sign-in (fg_claim_mentor_role).';
  raise notice 'Added: guardian consent signing at /consent.html?t=<token>';
  raise notice '';
  raise notice 'Query public.fg_mentorship_readiness to see which';
  raise notice 'gate is holding up each pending match.';
  raise notice '─────────────────────────────────────────────────';
end $$;

-- =====================================================================
-- END MIGRATION 08
-- =====================================================================
