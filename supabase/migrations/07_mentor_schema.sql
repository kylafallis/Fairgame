-- =====================================================================
-- FairGame Initiative
-- Migration 07: Mentor schema - STRUCTURE ONLY
-- Run after 01-06, and before 08. Safe to run more than once.
-- =====================================================================
--
-- WHAT THIS FILE IS
--
--   Tables, columns, constraints, triggers and row level security.
--   Nothing else. Every callable function lives in migration 08, so
--   that file is pure "create or replace function" and can be re-run
--   at any time without touching a single row.
--
-- WHY THE EARLIER VERSION FAILED
--
--   public.mentorships and public.mentorship_sessions already existed,
--   built through the dashboard with a narrower shape. The previous
--   attempt used "create table if not exists", which quietly skipped
--   both of them and therefore never added the columns the rest of the
--   migration depended on. The row level security policies then
--   referenced student_user_id, which did not exist, the script
--   errored, and Postgres rolled the whole thing back.
--
--   This version adds every column with "add column if not exists"
--   after the create, so it produces the same end state whether the
--   table was already there or not.
--
-- WHAT IT DOES TO DATA
--
--   Nothing is deleted. There is no delete, no drop table, no drop
--   column, and no truncate anywhere in this file. Existing mentorship
--   rows are kept exactly as they are; they simply gain new columns
--   that start out null.
--
-- ONE THING TO KNOW BEFORE YOU RUN IT
--
--   This turns on row level security for mentorships and
--   mentorship_sessions, which currently have none. After it runs,
--   those tables are readable only by an admin, by the two people in
--   the match, or by the supervising teacher. Your existing rows have
--   no linked accounts yet, so in practice that means admins only.
--
--   If nobody holds the admin role, the mentor log will look empty.
--   The final section checks for that and tells you.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART 0 - PREFLIGHT
-- ---------------------------------------------------------------------
-- Fail early and legibly if an earlier migration is missing, rather
-- than three hundred lines later with a confusing error.

do $$
begin
  if to_regprocedure('public.fg_is_admin()') is null then
    raise exception 'Missing public.fg_is_admin(). Run migration 01 first.';
  end if;
  if to_regprocedure('public.fg_text_array(jsonb)') is null then
    raise exception 'Missing public.fg_text_array(). Run migration 01 first.';
  end if;
  if to_regprocedure('public.fg_touch_updated_at()') is null then
    raise exception 'Missing public.fg_touch_updated_at(). Run migration 01 first.';
  end if;
  if to_regclass('public.portal_requests') is null then
    raise exception 'Missing public.portal_requests, which both application forms write to.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- PART 1 - THE MENTOR ROLE
-- ---------------------------------------------------------------------
-- Mentors were approved in portal_requests and then sent somewhere off
-- platform, so they never needed to sign in. Supervised messaging
-- requires them to, which requires a role of their own.
--
-- 'mentor' is deliberately NOT self-provisionable. Migration 06 allows
-- only student, ambassador and teacher through that path. Migration 08
-- adds a separate function that grants it, gated on an admin having
-- already approved that person's application.

alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('admin','teacher','ambassador','judge',
                  'fair_manager','student','parent','mentor','inactive'));


-- ---------------------------------------------------------------------
-- PART 2 - GUARDIAN CONSENT
-- ---------------------------------------------------------------------
-- Consent is its own table rather than a flag on the mentorship,
-- because it has a life of its own: it is granted before a match
-- exists, it can be withdrawn while one is running, and it has to
-- outlive the match it authorized so there is a record of what was
-- agreed and when.

create table if not exists public.guardian_consents (
  id                  uuid primary key default gen_random_uuid(),

  student_user_id     uuid references auth.users(id) on delete set null,
  student_name        text not null,
  student_email       text,
  student_grade       text,
  mentor_name         text,

  guardian_name       text not null,
  guardian_email      text not null,
  guardian_phone      text,
  relationship        text,

  -- Storing the version means consent given under older wording is
  -- visibly different from current consent, rather than silently
  -- treated as equivalent.
  policy_version      text not null default '2026-01',
  consent_text        text,

  -- The secret in the signing link. Unguessable, expiring, and scoped
  -- to exactly one row, so a guardian never needs an account.
  token               uuid not null default gen_random_uuid(),
  token_expires_at    timestamptz not null default (now() + interval '30 days'),
  sent_at             timestamptz,

  signed_at           timestamptz,
  signed_ip           text,
  -- Consent for a minor is not open ended. A school year is the
  -- natural boundary; renewing is a deliberate act.
  expires_at          timestamptz,

  revoked_at          timestamptz,
  revoked_reason      text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Idempotent column adds, so this file produces the same shape whether
-- the table was created just now or by an earlier partial run.
alter table public.guardian_consents add column if not exists student_grade    text;
alter table public.guardian_consents add column if not exists mentor_name      text;
alter table public.guardian_consents add column if not exists token            uuid not null default gen_random_uuid();
alter table public.guardian_consents add column if not exists token_expires_at timestamptz not null default (now() + interval '30 days');
alter table public.guardian_consents add column if not exists sent_at          timestamptz;

create unique index if not exists guardian_consents_token_idx
  on public.guardian_consents (token);
create index if not exists guardian_consents_student_idx
  on public.guardian_consents (student_user_id);
create index if not exists guardian_consents_email_idx
  on public.guardian_consents (lower(student_email));

comment on table public.guardian_consents is
  'Signed guardian permission for a student to be mentored. One of the gates before a mentoring channel can open.';
comment on column public.guardian_consents.token is
  'Secret in the signing link. Unguessable, expires, scoped to one row.';


-- ---------------------------------------------------------------------
-- PART 3 - MENTORSHIPS
-- ---------------------------------------------------------------------
-- This table already exists in the live database with a narrower
-- shape. The create below is for a fresh database; the alters after it
-- are what actually run against yours, and each one is a no-op if the
-- column is already present.

create table if not exists public.mentorships (
  id                  uuid primary key default gen_random_uuid(),
  student_name        text not null,
  student_email       text,
  mentor_name         text not null,
  mentor_email        text,
  school              text,
  topic               text,
  status              text not null default 'pending',
  milestones          jsonb not null default '{}'::jsonb,
  total_hours         numeric default 0,
  session_count       integer default 0,
  started_at          date default current_date,
  last_session        date,
  outcome             text,
  created_at          timestamptz default now()
);

-- ── Who the two people actually are ──────────────────────────────────
-- The live table identifies both sides by name and email only. These
-- are what the read policy and the portal filter on; without them a
-- fully approved match shows an empty thread to both people in it.
alter table public.mentorships add column if not exists student_user_id        uuid references auth.users(id) on delete set null;
alter table public.mentorships add column if not exists mentor_user_id         uuid references auth.users(id) on delete set null;

-- The teacher who supervises this student. Besides FairGame staff,
-- this is the person who can read the thread.
alter table public.mentorships add column if not exists supervising_teacher_id uuid references auth.users(id) on delete set null;

-- ── Where the match came from ────────────────────────────────────────
alter table public.mentorships add column if not exists field              text;
alter table public.mentorships add column if not exists format             text;
alter table public.mentorships add column if not exists student_request_id uuid;
alter table public.mentorships add column if not exists mentor_request_id  uuid;
alter table public.mentorships add column if not exists consent_id         uuid references public.guardian_consents(id) on delete set null;

-- What the matcher thought at the time. Kept because someone reviewing
-- a bad match later needs to know what the score rested on.
alter table public.mentorships add column if not exists match_score   integer;
alter table public.mentorships add column if not exists match_reasons jsonb not null default '[]'::jsonb;
alter table public.mentorships add column if not exists matched_by    uuid references auth.users(id) on delete set null;

-- ── The gates ────────────────────────────────────────────────────────
alter table public.mentorships add column if not exists mentor_attested_at       timestamptz;
alter table public.mentorships add column if not exists background_check_on_file boolean not null default false;

-- ── Housekeeping ─────────────────────────────────────────────────────
alter table public.mentorships add column if not exists closed_at     timestamptz;
alter table public.mentorships add column if not exists closed_reason text;
-- The shared touch trigger writes this. Adding it before the trigger
-- is created is what stops every UPDATE from erroring.
alter table public.mentorships add column if not exists updated_at    timestamptz not null default now();

-- New matches start closed. Existing rows keep whatever status they
-- have; this only changes what a row created from now on defaults to.
alter table public.mentorships alter column status set default 'pending';

-- NOT VALID on purpose. It applies to every insert and update from now
-- on, but does not re-check rows that are already there - so an
-- unexpected legacy status cannot make this migration fail the way the
-- last one did. The notice at the end lists anything that would fail.
alter table public.mentorships drop constraint if exists mentorships_status_check;
alter table public.mentorships add constraint mentorships_status_check
  check (status in ('pending','active','paused','completed','closed')) not valid;

create index if not exists mentorships_student_idx on public.mentorships (student_user_id);
create index if not exists mentorships_mentor_idx  on public.mentorships (mentor_user_id);
create index if not exists mentorships_teacher_idx on public.mentorships (supervising_teacher_id);
create index if not exists mentorships_status_idx  on public.mentorships (status);

drop trigger if exists mentorships_touch on public.mentorships;
create trigger mentorships_touch before update on public.mentorships
  for each row execute function public.fg_touch_updated_at();

comment on column public.mentorships.status is
  'pending = matched but channel closed. active = every gate passed, messaging open. paused/closed = messaging shut, transcript retained.';


-- ---------------------------------------------------------------------
-- PART 4 - SESSION LOG
-- ---------------------------------------------------------------------
-- Also already exists. Only logged_by is new.

create table if not exists public.mentorship_sessions (
  id          uuid primary key default gen_random_uuid(),
  pair_id     uuid not null references public.mentorships(id),
  date        date not null,
  hours       numeric not null,
  notes       text not null,
  created_at  timestamptz default now()
);

alter table public.mentorship_sessions add column if not exists logged_by uuid references auth.users(id) on delete set null;

create index if not exists mentorship_sessions_pair_idx
  on public.mentorship_sessions (pair_id, date desc);

-- Totals maintained here rather than in the browser. The old client
-- read the current total and wrote back total + hours, which loses a
-- session whenever two people log at the same moment.
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
-- PART 5 - MENTOR CONDUCT ATTESTATION
-- ---------------------------------------------------------------------
-- Recorded per person rather than per match, so a mentor carrying three
-- students signs once instead of three times.

create table if not exists public.mentor_attestations (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  policy_version text not null,
  signed_at      timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- PART 6 - SUPERVISED MESSAGES
-- ---------------------------------------------------------------------

create table if not exists public.mentor_messages (
  id            uuid primary key default gen_random_uuid(),
  mentorship_id uuid not null references public.mentorships(id) on delete cascade,

  sender_id     uuid references auth.users(id) on delete set null,
  sender_role   text not null check (sender_role in ('student','mentor','admin','teacher')),
  sender_name   text,

  body          text not null check (length(trim(body)) > 0 and length(body) <= 8000),

  -- Set by trigger, never by the client. A caller-supplied "this one is
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


-- ---------------------------------------------------------------------
-- PART 7 - SCANNING AND IMMUTABILITY
-- ---------------------------------------------------------------------
-- These three live here rather than in 08 because triggers and policies
-- depend on them; everything a person calls directly is in 08.

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

  -- Collapse the usual dodges first, so "j dot smith at gmail dot com"
  -- does not slide past a naive pattern.
  v_norm := lower(p_body);
  v_norm := regexp_replace(v_norm, '\s+(at|\(at\)|\[at\])\s+', '@', 'g');
  v_norm := regexp_replace(v_norm, '\s+(dot|\(dot\)|\[dot\])\s+', '.', 'g');

  if v_norm ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then
    v_reasons := v_reasons || '["email_address"]'::jsonb;
  end if;

  -- Seven or more digits with common separators, which catches most
  -- phone numbers without firing on years or measurements.
  if v_norm ~ '(\+?\d[\s.-]?){7,}' then
    v_reasons := v_reasons || '["phone_number"]'::jsonb;
  end if;

  if v_norm ~ '(instagram|snapchat|snap|tiktok|discord|whatsapp|telegram|facebook|twitter|venmo|cash ?app)' then
    v_reasons := v_reasons || '["social_platform"]'::jsonb;
  end if;

  if v_norm ~ '(zoom\.us|meet\.google|teams\.microsoft|calendly\.com)' then
    v_reasons := v_reasons || '["external_meeting_link"]'::jsonb;
  end if;

  return v_reasons;
end;
$$;

-- Kept separate from contact detection so the pattern list can be
-- revised on its own, and so a reviewer can read plainly what the
-- system is looking for.
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
  v_terms   jsonb := '[]'::jsonb;
  v_sev     smallint := 0;
begin
  v_reasons := public.fg_scan_contact_info(new.body);

  -- Migration 11 moves the vocabulary into an editable table and adds a
  -- severity rating. If it has already run, defer to it. Without this
  -- check, re-running 07 on its own would quietly revert flagging to the
  -- smaller built-in list, and nothing would say so.
  if to_regprocedure('public.fg_scan_terms(text)') is not null then
    execute 'select public.fg_scan_terms($1)' into v_terms using new.body;
    v_reasons := v_reasons || (
      select coalesce(jsonb_agg(distinct value ->> 'category'), '[]'::jsonb)
      from jsonb_array_elements(v_terms));
    select coalesce(max((value ->> 'severity')::smallint), 0) into v_sev
    from jsonb_array_elements(v_terms);
  else
    v_reasons := v_reasons || public.fg_scan_safeguarding(new.body);
  end if;

  -- A student sharing their own school email with their assigned mentor
  -- is a far smaller matter than an adult soliciting it. Both are
  -- recorded; only the reason list and the sender's role tell them
  -- apart, and the review queue ranks on exactly that.
  new.flag_reasons := v_reasons;
  new.flagged      := jsonb_array_length(v_reasons) > 0;

  -- These columns only exist once migration 11 has run.
  if to_regclass('public.mentor_messages') is not null
     and exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='mentor_messages'
                   and column_name='flag_severity') then
    if jsonb_array_length(public.fg_scan_contact_info(new.body)) > 0 then
      v_sev := greatest(v_sev, 3);
    end if;
    new.flag_severity := v_sev;
    new.flag_detail   := v_terms;
  end if;

  -- Set by review, never by the sender.
  new.reviewed_at := null;
  new.reviewed_by := null;
  return new;
end;
$$;

drop trigger if exists mentor_messages_flag on public.mentor_messages;
create trigger mentor_messages_flag before insert on public.mentor_messages
  for each row execute function public.fg_flag_mentor_message();

-- Insert-only, enforced by the database rather than by convention. A
-- participant editing a message after the fact would destroy the only
-- account of what happened, so the table refuses.
create or replace function public.fg_mentor_messages_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'mentor_messages rows cannot be deleted';
  end if;
  -- The review fields and the read receipt are the only mutable parts.
  if new.body             is distinct from old.body
     or new.sender_id     is distinct from old.sender_id
     or new.mentorship_id is distinct from old.mentorship_id
     or new.created_at    is distinct from old.created_at then
    raise exception 'mentor_messages content cannot be edited';
  end if;
  return new;
end;
$$;

drop trigger if exists mentor_messages_immutable on public.mentor_messages;
create trigger mentor_messages_immutable before update or delete on public.mentor_messages
  for each row execute function public.fg_mentor_messages_immutable();


-- ---------------------------------------------------------------------
-- PART 8 - THE CONSENT PREDICATE AND THE CHANNEL GATE
-- ---------------------------------------------------------------------
-- Policies depend on these two, so they belong with the structure.

-- STABLE, not IMMUTABLE: it reads now(). Marked immutable, Postgres
-- would be free to fold the expiry comparison to a constant and an
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

-- Answers "may these two exchange a message right now". The write
-- policy on mentor_messages routes through this, so the gates cannot be
-- stepped around by calling the API directly.
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
      and m.status = 'active'                 -- an admin opened it
      and m.mentor_attested_at is not null    -- conduct policy signed
      and m.background_check_on_file          -- screening recorded
      and m.student_user_id is not null       -- both can actually read it
      and m.mentor_user_id  is not null
      and c.id is not null                    -- consent exists
      and public.fg_consent_is_valid(c)       -- and still holds
  );
$$;

-- Withdrawing consent has to shut the channel without anyone
-- remembering to do it by hand.
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
        closed_reason = 'Guardian consent withdrawn'
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
-- PART 9 - ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
-- Read this part before running the file. It changes who can see rows
-- that already exist.

alter table public.guardian_consents   enable row level security;
alter table public.mentor_attestations enable row level security;
alter table public.mentorships         enable row level security;
alter table public.mentorship_sessions enable row level security;
alter table public.mentor_messages     enable row level security;

-- ── Consents: admin only from a signed-in session. A guardian signs
--    through the token functions in 08, which are security definer and
--    therefore never touch these policies.
drop policy if exists "guardian_consents_admin" on public.guardian_consents;
create policy "guardian_consents_admin" on public.guardian_consents
  for all to authenticated
  using (public.fg_is_admin()) with check (public.fg_is_admin());

-- ── Attestations: a mentor sees their own, an admin sees all.
drop policy if exists "mentor_attestations_self" on public.mentor_attestations;
create policy "mentor_attestations_self" on public.mentor_attestations
  for select to authenticated
  using (user_id = auth.uid() or public.fg_is_admin());

-- ── Mentorships: each party sees their own; the supervising teacher
--    and any admin see it too. Only an admin can write one.
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

-- ── Sessions: participants read, the mentor or an admin writes. A
--    student editing their mentor's logged hours is not a thing.
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

-- ── Messages: the centre of the whole model.
--
--    Read: both participants, the supervising teacher, any admin. The
--    teacher and admin clauses are what make this supervised rather
--    than private, and they are unconditional - not gated on the
--    channel being open - so a closed thread can still be reviewed
--    after the fact, which is the entire point of keeping it.
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

--    Write: only the two participants, only while every gate holds, and
--    only as themselves. sender_id = auth.uid() is what stops one party
--    writing a message attributed to the other.
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

--    Update: the review fields only, admin only. The immutability
--    trigger independently refuses any change to the body, so this
--    policy being wrong could still never rewrite history.
drop policy if exists "mentor_messages_admin_review" on public.mentor_messages;
create policy "mentor_messages_admin_review" on public.mentor_messages
  for update to authenticated
  using (public.fg_is_admin()) with check (public.fg_is_admin());


-- ---------------------------------------------------------------------
-- PART 10 - REPORT BACK
-- ---------------------------------------------------------------------
do $$
declare
  v_admins   integer;
  v_pairs    integer;
  v_bad      integer;
  v_statuses text;
begin
  select count(*) into v_admins from public.user_roles where role = 'admin';
  select count(*) into v_pairs  from public.mentorships;

  select count(*), string_agg(distinct status, ', ')
    into v_bad, v_statuses
  from public.mentorships
  where status not in ('pending','active','paused','completed','closed');

  raise notice '';
  raise notice '─────────────────────────────────────────────────';
  raise notice 'Migration 07 applied. Nothing was deleted.';
  raise notice '';
  raise notice 'Mentorship rows kept: %', v_pairs;

  if v_bad > 0 then
    raise notice '';
    raise notice '  % row(s) carry a status outside the new list (%).', v_bad, v_statuses;
    raise notice '  They were left alone. The constraint is NOT VALID,';
    raise notice '  so it applies going forward without rejecting them.';
  end if;

  raise notice '';
  if v_admins = 0 then
    raise notice '  ACTION NEEDED - nobody holds the admin role.';
    raise notice '  Row level security is now on for mentorships, so the';
    raise notice '  mentor log will look empty until you fix this:';
    raise notice '';
    raise notice '    insert into public.user_roles (user_id, role, full_name)';
    raise notice '    select id, ''admin'', ''Kyla Fallis''';
    raise notice '    from auth.users where email = ''your@email.com''';
    raise notice '    on conflict (user_id) do update set role = ''admin'';';
  else
    raise notice '  Admin accounts on file: %  (good)', v_admins;
  end if;

  raise notice '';
  raise notice 'Next: run migration 08 for the callable functions.';
  raise notice '─────────────────────────────────────────────────';
end $$;

-- =====================================================================
-- END MIGRATION 07
-- =====================================================================
