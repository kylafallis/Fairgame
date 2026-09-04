-- =====================================================================
-- FairGame Initiative
-- Migration 08: Mentor functions - BEHAVIOUR ONLY
-- Run after 07. Safe to run more than once, at any time.
-- =====================================================================
--
-- WHAT THIS FILE IS
--
--   Every function a person or the website calls directly: matching,
--   creating and opening a match, guardian consent signing, the mentor
--   role claim, attestation, and the admin gate controls.
--
--   It contains no create table, no alter table, no insert, no update
--   and no delete outside a function body. It is "create or replace
--   function" and "grant" from top to bottom, so running it cannot
--   change a single row. If you are ever unsure whether it applied,
--   just run it again.
--
-- IF YOU RUN IT BEFORE 07
--
--   The guard immediately below stops with a plain message instead of
--   failing somewhere in the middle. That is the whole reason the two
--   files are split this way.
-- =====================================================================


do $$
begin
  if to_regclass('public.guardian_consents') is null
     or to_regclass('public.mentor_messages') is null
     or to_regclass('public.mentor_attestations') is null then
    raise exception
      'Migration 08 needs migration 07 first. Run 07_mentor_schema.sql, then this file.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mentorships'
      and column_name = 'student_user_id'
  ) then
    raise exception
      'public.mentorships is missing its new columns. Re-run 07_mentor_schema.sql first.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- PART 1 - ACCOUNT LINKING
-- ---------------------------------------------------------------------
-- portal_requests and the mentorships table identify people by email.
-- auth.users is the only place an id exists. These resolve one to the
-- other, and are written to be run repeatedly - somebody who creates
-- their account a week after being matched gets linked on the next run.

create or replace function public.fg_link_mentorship_accounts(p_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ready integer;
begin
  if not public.fg_is_admin() then
    raise exception 'Only an admin can link mentorship accounts';
  end if;

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

  select count(*)::integer into v_ready
  from public.mentorships
  where (p_id is null or id = p_id)
    and student_user_id is not null
    and mentor_user_id is not null;

  return v_ready;
end;
$$;

grant execute on function public.fg_link_mentorship_accounts(uuid) to authenticated;

-- The self-serve half: a student who signs up after being matched
-- claims their own side without needing an admin to notice.
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
-- PART 2 - THE MENTOR ROLE
-- ---------------------------------------------------------------------
-- The narrow counterpart to migration 06's fg_self_provision_role. A
-- signed-in user may claim 'mentor' only when an admin has already
-- approved a mentor application for their exact email address. The
-- approval is the human decision; this only delivers its effect, so an
-- approved mentor is not stuck at the login page waiting for someone
-- to run a query by hand.

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

  -- The gate.
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

  -- Does nothing on conflict, so this can never overwrite a role that
  -- is already on file. An admin who also mentors stays an admin.
  insert into public.user_roles (user_id, role, full_name)
  values (auth.uid(), 'mentor', v_name)
  on conflict (user_id) do nothing;

  select role into v_role from public.user_roles where user_id = auth.uid();

  -- A brand new account may complete a match that was waiting on it.
  update public.mentorships
  set mentor_user_id = auth.uid()
  where mentor_user_id is null and lower(mentor_email) = lower(v_email);

  return v_role;
end;
$$;

grant execute on function public.fg_claim_mentor_role() to authenticated;


-- ---------------------------------------------------------------------
-- PART 3 - CONDUCT ATTESTATION
-- ---------------------------------------------------------------------
-- mentorships is admin-write-only, so a mentor cannot stamp their own
-- signature there directly. This does it for them, only for themselves.

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

  insert into public.mentor_attestations (user_id, policy_version, signed_at)
  values (auth.uid(), p_version, now())
  on conflict (user_id) do update
    set policy_version = excluded.policy_version,
        signed_at      = excluded.signed_at;

  update public.mentorships
  set mentor_attested_at = now()
  where mentor_user_id = auth.uid()
    and mentor_attested_at is null;
  get diagnostics v_n = row_count;

  return v_n;
end;
$$;

grant execute on function public.fg_attest_conduct_policy(text) to authenticated;

-- A match created for a mentor who has already signed inherits it, so
-- nobody is asked to sign the same policy once per student.
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
-- PART 4 - GUARDIAN CONSENT SIGNING
-- ---------------------------------------------------------------------
-- A guardian is not a user of this platform and should not have to
-- become one to say yes. These three are the only things an anonymous
-- caller may reach. Each is security definer and deliberately narrow,
-- and each is scoped to the single row named by the token.

-- ── Lookup ───────────────────────────────────────────────────────────
-- Returns only what the signing page has to render. It does not return
-- the student's email, the guardian's phone, or anything at all about
-- any other record, so a leaked link discloses the least possible.

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
  select c.student_name, c.student_grade, c.guardian_name, c.mentor_name,
         c.policy_version, c.consent_text, c.signed_at, c.revoked_at,
         (c.token_expires_at < now()) as expired
  from public.guardian_consents c
  where c.token = p_token;
$$;

grant execute on function public.fg_consent_lookup(uuid) to anon, authenticated;

-- ── Sign ─────────────────────────────────────────────────────────────

create or replace function public.fg_consent_sign(
  p_token          uuid,
  p_guardian_name  text,
  p_relationship   text,
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

  if not found                  then return 'INVALID';        end if;
  if c.revoked_at is not null   then return 'REVOKED';        end if;
  if c.signed_at  is not null   then return 'ALREADY_SIGNED'; end if;
  if c.token_expires_at < now() then return 'EXPIRED';        end if;

  if coalesce(trim(p_guardian_name), '') = '' then
    return 'NAME_REQUIRED';
  end if;

  update public.guardian_consents
  set signed_at      = now(),
      guardian_name  = trim(p_guardian_name),
      relationship   = coalesce(nullif(trim(p_relationship), ''), relationship),
      guardian_phone = coalesce(nullif(trim(p_guardian_phone), ''), guardian_phone),
      -- A school year, not forever. Renewing is a deliberate act.
      expires_at     = coalesce(expires_at, now() + interval '1 year')
  where token = p_token;

  return 'OK';
end;
$$;

grant execute on function public.fg_consent_sign(uuid, text, text, text) to anon, authenticated;

-- ── Revoke ───────────────────────────────────────────────────────────
-- Intentionally easier than signing: it works after signing, it does
-- not expire with the token, and it needs no reason. Making withdrawal
-- harder than permission would be indefensible. The trigger from 07
-- pauses any live channel the instant this lands.

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

-- ── Admin: raise a consent request ───────────────────────────────────

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
  -- minting a second token, so a guardian emailed twice does not end up
  -- holding two links that disagree with each other.
  select id into v_id from public.guardian_consents
  where lower(student_email) = lower(coalesce(v_student.email, ''))
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
-- PART 5 - THE MATCHER
-- ---------------------------------------------------------------------
-- Reads both sides out of portal_requests and ranks mentors for one
-- student request, returning the reason behind every point awarded.
-- The admin screen shows those reasons, because a score with no
-- explanation is not something a person can be accountable for.

create or replace function public.fg_suggest_mentor_matches(
  p_student_request_id uuid,
  p_limit integer default 10
)
returns table (
  mentor_request_id uuid,
  mentor_name       text,
  mentor_email      text,
  mentor_field      text,
  mentor_format     text,
  mentor_hours      text,
  mentor_bio        text,
  active_mentees    integer,
  score             integer,
  reasons           jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_student record;
  v_topics  text[];
  v_format  text;
begin
  if not public.fg_is_admin() then
    raise exception 'Only an admin can run mentor matching';
  end if;

  select * into v_student
  from public.portal_requests
  where id = p_student_request_id and type = 'student_mentor_request';

  if not found then
    raise exception 'No student mentor request with id %', p_student_request_id;
  end if;

  v_topics := public.fg_text_array(v_student.data -> 'topics');
  v_format := coalesce(v_student.data ->> 'format', '');

  return query
  with mentor_load as (
    select m2.mentor_email as email, count(*)::integer as n
    from public.mentorships m2
    where m2.status = 'active' and m2.mentor_email is not null
    group by m2.mentor_email
  ),
  scored as (
    select
      m.id    as mentor_request_id,
      m.name  as mentor_name,
      m.email as mentor_email,
      (m.data ->> 'field')  as mentor_field,
      (m.data ->> 'format') as mentor_format,
      (m.data ->> 'hours')  as mentor_hours,
      (m.data ->> 'bio')    as mentor_bio,
      coalesce(l.n, 0)      as active_mentees,

      -- ── Field overlap: the substance of the match ─────────────────
      (case
        when v_topics is null or array_length(v_topics, 1) is null then 0
        when exists (
          select 1 from unnest(v_topics) t
          where lower(coalesce(m.data ->> 'field','')) = lower(t)
        ) then 50
        when exists (
          -- Partial credit for a shared discipline: "Biology / Life
          -- Sciences" against "Biology" should not score zero.
          select 1 from unnest(v_topics) t
          where lower(coalesce(m.data ->> 'field','')) like '%' || lower(split_part(t, ' / ', 1)) || '%'
             or lower(split_part(t, ' / ', 1)) like '%' || lower(split_part(coalesce(m.data ->> 'field',''), ' / ', 1)) || '%'
        ) then 30
        else 0
      end)

      -- ── Format: an in-person-only student and a virtual-only mentor
      --    is not a match however well the fields line up.
      + (case
          when v_format = '' or coalesce(m.data ->> 'format','') = '' then 5
          when v_format = 'Either works' or (m.data ->> 'format') = 'Either works' then 15
          when v_format = (m.data ->> 'format') then 20
          else 0
        end)

      -- ── Location is deliberately not scored. The mentor volunteer
      --    form does not collect one - its 'school' column holds the
      --    applicant's job title. Rather than compare a job title to a
      --    state name and call the noise a signal, in-person fit is
      --    left entirely to the format rule above. Add a location field
      --    to the mentor form and this becomes worth revisiting.

      -- ── Capacity: spread the load. A mentor already carrying three
      --    students is a worse choice than an equally qualified one
      --    carrying none.
      + (case
          when coalesce(l.n, 0) = 0 then 15
          when coalesce(l.n, 0) = 1 then 10
          when coalesce(l.n, 0) = 2 then 4
          else 0
        end)
      as score,

      -- jsonb_strip_nulls only strips nulls from objects, not arrays, so
      -- an unearned reason would survive as a json null and render as an
      -- empty chip. Aggregating over unnest with a null filter is the
      -- construct that actually drops them.
      (select coalesce(jsonb_agg(v), '[]'::jsonb)
       from unnest(array[
        case
          when exists (select 1 from unnest(v_topics) t where lower(coalesce(m.data ->> 'field','')) = lower(t))
            then 'Exact field match: ' || coalesce(m.data ->> 'field','')
          when exists (
            select 1 from unnest(v_topics) t
            where lower(coalesce(m.data ->> 'field','')) like '%' || lower(split_part(t, ' / ', 1)) || '%'
          ) then 'Related field: ' || coalesce(m.data ->> 'field','')
          else null
        end,
        case
          when v_format = (m.data ->> 'format') then 'Both prefer ' || v_format
          when v_format = 'Either works' or (m.data ->> 'format') = 'Either works' then 'Format is flexible'
          when v_format <> '' and coalesce(m.data ->> 'format','') <> ''
            then 'FORMAT MISMATCH: student wants ' || v_format || ', mentor offers ' || (m.data ->> 'format')
          else null
        end,
        case
          when coalesce(l.n, 0) = 0 then 'No current mentees'
          when coalesce(l.n, 0) >= 3 then 'Already mentoring ' || l.n || ' students'
          else 'Mentoring ' || l.n || ' student(s)'
        end
       ]) as v
       where v is not null) as reasons

    from public.portal_requests m
    left join mentor_load l on lower(l.email) = lower(m.email)
    where m.type = 'mentor'
      and m.status = 'active'        -- approved mentors only
      -- Never re-suggest a mentor this student is already paired with.
      and not exists (
        select 1 from public.mentorships x
        where lower(coalesce(x.mentor_email,'')) = lower(m.email)
          and lower(coalesce(x.student_email,'')) = lower(coalesce(v_student.email,''))
          and x.status in ('pending','active')
      )
  )
  select s.mentor_request_id, s.mentor_name, s.mentor_email, s.mentor_field,
         s.mentor_format, s.mentor_hours, s.mentor_bio, s.active_mentees,
         s.score, s.reasons
  from scored s
  where s.score > 0
  order by s.score desc, s.active_mentees asc, s.mentor_name
  limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.fg_suggest_mentor_matches(uuid, integer) to authenticated;


-- ---------------------------------------------------------------------
-- PART 6 - CREATING A MATCH
-- ---------------------------------------------------------------------
-- Creates the pair from both application rows and resolves both
-- accounts. It always lands as 'pending' - creating a match and letting
-- two people talk are deliberately not the same action.

create or replace function public.fg_create_mentorship(
  p_student_request_id  uuid,
  p_mentor_request_id   uuid,
  p_score               integer default null,
  p_reasons             jsonb   default '[]'::jsonb,
  p_supervising_teacher uuid    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student record;
  v_mentor  record;
  v_consent public.guardian_consents;
  v_suid    uuid;
  v_muid    uuid;
  v_id      uuid;
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

  -- Resolve both accounts now. Null is allowed - the person may not
  -- have signed up yet - but fg_activate_mentorship refuses to open a
  -- channel until both are resolved, because a channel neither party
  -- can read is not a channel.
  select id into v_suid from auth.users where lower(email) = lower(coalesce(v_student.email, ''));
  select id into v_muid from auth.users where lower(email) = lower(coalesce(v_mentor.email, ''));

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
-- PART 7 - OPENING THE CHANNEL
-- ---------------------------------------------------------------------
-- Re-checks every gate from scratch rather than trusting what was
-- attached at match time, because consent may have been signed and
-- accounts created in the days since.

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

  -- Late binding: someone may have signed up since the match was made.
  perform public.fg_link_mentorship_accounts(p_id);
  select * into m from public.mentorships where id = p_id;

  -- Consent may have been signed after the match was created, so look
  -- again rather than trusting the id attached at the time.
  if m.consent_id is null and m.student_email is not null then
    select gc.* into c from public.guardian_consents gc
    where public.fg_consent_is_valid(gc)
      and lower(gc.student_email) = lower(m.student_email)
    order by gc.signed_at desc limit 1;
    if c.id is not null then
      update public.mentorships set consent_id = c.id where id = p_id;
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
    v_missing := v_missing || 'guardian consent is expired or withdrawn';
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
-- PART 8 - ADMIN GATE CONTROLS
-- ---------------------------------------------------------------------
-- Recording a background check is a deliberate, attributable act. It
-- takes a reference so the row says which check, run by whom - not
-- merely that somebody ticked a box.

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
-- PART 9 - WHAT IS HOLDING EACH MATCH UP
-- ---------------------------------------------------------------------

create or replace view public.fg_mentorship_readiness as
select
  m.id,
  m.student_name,
  m.mentor_name,
  m.status,
  (m.student_user_id       is not null) as student_account,
  (m.mentor_user_id        is not null) as mentor_account,
  (m.mentor_attested_at    is not null) as policy_signed,
  m.background_check_on_file            as background_check,
  (c.id is not null and public.fg_consent_is_valid(c)) as consent_valid,
  (m.supervising_teacher_id is not null) as teacher_assigned,
  c.signed_at     as consent_signed_at,
  c.guardian_email
from public.mentorships m
left join public.guardian_consents c on c.id = m.consent_id
where public.fg_is_admin()
  and m.status in ('pending', 'paused');

comment on view public.fg_mentorship_readiness is
  'Every match not yet open, and exactly which gate is holding it up.';

-- The review queue: what an admin should look at, worst first.
create or replace view public.fg_message_review_queue as
select
  msg.id,
  msg.mentorship_id,
  msg.created_at,
  msg.sender_role,
  msg.sender_name,
  msg.body,
  msg.flag_reasons,
  m.student_name,
  m.mentor_name,
  m.school,
  -- Safeguarding language outranks a shared phone number, and an adult
  -- sending it outranks a student sending the same thing.
  (case when msg.flag_reasons ?| array['secrecy_language','in_person_meeting'] then 3
        when msg.flag_reasons ?  'off_platform_contact' then 2
        else 1 end)
  + (case when msg.sender_role = 'mentor' then 1 else 0 end) as severity
from public.mentor_messages msg
join public.mentorships m on m.id = msg.mentorship_id
-- A view runs as its owner and does not inherit row level security from
-- the tables underneath, so it has to gate itself.
where public.fg_is_admin()
  and msg.flagged and msg.reviewed_at is null;

comment on view public.fg_message_review_queue is
  'Unreviewed flagged messages. Adult-sent safeguarding flags rank above everything else.';


-- ---------------------------------------------------------------------
-- PART 10 - REPORT BACK
-- ---------------------------------------------------------------------
do $$
declare
  v_admins  integer;
  v_mentors integer;
  v_pending integer;
begin
  select count(*) into v_admins  from public.user_roles where role = 'admin';
  select count(*) into v_mentors from public.portal_requests where type = 'mentor' and status = 'active';
  select count(*) into v_pending from public.portal_requests where type = 'student_mentor_request' and status in ('pending','active');

  raise notice '';
  raise notice '─────────────────────────────────────────────────';
  raise notice 'Migration 08 applied. No rows were changed.';
  raise notice '';
  raise notice 'Approved mentors available to match: %', v_mentors;
  raise notice 'Student requests waiting:            %', v_pending;
  raise notice '';

  if v_admins = 0 then
    raise notice '  ACTION NEEDED - no admin role on file. Every';
    raise notice '  function above starts with an admin check, so';
    raise notice '  matching will refuse until you add one.';
  else
    raise notice 'Next: open /mentorlog.html and press Find a Match.';
  end if;

  raise notice '─────────────────────────────────────────────────';
end $$;

-- =====================================================================
-- END MIGRATION 08
-- =====================================================================
