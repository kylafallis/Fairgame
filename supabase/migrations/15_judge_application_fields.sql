-- ---------------------------------------------------------------------
-- MIGRATION 15 - JUDGE APPLICATION: AVAILABILITY, REFERRALS, DUPLICATES
-- ---------------------------------------------------------------------
-- Run after 14. Everything here is additive; nothing existing is
-- dropped or rewritten except preferred_levels, which is filled in only
-- where it is still empty (PART 5).
--
-- The judge form now also asks for:
--   - whether they can judge virtually         -> virtual_ok (migration 01)
--   - which grade levels they want to judge    -> preferred_grade_bands (01)
--   - which months they are free                -> available_months
--   - agreement to the judge code of conduct    -> conduct_agreed_at
--   - an optional LinkedIn and work email       -> linkedin, work_email
--   - how they heard about FairGame             -> heard_about
-- and records, without asking:
--   - the ?src= tag on the link they arrived by -> signup_source
--   - the judge whose referral link they used   -> referred_by
--
-- Admins also get a background-check status per judge, for the fairs
-- that require one.


-- ---------------------------------------------------------------------
-- PART 1 - COLUMNS
-- ---------------------------------------------------------------------

-- The judge code was printed on the confirmation screen but never saved,
-- so nobody could look it up afterwards. It is now saved, and doubles as
-- the judge's referral code.
alter table public.judges add column if not exists code text;

alter table public.judges add column if not exists available_months     text[] not null default '{}';
alter table public.judges add column if not exists conduct_agreed_at    timestamptz;
alter table public.judges add column if not exists linkedin             text;
alter table public.judges add column if not exists work_email           text;
alter table public.judges add column if not exists heard_about          text;
alter table public.judges add column if not exists signup_source        text;
alter table public.judges add column if not exists referred_by          text;
alter table public.judges add column if not exists confirmation_sent_at timestamptz;

alter table public.judges add column if not exists background_check_status text
  check (background_check_status in ('not_required','requested','cleared','expired'));
alter table public.judges add column if not exists background_check_date date;

create index if not exists judges_code_idx        on public.judges (code);
create index if not exists judges_referred_by_idx on public.judges (referred_by);
create index if not exists judges_source_idx      on public.judges (signup_source);
create index if not exists judges_email_lower_idx on public.judges (lower(trim(email)));

comment on column public.judges.available_months is
  'Three-letter month names the judge is free to judge (Jan..Dec). Empty means they did not say.';
comment on column public.judges.preferred_grade_bands is
  'elementary (K-5), middle (6-8), high (9-12).';
comment on column public.judges.referred_by is
  'The code of the judge whose referral link this person signed up through (volunteer.html?ref=CODE).';
comment on column public.judges.signup_source is
  'The ?src= tag on the link they arrived by, e.g. TX-ACS. Set it per outreach channel to see which ones work.';


-- ---------------------------------------------------------------------
-- PART 2 - DUPLICATE CHECK
-- ---------------------------------------------------------------------
-- The signup form calls this before writing anything, so a second
-- application from the same address gets a clear "you already applied"
-- instead of a second row. It returns only true/false and needs no read
-- access to judges.

create or replace function public.fg_judge_email_exists(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.judges
    where lower(trim(email)) = lower(trim(p_email))
  );
$$;

grant execute on function public.fg_judge_email_exists(text) to anon, authenticated;

-- A hard guarantee as well, when the table is already clean. If it is
-- not, this says how many addresses are doubled; the admin Judge Network
-- marks them with a "Duplicate" chip so they can be merged by hand, and
-- re-running this file afterwards adds the index.
do $$
declare v_dupes integer;
begin
  select count(*) into v_dupes from (
    select lower(trim(email)) from public.judges
    where email is not null
    group by 1 having count(*) > 1
  ) d;
  if v_dupes = 0 then
    create unique index if not exists judges_email_unique_idx on public.judges (lower(trim(email)));
    raise notice 'FairGame: judges.email is now unique.';
  else
    raise notice 'FairGame: % email address(es) appear on more than one judge. Clean them up in the admin Judge Network, then run this migration again to make email unique.', v_dupes;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- PART 3 - REFERRAL COUNT FOR THE SIGNED-IN JUDGE
-- ---------------------------------------------------------------------
-- The judge portal shows "N people have signed up with your link". A
-- judge cannot read other judges' rows, so the count comes from here.

create or replace function public.fg_my_referral_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.judges r
  where r.referred_by is not null
    and r.referred_by in (
      select j.code from public.judges j
      join auth.users u on lower(trim(u.email)) = lower(trim(j.email))
      where u.id = auth.uid() and j.code is not null
    );
$$;

grant execute on function public.fg_my_referral_count() to authenticated;


-- ---------------------------------------------------------------------
-- PART 4 - CONFIRMATION EMAIL
-- ---------------------------------------------------------------------
-- Sent by the Edge Function in supabase/functions/judge-confirmation,
-- which stamps confirmation_sent_at. See the README in that folder for
-- the two commands that deploy it.


-- ---------------------------------------------------------------------
-- PART 5 - LET THE MATCHER USE WHAT THE FORM ALREADY COLLECTED
-- ---------------------------------------------------------------------
-- fg_match_judge_fairs reads preferred_levels, which the old form never
-- filled, so every judge was matched to every level and flagged for
-- research. The form now writes it; this back-fills older rows from
-- their available_level answer where it maps cleanly.

update public.judges
set preferred_levels = case available_level
    when 'School fair'   then array['school']
    when 'District fair' then array['district','regional']
    when 'State fair'    then array['state']
    when 'Any level'     then array['school','district','regional','state']
  end
where (preferred_levels is null or array_length(preferred_levels, 1) is null)
  and available_level in ('School fair','District fair','State fair','Any level');
