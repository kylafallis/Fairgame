-- =====================================================================
-- FairGame Initiative
-- Migration 11: Editable moderation vocabulary
-- Run after 07-10. Safe to run more than once.
-- =====================================================================
--
-- WHY THIS EXISTS
--
--   Migration 07 hard-coded the flagging patterns into two functions.
--   That was fine for contact details, which are structural - an email
--   address looks like an email address forever. It is the wrong shape
--   for vocabulary, which needs tuning by the people reading the
--   reports, in response to what students and mentors actually write,
--   without a deploy each time.
--
--   So the words move into a table an admin can edit. The structural
--   patterns stay in code, because there is nothing to tune about them.
--
-- WHAT GETS FLAGGED, AND WHY IT IS NOT ALL THE SAME THING
--
--   A flag is not an accusation, and these categories mean very
--   different things:
--
--     self_harm      A student may be telling you they are in trouble.
--                    This is a welfare concern, not a rule violation,
--                    and it outranks everything else in the queue.
--     off_platform   The single most reliable precursor to harm: an
--                    adult moving a child somewhere unobserved.
--     secrecy        "Don't tell your mum." Same reason.
--     meeting        Suggestions of meeting alone or offering a lift.
--     sexual         Never appropriate between a mentor and a student.
--     substances     Alcohol and drugs.
--     violence       Threats.
--     profanity      Lowest severity on purpose. A teenager swearing
--                    about their data not fitting is not a safeguarding
--                    event, and treating it as one buries the things
--                    that are.
--
--   Nothing is ever blocked. A blocked message teaches a bad actor
--   what evades detection; a recorded one gives you evidence.
--
-- FALSE POSITIVES
--
--   Every term is matched on word boundaries, so 'ass' does not fire on
--   'class', 'assignment' or 'assess', and 'hell' does not fire on
--   'hello' or 'shell'. A term can also be marked is_regex to express
--   something a bare word cannot.
-- =====================================================================


do $$
begin
  if to_regclass('public.mentor_messages') is null then
    raise exception 'Migration 11 needs migration 07 first.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- PART 1 - THE VOCABULARY
-- ---------------------------------------------------------------------

create table if not exists public.moderation_terms (
  id        uuid primary key default gen_random_uuid(),
  term      text not null,
  category  text not null,
  -- 1 low, 2 concerning, 3 serious, 4 welfare emergency. Drives the
  -- order of the review queue.
  severity  smallint not null default 2,
  is_regex  boolean not null default false,
  active    boolean not null default true,
  note      text,
  added_by  uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists moderation_terms_unique
  on public.moderation_terms (lower(term), category);
create index if not exists moderation_terms_active_idx
  on public.moderation_terms (active) where active;

alter table public.moderation_terms drop constraint if exists moderation_terms_category_check;
alter table public.moderation_terms add constraint moderation_terms_category_check
  check (category in ('profanity','sexual','substances','violence','self_harm',
                      'off_platform','secrecy','meeting','contact','other'));

alter table public.moderation_terms drop constraint if exists moderation_terms_severity_check;
alter table public.moderation_terms add constraint moderation_terms_severity_check
  check (severity between 1 and 4);

alter table public.moderation_terms enable row level security;

drop policy if exists "moderation_terms_admin" on public.moderation_terms;
create policy "moderation_terms_admin" on public.moderation_terms
  for all to authenticated
  using (public.fg_is_admin()) with check (public.fg_is_admin());

comment on table public.moderation_terms is
  'Editable flagging vocabulary. Matched on word boundaries. Nothing here blocks a message - it marks it for review.';


-- ---------------------------------------------------------------------
-- PART 2 - THE SEED
-- ---------------------------------------------------------------------
-- A starting point, not a finished list. Add and remove freely; the
-- scanner reads this table on every message.

insert into public.moderation_terms (term, category, severity, is_regex, note) values

-- ── Welfare. Highest severity: a student may be disclosing. ──────────
  ('kill myself',      'self_harm', 4, false, 'Welfare - respond same day'),
  ('killing myself',   'self_harm', 4, false, null),
  ('kms',              'self_harm', 4, false, 'Common abbreviation'),
  ('suicide',          'self_harm', 4, false, null),
  ('suicidal',         'self_harm', 4, false, null),
  ('self harm',        'self_harm', 4, false, null),
  ('self-harm',        'self_harm', 4, false, null),
  ('cut myself',       'self_harm', 4, false, null),
  ('cutting myself',   'self_harm', 4, false, null),
  ('want to die',      'self_harm', 4, false, null),
  ('end it all',       'self_harm', 4, false, null),
  ('hurt myself',      'self_harm', 4, false, null),
  ('starve myself',    'self_harm', 4, false, null),

-- ── Moving the conversation somewhere unobserved ─────────────────────
  ('text me',          'off_platform', 3, false, null),
  ('call me',          'off_platform', 3, false, null),
  ('dm me',            'off_platform', 3, false, null),
  ('pm me',            'off_platform', 3, false, null),
  ('add me on',        'off_platform', 3, false, null),
  ('message me on',    'off_platform', 3, false, null),
  ('find me on',       'off_platform', 3, false, null),
  ('my number is',     'off_platform', 3, false, null),
  ('whats your number', 'off_platform', 3, false, null),
  ('what.s your number','off_platform',3, true,  'Handles the apostrophe'),
  ('off the platform', 'off_platform', 3, false, null),
  ('outside of fairgame','off_platform',3,false, null),
  ('instagram',        'off_platform', 3, false, null),
  ('snapchat',         'off_platform', 3, false, null),
  ('snap me',          'off_platform', 3, false, null),
  ('tiktok',           'off_platform', 3, false, null),
  ('whatsapp',         'off_platform', 3, false, null),
  ('telegram',         'off_platform', 3, false, null),
  ('discord',          'off_platform', 3, false, null),
  ('facebook',         'off_platform', 3, false, null),
  ('messenger',        'off_platform', 3, false, null),
  ('venmo',            'off_platform', 3, false, null),
  ('cashapp',          'off_platform', 3, false, null),
  ('cash app',         'off_platform', 3, false, null),
  ('paypal',           'off_platform', 3, false, null),

-- ── Secrecy ──────────────────────────────────────────────────────────
  ('don.t tell',       'secrecy', 3, true,  'Apostrophe optional'),
  ('do not tell',      'secrecy', 3, false, null),
  ('our secret',       'secrecy', 3, false, null),
  ('keep this between','secrecy', 3, false, null),
  ('just between us',  'secrecy', 3, false, null),
  ('delete this',      'secrecy', 3, false, null),
  ('don.t mention',    'secrecy', 3, true,  null),
  ('don.t say anything','secrecy',3, true,  null),
  ('nobody needs to know','secrecy',3,false, null),
  ('between you and me','secrecy', 3, false, null),

-- ── Meeting alone ────────────────────────────────────────────────────
  ('pick you up',      'meeting', 3, false, null),
  ('give you a ride',  'meeting', 3, false, null),
  ('drive you',        'meeting', 3, false, null),
  ('come over',        'meeting', 3, false, null),
  ('my house',         'meeting', 3, false, null),
  ('my place',         'meeting', 3, false, null),
  ('my apartment',     'meeting', 3, false, null),
  ('my car',           'meeting', 3, false, null),
  ('meet me at',       'meeting', 3, false, null),
  ('meet up',          'meeting', 2, false, null),
  ('alone',            'meeting', 2, false, 'Low on its own; weight comes from company'),
  ('just us',          'meeting', 2, false, null),
  ('don.t bring',      'meeting', 3, true,  null),

-- ── Sexual. Never appropriate in a mentoring thread. ─────────────────
  ('sexy',             'sexual', 4, false, null),
  ('hot body',         'sexual', 4, false, null),
  ('nudes',            'sexual', 4, false, null),
  ('naked',            'sexual', 4, false, null),
  ('boobs',            'sexual', 4, false, null),
  ('dick pic',         'sexual', 4, false, null),
  ('horny',            'sexual', 4, false, null),
  ('porn',             'sexual', 4, false, null),
  ('sext',             'sexual', 4, false, null),
  ('turn me on',       'sexual', 4, false, null),
  ('what are you wearing','sexual',4,false, null),
  ('send a pic',       'sexual', 3, false, null),
  ('send pics',        'sexual', 3, false, null),
  ('you.re beautiful', 'sexual', 3, true,  'Context matters - review, do not assume'),
  ('you.re gorgeous',  'sexual', 3, true,  null),
  ('love you',         'sexual', 3, false, 'Review for context'),

-- ── Substances ───────────────────────────────────────────────────────
  ('weed',             'substances', 2, false, null),
  ('marijuana',        'substances', 2, false, null),
  ('vape',             'substances', 2, false, null),
  ('vaping',           'substances', 2, false, null),
  ('beer',             'substances', 2, false, null),
  ('alcohol',          'substances', 2, false, 'May be legitimate in chemistry'),
  ('drunk',            'substances', 2, false, null),
  ('cocaine',          'substances', 3, false, null),
  ('adderall',         'substances', 2, false, null),
  ('xanax',            'substances', 2, false, null),

-- ── Violence ─────────────────────────────────────────────────────────
  ('kill you',         'violence', 4, false, null),
  ('hurt you',         'violence', 3, false, null),
  ('beat you up',      'violence', 3, false, null),
  ('shoot up',         'violence', 4, false, null),
  ('bring a gun',      'violence', 4, false, null),
  ('bomb',             'violence', 3, false, 'May be legitimate in chemistry'),

-- ── Profanity. Deliberately severity 1. ──────────────────────────────
  ('fuck',             'profanity', 1, false, null),
  ('fucking',          'profanity', 1, false, null),
  ('shit',             'profanity', 1, false, null),
  ('bullshit',         'profanity', 1, false, null),
  ('bitch',            'profanity', 1, false, null),
  ('bastard',          'profanity', 1, false, null),
  ('asshole',          'profanity', 1, false, null),
  ('dumbass',          'profanity', 1, false, null),
  ('damn',             'profanity', 1, false, null),
  ('goddamn',          'profanity', 1, false, null),
  ('crap',             'profanity', 1, false, null),
  ('piss',             'profanity', 1, false, null),
  ('dick',             'profanity', 1, false, null),
  ('cunt',             'profanity', 2, false, null),
  ('slut',             'profanity', 2, false, null),
  ('whore',            'profanity', 2, false, null),
  ('retard',           'profanity', 2, false, 'Slur'),
  ('retarded',         'profanity', 2, false, 'Slur'),
  ('faggot',           'profanity', 3, false, 'Slur'),
  ('n1gger',           'profanity', 3, false, 'Slur - obfuscated form'),

-- ── Grooming flattery, which rarely reads as alarming on its own ─────
  ('mature for your age','other', 4, false, 'Classic grooming phrase'),
  ('so mature',        'other', 3, false, null),
  ('our little',       'other', 3, false, null),
  ('special friend',   'other', 3, false, null),
  ('you.re different', 'other', 2, true,  null),
  ('trust me',         'other', 2, false, null)

on conflict do nothing;


-- ---------------------------------------------------------------------
-- PART 3 - THE SCANNER
-- ---------------------------------------------------------------------
-- STABLE rather than IMMUTABLE, because it reads a table now. That is
-- fine for a BEFORE INSERT trigger.

create or replace function public.fg_scan_terms(p_body text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_norm  text;
  v_hits  jsonb := '[]'::jsonb;
  r       record;
  v_pat   text;
begin
  if p_body is null then return v_hits; end if;

  -- Fold the usual evasions: repeated letters, digit-for-letter, and
  -- punctuation wedged between characters. Not exhaustive, and not
  -- meant to be - it raises the effort required, which is the point.
  v_norm := lower(p_body);
  v_norm := translate(v_norm, '0134$@!', 'oleasai');
  v_norm := regexp_replace(v_norm, '([a-z])\1{2,}', '\1\1', 'g');
  v_norm := regexp_replace(v_norm, '[^a-z0-9\s'']', ' ', 'g');
  v_norm := regexp_replace(v_norm, '\s+', ' ', 'g');

  for r in
    select term, category, severity, is_regex
    from public.moderation_terms
    where active
  loop
    -- \y is a word boundary, so 'ass' cannot fire inside 'class'.
    v_pat := case when r.is_regex then r.term
                  else '\y' || regexp_replace(r.term, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\y'
             end;

    if v_norm ~ v_pat then
      v_hits := v_hits || jsonb_build_array(
        jsonb_build_object('category', r.category, 'term', r.term, 'severity', r.severity));
    end if;
  end loop;

  return v_hits;
end;
$$;

grant execute on function public.fg_scan_terms(text) to authenticated;


-- ---------------------------------------------------------------------
-- PART 4 - FLAGGING, REWIRED
-- ---------------------------------------------------------------------
-- flag_reasons keeps the shape the review queue and the portal already
-- read - a flat array of category strings - and gains a companion
-- column carrying which term matched and how serious it is, so a
-- reviewer can see why without guessing.

alter table public.mentor_messages
  add column if not exists flag_detail jsonb not null default '[]'::jsonb;
alter table public.mentor_messages
  add column if not exists flag_severity smallint not null default 0;

create or replace function public.fg_flag_mentor_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_struct jsonb;
  v_terms  jsonb;
  v_cats   jsonb;
  v_sev    smallint;
begin
  -- Structural patterns stay in code; there is nothing to tune about
  -- what an email address looks like.
  v_struct := public.fg_scan_contact_info(new.body);
  v_terms  := public.fg_scan_terms(new.body);

  select coalesce(jsonb_agg(distinct c), '[]'::jsonb) into v_cats
  from (
    select jsonb_array_elements_text(v_struct) as c
    union
    select value ->> 'category' from jsonb_array_elements(v_terms)
  ) x;

  select coalesce(max((value ->> 'severity')::smallint), 0) into v_sev
  from jsonb_array_elements(v_terms);

  -- A shared contact detail is serious even with no term behind it.
  if jsonb_array_length(v_struct) > 0 then
    v_sev := greatest(v_sev, 3);
  end if;

  new.flag_reasons  := v_cats;
  new.flag_detail   := v_terms;
  new.flag_severity := v_sev;
  new.flagged       := jsonb_array_length(v_cats) > 0;

  -- Set by review, never by the sender.
  new.reviewed_at := null;
  new.reviewed_by := null;
  return new;
end;
$$;

drop trigger if exists mentor_messages_flag on public.mentor_messages;
create trigger mentor_messages_flag before insert on public.mentor_messages
  for each row execute function public.fg_flag_mentor_message();


-- ---------------------------------------------------------------------
-- PART 5 - THE REVIEW QUEUE, REORDERED
-- ---------------------------------------------------------------------
-- Dropped and recreated rather than replaced, because the column list
-- changes. A view holds no data, so nothing is lost.

drop view if exists public.fg_message_review_queue;

create view public.fg_message_review_queue as
select
  msg.id,
  msg.mentorship_id,
  msg.created_at,
  msg.sender_role,
  msg.sender_name,
  msg.body,
  msg.flag_reasons,
  msg.flag_detail,
  m.student_name,
  m.mentor_name,
  m.school,
  -- Term severity leads. An adult sending it adds one, because the same
  -- words carry a different weight from the grown-up in the room.
  least(5, msg.flag_severity + case when msg.sender_role = 'mentor' then 1 else 0 end) as severity
from public.mentor_messages msg
join public.mentorships m on m.id = msg.mentorship_id
-- A view runs as its owner and so does NOT inherit row level security
-- from the tables underneath. Without this predicate any signed-in
-- account could read every flagged message on the platform.
where public.fg_is_admin()
  and msg.flagged and msg.reviewed_at is null;

comment on view public.fg_message_review_queue is
  'Unreviewed flagged messages, most serious first. Welfare disclosures outrank everything; profanity sits at the bottom.';


-- ---------------------------------------------------------------------
-- PART 6 - EVERY THREAD, FOR THE ADMIN CONVERSATIONS TAB
-- ---------------------------------------------------------------------

create or replace view public.fg_conversation_index as
select
  m.id,
  m.student_name,
  m.mentor_name,
  m.school,
  m.topic,
  m.status,
  m.started_at,
  m.supervising_teacher_id is not null as teacher_assigned,
  coalesce(msg.n, 0)          as message_count,
  coalesce(msg.flagged_n, 0)  as flagged_count,
  coalesce(msg.worst, 0)      as worst_severity,
  msg.last_at                 as last_message_at
from public.mentorships m
left join (
  select mentorship_id,
         count(*)                                          as n,
         count(*) filter (where flagged)                    as flagged_n,
         max(case when flagged then flag_severity else 0 end) as worst,
         max(created_at)                                    as last_at
  from public.mentor_messages
  group by mentorship_id
) msg on msg.mentorship_id = m.id
-- Same reason as above: the view bypasses RLS, so it states its own.
where public.fg_is_admin();

comment on view public.fg_conversation_index is
  'One row per mentor-student pair with its message counts, for the admin conversations list.';


-- ---------------------------------------------------------------------
-- PART 7 - REPORT BACK
-- ---------------------------------------------------------------------
do $$
declare v_terms integer; v_cats text;
begin
  select count(*), string_agg(distinct category, ', ' order by category)
    into v_terms, v_cats from public.moderation_terms where active;

  raise notice '';
  raise notice '─────────────────────────────────────────────────';
  raise notice 'Migration 11 applied. Nothing was deleted.';
  raise notice '';
  raise notice '% active terms across: %', v_terms, v_cats;
  raise notice '';
  raise notice 'Everything is matched on word boundaries, so "ass"';
  raise notice 'does not fire inside "class" or "assignment".';
  raise notice '';
  raise notice 'Tune it freely - the scanner reads the table live:';
  raise notice '  insert into public.moderation_terms (term, category, severity)';
  raise notice '  values (''some phrase'', ''off_platform'', 3);';
  raise notice '';
  raise notice '  update public.moderation_terms set active = false';
  raise notice '  where term = ''alcohol'';   -- too noisy for chemistry';
  raise notice '─────────────────────────────────────────────────';
end $$;

-- =====================================================================
-- END MIGRATION 11
-- =====================================================================
