-- =====================================================================
-- FairGame Initiative
-- Migration 07: Mentor matching and supervised messaging
-- Run after 01-06. Safe to run more than once.
-- =====================================================================
--
-- WHY THIS EXISTS
--
--   1. The portal has been reading public.mentorships and
--      public.mentorship_sessions since the mentor log was built, and
--      neither table has ever existed. Every mentor screen either sat on
--      a spinner or quietly rendered as empty. This creates them.
--
--   2. Matching was manual retyping. A mentor applies through the
--      volunteer form and a student applies through the mentor request
--      form; both land in portal_requests with nothing joining them, so
--      an admin read two lists side by side and typed names into a
--      third screen. fg_suggest_mentor_matches does that comparison in
--      the database and returns ranked candidates with the reason for
--      each score.
--
--   3. Students here are minors. A platform that introduces an adult to
--      a minor and then looks away is the thing that gets an
--      organization sued. The design below is built on one idea: every
--      exchange between a mentor and a student is on the record, and
--      FairGame holds the record.
--
-- THE SAFETY MODEL
--
--   A mentoring channel cannot open until four independent gates pass,
--   and the gates live in the database, not in the UI:
--
--     Gate 1  The mentor's portal_requests row is type 'mentor' and
--             status 'active' - a human reviewed and approved them.
--     Gate 2  The mentor has attested to the conduct policy
--             (mentor_attested_at) and to a background check
--             (background_check_on_file).
--     Gate 3  A guardian consent row exists for the student, is signed,
--             and is not revoked or expired.
--     Gate 4  An admin created the match. Neither party can self-serve
--             their way into a channel with the other.
--
--   Once open, the channel has these properties:
--
--     - Messages are insert-only. No participant can edit or delete
--       one. An altered record is worthless in an incident review, so
--       the database refuses the alteration.
--     - Every message is readable by FairGame admins and by the
--       student's supervising teacher. Both parties are told this, and
--       the UI repeats it above the compose box. There is no private
--       channel to a minor on this platform.
--     - Outbound contact details - phone numbers, email addresses,
--       social handles, meeting links - are detected on write and
--       flagged for review. The message still sends; a mentor asking a
--       student to move to text message is exactly the signal a
--       reviewer needs to see, so it is recorded rather than silently
--       dropped.
--     - Revoking guardian consent closes the channel immediately. The
--       transcript is retained, because deleting the record of a
--       relationship that has just been ended is the opposite of what
--       a safeguarding process needs.
--
--   What this migration deliberately does NOT do: it does not give the
--   mentor the student's email, phone, address, or school schedule.
--   The mentor sees a first name, a grade, a project, and a message
--   thread. Everything else stays with FairGame and the school.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART 0 - THE MENTOR ROLE
-- ---------------------------------------------------------------------
-- Mentors had no role of their own. They were approved in
-- portal_requests and then handed a link to somewhere off-platform,
-- so they never needed to sign in. Supervised messaging requires them
-- to, which requires a role. It is added to the allowed list here.
--
-- 'mentor' is NOT self-provisionable - migration 06 permits only
-- student, ambassador, and teacher through that path. An admin grants
-- this role by hand, after the application is approved.

alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('admin','teacher','ambassador','judge',
                  'fair_manager','student','parent','mentor','inactive'));


-- ---------------------------------------------------------------------
-- PART 1 - GUARDIAN CONSENT
-- ---------------------------------------------------------------------
-- Consent is its own table rather than a flag on the mentorship,
-- because it has a life of its own: it is granted before a match
-- exists, it can be revoked while a match is running, and it must
-- survive the match it authorized for recordkeeping.

create table if not exists public.guardian_consents (
  id                  uuid primary key default gen_random_uuid(),

  student_user_id     uuid references auth.users(id) on delete set null,
  student_name        text not null,
  student_email       text,

  guardian_name       text not null,
  guardian_email      text not null,
  guardian_phone      text,
  relationship        text,

  -- What was actually agreed to. Storing the version means a consent
  -- given under older terms is visibly distinguishable from a current
  -- one instead of being silently treated as equivalent.
  policy_version      text not null default '2026-01',
  consent_text        text,

  signed_at           timestamptz,
  signed_ip           text,
  -- Consent for a minor is not open-ended. A school year is the
  -- natural boundary; renewing is a deliberate act.
  expires_at          timestamptz,

  revoked_at          timestamptz,
  revoked_reason      text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists guardian_consents_student_idx
  on public.guardian_consents (student_user_id);
create index if not exists guardian_consents_email_idx
  on public.guardian_consents (lower(student_email));

comment on table public.guardian_consents is
  'Signed guardian permission for a student to be mentored. Gate 3 of 4 before a mentoring channel can open.';

-- One predicate, used by every gate that asks "is consent good right
-- now". Defining it once means the answer cannot drift between the
-- matching function, the RLS policies, and the UI.
-- STABLE, not IMMUTABLE: it reads now(). Marked immutable, Postgres
-- would be free to fold the expiry comparison to a constant, and an
-- expired consent could keep reading as valid.
create or replace function public.fg_consent_is_valid(p_consent public.guardian_consents)
returns boolean
language sql
stable
as $$
  select p_consent.signed_at is not null
     and p_consent.revoked_at is null
     and (p_consent.expires_at is null or p_consent.expires_at > now());
$$;

create or replace function public.fg_student_has_consent(p_student_user_id uuid, p_student_email text default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.guardian_consents c
    where public.fg_consent_is_valid(c)
      and (
        (p_student_user_id is not null and c.student_user_id = p_student_user_id)
        or (p_student_email is not null and lower(c.student_email) = lower(p_student_email))
      )
  );
$$;


-- ---------------------------------------------------------------------
-- PART 2 - THE MENTORSHIP
-- ---------------------------------------------------------------------
-- Columns match what mentorlog.js and portal-admin.js already read, so
-- those screens work the moment this runs. The user id columns and the
-- gate columns are the new part.

create table if not exists public.mentorships (
  id                  uuid primary key default gen_random_uuid(),

  -- Denormalized names. The portal renders these directly and a
  -- mentorship has to stay readable after an account is deleted.
  student_name        text not null,
  student_email       text,
  mentor_name         text not null,
  mentor_email        text,

  student_user_id     uuid references auth.users(id) on delete set null,
  mentor_user_id      uuid references auth.users(id) on delete set null,

  -- The teacher who supervises this student. This is who, besides
  -- FairGame staff, can read the thread. Null means no school
  -- supervisor, which the admin UI surfaces as a warning.
  supervising_teacher_id uuid references auth.users(id) on delete set null,

  school              text,
  topic               text,
  field               text,
  format              text,          -- 'Virtual only' | 'In-person (local)' | 'Either works'

  status              text not null default 'pending',

  -- Where each side came from, so a match can be traced back to the
  -- application that produced it.
  student_request_id  uuid,
  mentor_request_id   uuid,
  consent_id          uuid references public.guardian_consents(id) on delete set null,

  -- What the matcher thought at the time. Kept because a human
  -- reviewing a bad match later needs to know what the score was based
  -- on, not just that a score existed.
  match_score         integer,
  match_reasons       jsonb not null default '[]'::jsonb,
  matched_by          uuid references auth.users(id) on delete set null,

  milestones          jsonb not null default '{}'::jsonb,
  total_hours         numeric(6,1) not null default 0,
  session_count       integer not null default 0,
  started_at          date,
  last_session        date,
  closed_at           timestamptz,
  closed_reason       text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.mentorships drop constraint if exists mentorships_status_check;
alter table public.mentorships add constraint mentorships_status_check
  check (status in ('pending','active','paused','completed','closed'));

create index if not exists mentorships_student_idx on public.mentorships (student_user_id);
create index if not exists mentorships_mentor_idx  on public.mentorships (mentor_user_id);
create index if not exists mentorships_teacher_idx on public.mentorships (supervising_teacher_id);
create index if not exists mentorships_status_idx  on public.mentorships (status);

drop trigger if exists mentorships_touch on public.mentorships;
create trigger mentorships_touch before update on public.mentorships
  for each row execute function public.fg_touch_updated_at();

comment on column public.mentorships.status is
  'pending = matched but channel closed. active = consent verified, messaging open. paused/closed = messaging shut, transcript retained.';


-- ---------------------------------------------------------------------
-- PART 3 - SESSION LOG
-- ---------------------------------------------------------------------

create table if not exists public.mentorship_sessions (
  id          uuid primary key default gen_random_uuid(),
  pair_id     uuid not null references public.mentorships(id) on delete cascade,
  date        date not null,
  hours       numeric(4,1) not null default 0,
  notes       text,
  logged_by   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists mentorship_sessions_pair_idx
  on public.mentorship_sessions (pair_id, date desc);

-- Totals maintained here rather than in the browser. The old client
-- did a read-then-write to bump total_hours, which loses a session
-- whenever two people log at once.
create or replace function public.fg_mentorship_recalc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair uuid := coalesce(new.pair_id, old.pair_id);
begin
  update public.mentorships m
  set total_hours   = coalesce(s.hours, 0),
      session_count = coalesce(s.n, 0),
      last_session  = s.last_date
  from (
    select sum(hours) as hours, count(*) as n, max(date) as last_date
    from public.mentorship_sessions where pair_id = v_pair
  ) s
  where m.id = v_pair;
  return null;
end;
$$;

drop trigger if exists mentorship_sessions_recalc on public.mentorship_sessions;
create trigger mentorship_sessions_recalc
  after insert or update or delete on public.mentorship_sessions
  for each row execute function public.fg_mentorship_recalc();


-- ---------------------------------------------------------------------
-- PART 4 - SUPERVISED MESSAGES
-- ---------------------------------------------------------------------

create table if not exists public.mentor_messages (
  id            uuid primary key default gen_random_uuid(),
  mentorship_id uuid not null references public.mentorships(id) on delete cascade,

  sender_id     uuid references auth.users(id) on delete set null,
  sender_role   text not null check (sender_role in ('student','mentor','admin','teacher')),
  sender_name   text,

  body          text not null check (length(trim(body)) > 0 and length(body) <= 8000),

  -- Set by trigger, not by the client. A client-supplied "this is
  -- fine" flag would be worth nothing.
  flagged       boolean not null default false,
  flag_reasons  jsonb   not null default '[]'::jsonb,

  reviewed_at   timestamptz,
  reviewed_by   uuid references auth.users(id) on delete set null,
  review_note   text,

  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists mentor_messages_thread_idx
  on public.mentor_messages (mentorship_id, created_at);
create index if not exists mentor_messages_flagged_idx
  on public.mentor_messages (flagged) where flagged;

comment on table public.mentor_messages is
  'Insert-only transcript of every mentor-student exchange. Readable by both participants, FairGame admins, and the supervising teacher. Never editable or deletable by a participant.';

-- Contact-detail detection. Deliberately blunt: a false positive costs
-- a reviewer ten seconds, a false negative costs a child their safety.
create or replace function public.fg_scan_contact_info(p_body text)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_reasons jsonb := '[]'::jsonb;
  v_norm    text;
begin
  if p_body is null then return v_reasons; end if;

  -- Collapse the usual obfuscations first, so "j dot smith at gmail
  -- dot com" and "five one three..." do not slide past a naive regex.
  v_norm := lower(p_body);
  v_norm := regexp_replace(v_norm, '\s+(at|\(at\)|\[at\])\s+', '@', 'g');
  v_norm := regexp_replace(v_norm, '\s+(dot|\(dot\)|\[dot\])\s+', '.', 'g');

  if v_norm ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then
    v_reasons := v_reasons || '["email_address"]'::jsonb;
  end if;

  -- 7+ digits with common separators, which catches most phone numbers
  -- without firing on years or measurements.
  if v_norm ~ '(\+?\d[\s.-]?){7,}' then
    v_reasons := v_reasons || '["phone_number"]'::jsonb;
  end if;

  if v_norm ~ '(instagram|snapchat|snap|tiktok|discord|whatsapp|telegram|facebook|twitter|venmo|cash ?app)' then
    v_reasons := v_reasons || '["social_platform"]'::jsonb;
  end if;

  if v_norm ~ '(zoom\.us|meet\.google|teams\.microsoft|calendly\.com)' then
    v_reasons := v_reasons || '["external_meeting_link"]'::jsonb;
  end if;

  -- Safeguarding language is scanned separately, by
  -- fg_scan_safeguarding below. This function stays strictly about
  -- contact details so the two lists can be revised independently.

  return v_reasons;
end;
$$;

-- The grooming-language check is kept in its own function so the
-- pattern list can be revised without touching contact detection, and
-- so a reviewer can see plainly what the system is looking for.
create or replace function public.fg_scan_safeguarding(p_body text)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_reasons jsonb := '[]'::jsonb;
  v_norm    text;
begin
  if p_body is null then return v_reasons; end if;
  v_norm := lower(p_body);

  if v_norm ~ '(don''?t tell|do not tell|keep this between|our secret|just between us|delete this|don''?t mention)' then
    v_reasons := v_reasons || '["secrecy_language"]'::jsonb;
  end if;

  if v_norm ~ '(pick you up|drive you|my (house|place|apartment|car)|come over|meet me (at|outside)|alone)' then
    v_reasons := v_reasons || '["in_person_meeting"]'::jsonb;
  end if;

  if v_norm ~ '(text me|call me|dm me|message me on|add me on|off the platform|outside (of )?fairgame)' then
    v_reasons := v_reasons || '["off_platform_contact"]'::jsonb;
  end if;

  return v_reasons;
end;
$$;

create or replace function public.fg_flag_mentor_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reasons jsonb;
begin
  v_reasons := public.fg_scan_contact_info(new.body) || public.fg_scan_safeguarding(new.body);

  -- A student sharing their own contact details with their assigned
  -- mentor is a much smaller concern than an adult soliciting them, but
  -- both are recorded. Only the reason list distinguishes them.
  new.flag_reasons := v_reasons;
  new.flagged      := jsonb_array_length(v_reasons) > 0;

  -- These are set by review, never by the sender.
  new.reviewed_at := null;
  new.reviewed_by := null;
  return new;
end;
$$;

drop trigger if exists mentor_messages_flag on public.mentor_messages;
create trigger mentor_messages_flag before insert on public.mentor_messages
  for each row execute function public.fg_flag_mentor_message();

-- Insert-only, enforced in the database. A participant deleting a
-- message after the fact would destroy the only account of what
-- happened, so the table refuses.
create or replace function public.fg_mentor_messages_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'mentor_messages rows cannot be deleted';
  end if;
  -- Review fields and the read receipt are the only mutable parts.
  if new.body          is distinct from old.body
     or new.sender_id  is distinct from old.sender_id
     or new.mentorship_id is distinct from old.mentorship_id
     or new.created_at is distinct from old.created_at then
    raise exception 'mentor_messages content cannot be edited';
  end if;
  return new;
end;
$$;

drop trigger if exists mentor_messages_immutable on public.mentor_messages;
create trigger mentor_messages_immutable before update or delete on public.mentor_messages
  for each row execute function public.fg_mentor_messages_immutable();


-- ---------------------------------------------------------------------
-- PART 5 - THE FOUR GATES
-- ---------------------------------------------------------------------

alter table public.mentorships
  add column if not exists mentor_attested_at timestamptz;
alter table public.mentorships
  add column if not exists background_check_on_file boolean not null default false;

-- Answers "may these two exchange a message right now". Every read and
-- write policy on mentor_messages routes through this, so the gates
-- cannot be bypassed by hitting the API directly.
create or replace function public.fg_mentorship_channel_open(p_mentorship_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.mentorships m
    left join public.guardian_consents c on c.id = m.consent_id
    where m.id = p_mentorship_id
      and m.status = 'active'                    -- Gate 4: admin activated
      and m.mentor_attested_at is not null       -- Gate 2: conduct policy
      and m.background_check_on_file             -- Gate 2: screening
      and c.id is not null                       -- Gate 3: consent exists
      and public.fg_consent_is_valid(c)          -- Gate 3: still good
  );
$$;

-- Revoking consent must shut the channel without anyone remembering to
-- do it by hand.
create or replace function public.fg_consent_revoked_closes_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.revoked_at is not null and old.revoked_at is null then
    update public.mentorships
    set status = 'paused',
        closed_reason = 'Guardian consent revoked'
    where consent_id = new.id and status = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists guardian_consents_revoke on public.guardian_consents;
create trigger guardian_consents_revoke after update on public.guardian_consents
  for each row execute function public.fg_consent_revoked_closes_channel();

drop trigger if exists guardian_consents_touch on public.guardian_consents;
create trigger guardian_consents_touch before update on public.guardian_consents
  for each row execute function public.fg_touch_updated_at();


-- ---------------------------------------------------------------------
-- PART 6 - THE MATCHER
-- ---------------------------------------------------------------------
-- Reads both sides out of portal_requests and returns ranked mentors
-- for one student request, with the reason for every point awarded.
-- The admin screen shows the reasons, because a score with no
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
  v_student   record;
  v_topics    text[];
  v_format    text;
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
    select mentor_email, count(*)::integer as n
    from public.mentorships
    where status = 'active' and mentor_email is not null
    group by mentor_email
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

      -- ── Field overlap: the substance of the match ────────────────
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

      -- ── Format: an in-person-only student and a virtual-only
      --    mentor is not a match no matter how well the fields line up.
      + (case
          when v_format = '' or coalesce(m.data ->> 'format','') = '' then 5
          when v_format = 'Either works' or (m.data ->> 'format') = 'Either works' then 15
          when v_format = (m.data ->> 'format') then 20
          else 0
        end)

      -- ── Location is deliberately not scored. The mentor volunteer
      --    form does not collect one; its 'school' column holds the
      --    applicant's job title. Rather than score a title against a
      --    state name and call the noise a signal, in-person fit is
      --    left entirely to the format rule above. Add a location
      --    field to the mentor form and this is worth revisiting.

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

      -- jsonb_strip_nulls only strips nulls from OBJECTS, not arrays, so
      -- an unearned reason would survive as a json null and render as an
      -- empty chip on the admin screen. Aggregating over unnest with a
      -- null filter is the construct that actually drops them.
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
          when v_format <> '' and coalesce(m.data ->> 'format','') <> '' then 'FORMAT MISMATCH: student wants ' || v_format || ', mentor offers ' || (m.data ->> 'format')
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
    left join mentor_load l on lower(l.mentor_email) = lower(m.email)
    where m.type = 'mentor'
      and m.status = 'active'          -- Gate 1: approved mentors only
      -- Never re-suggest a mentor this student is already paired with.
      and not exists (
        select 1 from public.mentorships x
        where lower(x.mentor_email) = lower(m.email)
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
-- PART 7 - CREATING A MATCH
-- ---------------------------------------------------------------------
-- One call that creates the pair from both request rows. It refuses
-- rather than silently creating a half-gated match, so the failure is
-- visible on the admin screen instead of becoming an open channel
-- nobody checked.

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

  -- Gate 1, checked here and not just in the matcher, because this
  -- function can be called with any pair of ids.
  if v_mentor.status <> 'active' then
    raise exception 'Mentor % is not approved (status: %)', v_mentor.name, v_mentor.status;
  end if;

  -- Gate 3. The match is still created when consent is missing, but it
  -- lands as 'pending' with no channel, and the admin screen shows
  -- what is outstanding. Refusing outright would push admins to record
  -- matches somewhere off-platform, which is worse.
  -- portal_requests identifies a person by email, not by auth id, so
  -- that is the join. A student who later creates an account is linked
  -- to their consent row by the same address.
  select c.* into v_consent
  from public.guardian_consents c
  where public.fg_consent_is_valid(c)
    and v_student.email is not null
    and lower(c.student_email) = lower(v_student.email)
  order by c.signed_at desc
  limit 1;

  insert into public.mentorships (
    student_name, student_email, mentor_name, mentor_email,
    school, topic, field, format,
    status, student_request_id, mentor_request_id, consent_id,
    match_score, match_reasons, matched_by,
    supervising_teacher_id, started_at
  ) values (
    v_student.name, v_student.email, v_mentor.name, v_mentor.email,
    v_student.school,
    coalesce(v_student.data ->> 'title', v_student.data ->> 'desc'),
    coalesce((public.fg_text_array(v_student.data -> 'topics'))[1], v_mentor.data ->> 'field'),
    coalesce(v_student.data ->> 'format', 'Either works'),
    'pending',                        -- never opens itself; see fg_activate_mentorship
    p_student_request_id, p_mentor_request_id, v_consent.id,
    p_score, coalesce(p_reasons, '[]'::jsonb), auth.uid(),
    p_supervising_teacher, current_date
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.fg_create_mentorship(uuid, uuid, integer, jsonb, uuid) to authenticated;

-- Opening the channel is a separate, deliberate act with its own gate
-- check, so "create the match" and "let them talk" are never the same
-- click.
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

  if m.mentor_attested_at is null then
    v_missing := v_missing || 'mentor has not signed the conduct policy';
  end if;
  if not m.background_check_on_file then
    v_missing := v_missing || 'no background check on file';
  end if;

  select * into c from public.guardian_consents where id = m.consent_id;
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
-- PART 8 - ROW LEVEL SECURITY
-- ---------------------------------------------------------------------

alter table public.guardian_consents   enable row level security;
alter table public.mentorships         enable row level security;
alter table public.mentorship_sessions enable row level security;
alter table public.mentor_messages     enable row level security;

-- ── Consents: admin only. A guardian signs through a tokenized link
--    handled by the service key, not by a logged-in session.
drop policy if exists "guardian_consents_admin" on public.guardian_consents;
create policy "guardian_consents_admin" on public.guardian_consents
  for all to authenticated
  using (public.fg_is_admin()) with check (public.fg_is_admin());

-- ── Mentorships: each party sees their own; admin and the supervising
--    teacher see it too. Nobody but an admin can write one.
drop policy if exists "mentorships_participant_read" on public.mentorships;
create policy "mentorships_participant_read" on public.mentorships
  for select to authenticated
  using (
    public.fg_is_admin()
    or student_user_id = auth.uid()
    or mentor_user_id  = auth.uid()
    or supervising_teacher_id = auth.uid()
  );

drop policy if exists "mentorships_admin_write" on public.mentorships;
create policy "mentorships_admin_write" on public.mentorships
  for all to authenticated
  using (public.fg_is_admin()) with check (public.fg_is_admin());

-- ── Sessions: participants read, staff write. A mentor logging their
--    own hours is normal; a student editing them is not.
drop policy if exists "mentorship_sessions_read" on public.mentorship_sessions;
create policy "mentorship_sessions_read" on public.mentorship_sessions
  for select to authenticated
  using (
    public.fg_is_admin()
    or exists (
      select 1 from public.mentorships m
      where m.id = pair_id
        and (m.student_user_id = auth.uid()
          or m.mentor_user_id  = auth.uid()
          or m.supervising_teacher_id = auth.uid())
    )
  );

drop policy if exists "mentorship_sessions_write" on public.mentorship_sessions;
create policy "mentorship_sessions_write" on public.mentorship_sessions
  for insert to authenticated
  with check (
    public.fg_is_admin()
    or exists (
      select 1 from public.mentorships m
      where m.id = pair_id and m.mentor_user_id = auth.uid()
    )
  );

-- ── Messages: the core of the safety model.
--
--    Read: both participants, the supervising teacher, and any admin.
--    The teacher and admin clauses are what make this supervised
--    rather than private, and they are unconditional - not gated on
--    the channel being open - so a closed channel can still be
--    reviewed after an incident.
drop policy if exists "mentor_messages_read" on public.mentor_messages;
create policy "mentor_messages_read" on public.mentor_messages
  for select to authenticated
  using (
    public.fg_is_admin()
    or exists (
      select 1 from public.mentorships m
      where m.id = mentorship_id
        and (m.student_user_id = auth.uid()
          or m.mentor_user_id  = auth.uid()
          or m.supervising_teacher_id = auth.uid())
    )
  );

--    Write: only the two participants, only while all four gates hold,
--    and only as themselves. sender_id = auth.uid() stops a
--    participant from writing a message attributed to the other one.
drop policy if exists "mentor_messages_write" on public.mentor_messages;
create policy "mentor_messages_write" on public.mentor_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.fg_mentorship_channel_open(mentorship_id)
    and exists (
      select 1 from public.mentorships m
      where m.id = mentorship_id
        and (m.student_user_id = auth.uid() or m.mentor_user_id = auth.uid())
    )
  );

--    Update: review fields only, admin only. The immutability trigger
--    independently blocks any attempt to change the body.
drop policy if exists "mentor_messages_admin_review" on public.mentor_messages;
create policy "mentor_messages_admin_review" on public.mentor_messages
  for update to authenticated
  using (public.fg_is_admin()) with check (public.fg_is_admin());


-- ---------------------------------------------------------------------
-- PART 9 - REVIEW QUEUE
-- ---------------------------------------------------------------------
-- What an admin should look at, worst first.

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
  -- sending it outranks a student.
  (case when msg.flag_reasons ?| array['secrecy_language','in_person_meeting'] then 3
        when msg.flag_reasons ?  'off_platform_contact' then 2
        else 1 end)
  + (case when msg.sender_role = 'mentor' then 1 else 0 end) as severity
from public.mentor_messages msg
join public.mentorships m on m.id = msg.mentorship_id
where msg.flagged and msg.reviewed_at is null;

comment on view public.fg_message_review_queue is
  'Unreviewed flagged messages, highest severity first. Adult-sent safeguarding flags rank above everything else.';


-- ---------------------------------------------------------------------
-- PART 10 - WHAT STILL NEEDS A HUMAN
-- ---------------------------------------------------------------------
do $$
begin
  raise notice '─────────────────────────────────────────────────';
  raise notice 'Migration 07 applied.';
  raise notice '';
  raise notice 'Before the first mentor-student channel opens:';
  raise notice '  1. Set background_check_on_file per mentorship only';
  raise notice '     after a real check has been run and filed.';
  raise notice '  2. Record mentor_attested_at when the mentor signs';
  raise notice '     the conduct policy.';
  raise notice '  3. Collect a guardian_consents row per student.';
  raise notice '  4. Assign supervising_teacher_id so someone at the';
  raise notice '     school can read the thread.';
  raise notice '';
  raise notice 'fg_activate_mentorship() refuses until 1-3 are done.';
  raise notice '─────────────────────────────────────────────────';
end $$;

-- =====================================================================
-- END MIGRATION 07
-- =====================================================================
