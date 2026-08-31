-- =====================================================================
-- FairGame Initiative
-- Migration 01: Fair Directory, Judge Outreach, and Fair Manager
-- Run in Supabase SQL Editor. Safe to run more than once.
-- Prepared: August 2026
-- =====================================================================
--
-- WHAT THIS ADDS
--   1. A directory of real science fairs (state, regional, district, school)
--   2. Contact records for the people who run those fairs
--   3. A scraper pipeline that proposes changes for human review
--   4. Bulk email campaigns filtered by state, with per-recipient tracking
--   5. A fair manager role with plans, tasks, budgets, and volunteers
--
-- WHAT THIS DOES NOT DO
--   It does not drop or alter your existing 12 tables except to add
--   columns to `judges`. Nothing already in the database is removed.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- =====================================================================
-- PART 0a - SHAPE HELPERS FOR THE EXISTING judges TABLE
-- =====================================================================
-- The live judges table stores some fields as arrays and some as plain
-- text, and the two shapes cannot be compared with the same operator.
-- fg_text_array() normalizes either one into text[] so every query below
-- works without anyone having to remember which is which.
--
--   text          'Biology'              -> {Biology}
--   text[]        {Biology,Chemistry}    -> {Biology,Chemistry}
--   null          null                   -> null
--
-- Call it as: public.fg_text_array(to_jsonb(j.expertise))

create or replace function public.fg_text_array(v jsonb)
returns text[]
language sql immutable as $$
  select case
    when v is null then null
    when jsonb_typeof(v) = 'null'  then null
    when jsonb_typeof(v) = 'array' then array(select jsonb_array_elements_text(v))
    else array[v #>> '{}']
  end;
$$;

-- CONFIRMED SHAPE OF THE LIVE judges TABLE, checked August 31, 2026
--   id uuid | name text | email text | org text | city text
--   expertise text[] | available_level text | status text | notes text
--   created_at timestamptz | county text | travel_range text
--   travel_miles integer
--
-- Everything below uses those names. Two of them are the pre-existing
-- free-text answers from the signup form, available_level and
-- travel_range, and they are kept rather than overwritten. The new
-- structured fields sit beside them and the profile page asks a person
-- to translate one into the other.
--
-- Print what the table actually looks like, so a mismatch shows up as a
-- readable notice instead of a type error 400 lines later.
do $$
declare r record; v_line text := '';
begin
  for r in
    select column_name, data_type
    from information_schema.columns
    where table_schema = 'public' and table_name = 'judges'
    order by ordinal_position
  loop
    v_line := v_line || r.column_name || ' ' || r.data_type || ' | ';
  end loop;
  if v_line = '' then
    raise notice 'FairGame: no judges table found. Run supabase-schema.sql first.';
  else
    raise notice 'FairGame: judges columns -> %', v_line;
  end if;
end $$;

-- =====================================================================
-- PART 0 - ROLE HANDLING (READ THIS FIRST)
-- =====================================================================
-- Your Operations Guide stores role in Supabase user_metadata, for
-- example { "role": "admin" }. A signed-in user can rewrite their own
-- user_metadata from the browser with supabase.auth.updateUser(). Any
-- policy that trusts user_metadata can be bypassed by the user it is
-- meant to restrict. The table below moves role into data only the
-- service key can write.
--
-- After running this migration, insert yourself:
--   insert into public.user_roles (user_id, role, full_name)
--   values ('<your-auth-uid>', 'admin', 'Kyla Fallis');
--
-- Allowed roles are admin, teacher, ambassador, judge, fair_manager,
-- student, parent, and inactive. Only the first five reach a portal.
-- Students and parents hold an account without access to any of the
-- tables this migration creates.
-- =====================================================================

create table if not exists public.user_roles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        text not null,
  full_name   text,
  state_code  char(2),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The allowed role list is set here rather than inline, because
-- CREATE TABLE IF NOT EXISTS will not touch a constraint that already
-- exists. Dropping and re-adding lets this script widen the list on a
-- table built by an earlier run.
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('admin','teacher','ambassador','judge',
                  'fair_manager','student','parent','inactive'));

alter table public.user_roles enable row level security;

create or replace function public.fg_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_roles where user_id = auth.uid();
$$;

create or replace function public.fg_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.fg_role() = 'admin', false);
$$;

create or replace function public.fg_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.fg_role() in ('admin','teacher','fair_manager'), false);
$$;

drop policy if exists "user_roles_self_read" on public.user_roles;
create policy "user_roles_self_read" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.fg_is_admin());

drop policy if exists "user_roles_admin_write" on public.user_roles;
create policy "user_roles_admin_write" on public.user_roles
  for all to authenticated
  using (public.fg_is_admin())
  with check (public.fg_is_admin());

-- Shared updated_at trigger
create or replace function public.fg_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =====================================================================
-- PART 1 - THE FAIR DIRECTORY
-- =====================================================================

create table if not exists public.fair_events (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text unique not null,
  name                  text not null,
  short_name            text,
  level                 text not null check (level in
                          ('school','district','regional','state','national','international')),
  state_code            char(2) not null,
  host_org              text,
  venue_name            text,
  venue_address         text,
  city                  text,
  county                text,
  postal_code           text,
  latitude              numeric(9,6),
  longitude             numeric(9,6),

  counties_served       text[] default '{}',
  grade_min             smallint,
  grade_max             smallint,
  divisions             text[] default '{}',

  event_start_date      date,
  event_end_date        date,
  judging_date          date,
  judging_start_time    time,
  judging_end_time      time,
  awards_date           date,
  schedule_note         text,

  registration_opens    date,
  registration_deadline date,
  payment_deadline      date,
  fee_note              text,

  isef_affiliate        boolean not null default false,
  advances_to_id        uuid references public.fair_events(id) on delete set null,
  registration_platform text,

  website_url           text,
  registration_url      text,
  judge_signup_url      text,
  rules_url             text,

  judges_needed         boolean not null default true,
  judges_needed_count   integer,
  judging_format        text check (judging_format in ('in_person','virtual','hybrid')),

  -- Provenance. Every row must be able to answer "how do we know this?"
  source_url            text not null,
  verification_status   text not null default 'lead'
                          check (verification_status in ('verified','lead','stale','retired')),
  last_verified_at      timestamptz,
  verified_by           text,
  cycle_year            smallint,
  notes                 text,

  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists fair_events_state_idx        on public.fair_events (state_code);
create index if not exists fair_events_level_idx        on public.fair_events (level);
create index if not exists fair_events_start_idx        on public.fair_events (event_start_date);
create index if not exists fair_events_status_idx       on public.fair_events (verification_status);
create index if not exists fair_events_counties_gin     on public.fair_events using gin (counties_served);

drop trigger if exists fair_events_touch on public.fair_events;
create trigger fair_events_touch before update on public.fair_events
  for each row execute function public.fg_touch_updated_at();

create table if not exists public.fair_contacts (
  id                  uuid primary key default gen_random_uuid(),
  fair_id             uuid not null references public.fair_events(id) on delete cascade,
  full_name           text,
  title               text,
  contact_role        text not null default 'general' check (contact_role in
                        ('director','coordinator','judging_chair','general',
                         'events','stem_supervisor','sponsorship','media')),
  email               citext,
  phone               text,
  mailing_address     text,
  is_primary          boolean not null default false,
  do_not_contact      boolean not null default false,
  source_url          text,
  verification_status text not null default 'lead'
                        check (verification_status in ('verified','lead','stale','retired')),
  last_verified_at    timestamptz,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists fair_contacts_fair_idx  on public.fair_contacts (fair_id);
create index if not exists fair_contacts_email_idx on public.fair_contacts (email);

drop trigger if exists fair_contacts_touch on public.fair_contacts;
create trigger fair_contacts_touch before update on public.fair_contacts
  for each row execute function public.fg_touch_updated_at();

-- Key dates that are not the fair itself: intent forms, SRC deadlines,
-- judge signup windows, payment cutoffs.
create table if not exists public.fair_deadlines (
  id            uuid primary key default gen_random_uuid(),
  fair_id       uuid not null references public.fair_events(id) on delete cascade,
  label         text not null,
  due_date      date not null,
  due_time      time,
  audience      text not null default 'student' check (audience in
                  ('student','teacher','judge','school','public')),
  detail_url    text,
  source_url    text,
  created_at    timestamptz not null default now()
);

create index if not exists fair_deadlines_fair_idx on public.fair_deadlines (fair_id);
create index if not exists fair_deadlines_due_idx  on public.fair_deadlines (due_date);

-- =====================================================================
-- PART 2 - JUDGE TABLE ADDITIONS
-- =====================================================================
-- Your judges table is Ohio-shaped today. These columns let it hold
-- four states and drive an opt-in mailing list.

-- Columns the live table already has. Declared here with IF NOT EXISTS
-- so this script never depends on something it did not confirm.
alter table public.judges add column if not exists org text;
alter table public.judges add column if not exists city text;
alter table public.judges add column if not exists county text;
alter table public.judges add column if not exists notes text;
alter table public.judges add column if not exists available_level text;
alter table public.judges add column if not exists travel_range text;
alter table public.judges add column if not exists travel_miles integer;

-- New columns.
-- travel_miles is the existing distance field and stays the single source
-- of truth. No second mileage column is created.
alter table public.judges add column if not exists state_code char(2);
alter table public.judges add column if not exists postal_code text;
alter table public.judges add column if not exists preferred_levels text[] default '{}';
alter table public.judges add column if not exists preferred_grade_bands text[] default '{}';
alter table public.judges add column if not exists virtual_ok boolean default false;
alter table public.judges add column if not exists email_opt_in boolean not null default true;
alter table public.judges add column if not exists unsubscribe_token uuid not null default gen_random_uuid();
alter table public.judges add column if not exists last_emailed_at timestamptz;
alter table public.judges add column if not exists times_served integer not null default 0;

create index if not exists judges_state_idx  on public.judges (state_code);
create index if not exists judges_optin_idx  on public.judges (email_opt_in);
create unique index if not exists judges_unsub_token_idx on public.judges (unsubscribe_token);

-- Backfill Ohio for existing rows, since the pilot ran in Ohio.
update public.judges set state_code = 'OH' where state_code is null;

-- Which fairs a judge has raised a hand for
create table if not exists public.judge_fair_interests (
  id          uuid primary key default gen_random_uuid(),
  judge_id    uuid not null references public.judges(id) on delete cascade,
  fair_id     uuid not null references public.fair_events(id) on delete cascade,
  status      text not null default 'interested' check (status in
                ('interested','invited','confirmed','declined','served','no_show')),
  source      text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (judge_id, fair_id)
);

drop trigger if exists judge_fair_interests_touch on public.judge_fair_interests;
create trigger judge_fair_interests_touch before update on public.judge_fair_interests
  for each row execute function public.fg_touch_updated_at();

-- =====================================================================
-- PART 3 - SCRAPER PIPELINE
-- =====================================================================
-- Design rule: the scraper never writes to fair_events directly. It
-- writes proposals to fair_scrape_changes and an admin approves them.
-- A bad parse should never quietly replace a verified phone number.

create table if not exists public.fair_scrape_sources (
  id                uuid primary key default gen_random_uuid(),
  label             text not null,
  url               text not null,
  state_code        char(2),
  fair_id           uuid references public.fair_events(id) on delete set null,
  source_kind       text not null default 'fair_page' check (source_kind in
                      ('fair_page','directory','pdf','calendar','sitemap')),
  parser_key        text not null default 'generic',
  check_frequency   text not null default 'monthly'
                      check (check_frequency in ('weekly','monthly','quarterly')),
  active            boolean not null default true,
  last_checked_at   timestamptz,
  last_http_status  integer,
  last_status       text check (last_status in ('ok','changed','error','blocked','not_found')),
  last_error        text,
  content_hash      text,
  consecutive_errors integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists scrape_sources_state_idx  on public.fair_scrape_sources (state_code);
create index if not exists scrape_sources_active_idx on public.fair_scrape_sources (active);

drop trigger if exists scrape_sources_touch on public.fair_scrape_sources;
create trigger scrape_sources_touch before update on public.fair_scrape_sources
  for each row execute function public.fg_touch_updated_at();

create table if not exists public.fair_scrape_runs (
  id               uuid primary key default gen_random_uuid(),
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  trigger_type     text not null default 'cron' check (trigger_type in ('cron','manual','backfill')),
  states_targeted  text[] default '{}',
  sources_checked  integer not null default 0,
  sources_changed  integer not null default 0,
  sources_errored  integer not null default 0,
  changes_proposed integer not null default 0,
  runner_note      text,
  summary          jsonb
);

create index if not exists scrape_runs_started_idx on public.fair_scrape_runs (started_at desc);

create table if not exists public.fair_scrape_changes (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references public.fair_scrape_runs(id) on delete cascade,
  source_id      uuid references public.fair_scrape_sources(id) on delete set null,
  fair_id        uuid references public.fair_events(id) on delete cascade,
  change_type    text not null check (change_type in
                   ('new_fair','field_update','date_change','contact_change',
                    'deadline_change','dead_link','fair_retired')),
  field_name     text,
  old_value      text,
  new_value      text,
  confidence     numeric(3,2) not null default 0.50,
  evidence_url   text,
  evidence_snippet text,
  proposed_payload jsonb,
  review_status  text not null default 'pending'
                   check (review_status in ('pending','approved','rejected','superseded')),
  reviewed_by    uuid references auth.users(id) on delete set null,
  reviewed_at    timestamptz,
  applied_at     timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists scrape_changes_review_idx on public.fair_scrape_changes (review_status);
create index if not exists scrape_changes_run_idx    on public.fair_scrape_changes (run_id);
create index if not exists scrape_changes_fair_idx   on public.fair_scrape_changes (fair_id);

-- =====================================================================
-- PART 4 - BULK EMAIL BY STATE
-- =====================================================================

create table if not exists public.email_templates (
  id            uuid primary key default gen_random_uuid(),
  key           text unique not null,
  name          text not null,
  audience      text not null check (audience in
                  ('judge','fair_director','district_coordinator','teacher','principal','sponsor')),
  subject       text not null,
  body_markdown text not null,
  merge_fields  text[] default '{}',
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists email_templates_touch on public.email_templates;
create trigger email_templates_touch before update on public.email_templates
  for each row execute function public.fg_touch_updated_at();

create table if not exists public.email_campaigns (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  template_key     text references public.email_templates(key) on delete set null,
  audience         text not null default 'judge' check (audience in
                     ('judge','fair_director','district_coordinator','teacher','principal','sponsor')),
  subject          text not null,
  body_markdown    text not null,
  from_name        text not null default 'FairGame Initiative',
  from_email       text not null default 'judges@fairgameinitiative.org',
  reply_to         text not null default 'fairgameinitiative@outlook.com',

  audience_state   char(2),
  related_fair_id  uuid references public.fair_events(id) on delete set null,
  audience_filter  jsonb not null default '{}'::jsonb,

  status           text not null default 'draft' check (status in
                     ('draft','review','approved','sending','sent','cancelled','failed')),
  created_by       uuid references auth.users(id) on delete set null,
  approved_by      uuid references auth.users(id) on delete set null,
  scheduled_for    timestamptz,
  started_at       timestamptz,
  sent_at          timestamptz,

  recipient_count  integer not null default 0,
  sent_count       integer not null default 0,
  failed_count     integer not null default 0,
  skipped_count    integer not null default 0,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists email_campaigns_state_idx  on public.email_campaigns (audience_state);
create index if not exists email_campaigns_status_idx on public.email_campaigns (status);

drop trigger if exists email_campaigns_touch on public.email_campaigns;
create trigger email_campaigns_touch before update on public.email_campaigns
  for each row execute function public.fg_touch_updated_at();

create table if not exists public.email_campaign_recipients (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references public.email_campaigns(id) on delete cascade,
  judge_id          uuid references public.judges(id) on delete set null,
  fair_contact_id   uuid references public.fair_contacts(id) on delete set null,
  email             citext not null,
  full_name         text,
  merge_data        jsonb not null default '{}'::jsonb,
  status            text not null default 'queued' check (status in
                      ('queued','approved','skipped','sent','failed','bounced','complained')),
  skip_reason       text,
  provider_message_id text,
  sent_at           timestamptz,
  error_text        text,
  created_at        timestamptz not null default now(),
  unique (campaign_id, email)
);

create index if not exists campaign_recipients_campaign_idx on public.email_campaign_recipients (campaign_id);
create index if not exists campaign_recipients_status_idx   on public.email_campaign_recipients (status);

create table if not exists public.email_suppressions (
  email       citext primary key,
  reason      text not null check (reason in
                ('unsubscribed','bounced','complaint','manual','invalid')),
  source      text,
  created_at  timestamptz not null default now()
);

-- Recipient builder. Admin calls this to preview a send before creating it.
-- Expertise and county are normalized through fg_text_array, so this
-- works whether the live column holds one value or several.
create or replace function public.fg_preview_judge_recipients(
  p_state       char(2),
  p_expertise   text[] default null,
  p_counties    text[] default null,
  p_verified_only boolean default true
)
returns table (
  judge_id   uuid,
  full_name  text,
  email      citext,
  county     text,
  expertise  text
)
language sql
stable
security definer
set search_path = public
as $$
  select j.id,
         j.name,
         j.email::citext,
         array_to_string(public.fg_text_array(to_jsonb(j.county)), ' / '),
         array_to_string(public.fg_text_array(to_jsonb(j.expertise)), ', ')
  from public.judges j
  where public.fg_is_admin()
    and j.state_code = p_state
    and coalesce(j.email_opt_in, true) = true
    and j.email is not null
    and (p_verified_only is false or j.status = 'active')
    and (p_expertise is null
         or public.fg_text_array(to_jsonb(j.expertise)) && p_expertise)
    and (p_counties is null
         or public.fg_text_array(to_jsonb(j.county)) && p_counties)
    and not exists (
      select 1 from public.email_suppressions s where s.email = j.email::citext
    )
  order by 4 nulls last, j.name;
$$;

-- =====================================================================
-- PART 5 - FAIR MANAGER
-- =====================================================================
-- A fair manager is anyone running a fair who is not the classroom
-- teacher: a PTA parent, a district STEM coordinator, a librarian, a
-- county office staffer, a nonprofit partner. They plan the event.
-- They never see student records.

create table if not exists public.fair_plans (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users(id) on delete cascade,
  fair_name          text not null,
  organization       text,
  organization_type  text check (organization_type in
                       ('school','district','pta','library','museum','nonprofit',
                        'county_office','university','company','other')),
  level              text not null default 'school' check (level in ('school','district','regional')),
  state_code         char(2) not null,
  county             text,
  city               text,
  venue_name         text,
  target_date        date,
  setup_date         date,
  expected_projects  integer,
  expected_students  integer,
  grade_min          smallint,
  grade_max          smallint,
  judges_needed      integer,
  judges_confirmed   integer not null default 0,
  budget_total       numeric(10,2),
  advances_to_id     uuid references public.fair_events(id) on delete set null,
  status             text not null default 'planning' check (status in
                       ('planning','scheduled','complete','cancelled')),
  public_listing     boolean not null default false,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists fair_plans_owner_idx on public.fair_plans (owner_id);
create index if not exists fair_plans_state_idx on public.fair_plans (state_code);

drop trigger if exists fair_plans_touch on public.fair_plans;
create trigger fair_plans_touch before update on public.fair_plans
  for each row execute function public.fg_touch_updated_at();

create table if not exists public.fair_plan_tasks (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.fair_plans(id) on delete cascade,
  phase         text not null,
  title         text not null,
  description   text,
  months_before smallint,
  due_date      date,
  owner_name    text,
  status        text not null default 'todo' check (status in ('todo','doing','done','skipped')),
  resource_key  text,
  sort_order    integer not null default 0,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists plan_tasks_plan_idx on public.fair_plan_tasks (plan_id, sort_order);

drop trigger if exists plan_tasks_touch on public.fair_plan_tasks;
create trigger plan_tasks_touch before update on public.fair_plan_tasks
  for each row execute function public.fg_touch_updated_at();

create table if not exists public.fair_plan_budget_lines (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.fair_plans(id) on delete cascade,
  category    text not null,
  item        text not null,
  quantity    numeric(10,2) not null default 1,
  unit_cost   numeric(10,2) not null default 0,
  actual_cost numeric(10,2),
  funded_by   text,
  notes       text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists plan_budget_plan_idx on public.fair_plan_budget_lines (plan_id);

create table if not exists public.fair_plan_volunteers (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.fair_plans(id) on delete cascade,
  full_name   text not null,
  email       citext,
  phone       text,
  volunteer_role text not null default 'judge' check (volunteer_role in
                  ('judge','setup','check_in','runner','awards','teardown',
                   'hospitality','photography','sponsor_liaison','safety')),
  shift_note  text,
  status      text not null default 'invited' check (status in
                ('invited','confirmed','declined','attended','no_show')),
  judge_id    uuid references public.judges(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists plan_volunteers_plan_idx on public.fair_plan_volunteers (plan_id);

drop trigger if exists plan_volunteers_touch on public.fair_plan_volunteers;
create trigger plan_volunteers_touch before update on public.fair_plan_volunteers
  for each row execute function public.fg_touch_updated_at();

-- Template rows copied into every new plan
create table if not exists public.fair_plan_task_templates (
  id            uuid primary key default gen_random_uuid(),
  level         text not null default 'school',
  phase         text not null,
  title         text not null,
  description   text,
  months_before smallint not null,
  resource_key  text,
  sort_order    integer not null default 0
);

create or replace function public.fg_seed_plan_tasks(p_plan_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target date;
  v_level  text;
  v_count  integer;
begin
  select target_date, level into v_target, v_level
  from public.fair_plans where id = p_plan_id;

  insert into public.fair_plan_tasks
    (plan_id, phase, title, description, months_before, due_date, resource_key, sort_order)
  select p_plan_id, t.phase, t.title, t.description, t.months_before,
         case when v_target is null then null
              else (v_target - (t.months_before || ' months')::interval)::date end,
         t.resource_key, t.sort_order
  from public.fair_plan_task_templates t
  where t.level = coalesce(v_level, 'school');

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- =====================================================================
-- PART 6 - ROW LEVEL SECURITY
-- =====================================================================

alter table public.fair_events              enable row level security;
alter table public.fair_contacts            enable row level security;
alter table public.fair_deadlines           enable row level security;
alter table public.judge_fair_interests     enable row level security;
alter table public.fair_scrape_sources      enable row level security;
alter table public.fair_scrape_runs         enable row level security;
alter table public.fair_scrape_changes      enable row level security;
alter table public.email_templates          enable row level security;
alter table public.email_campaigns          enable row level security;
alter table public.email_campaign_recipients enable row level security;
alter table public.email_suppressions       enable row level security;
alter table public.fair_plans               enable row level security;
alter table public.fair_plan_tasks          enable row level security;
alter table public.fair_plan_budget_lines   enable row level security;
alter table public.fair_plan_volunteers     enable row level security;
alter table public.fair_plan_task_templates enable row level security;

-- Fair events: anyone may read verified, active fairs. This powers the
-- public fair finder and the judge information tab.
drop policy if exists "fair_events_public_read" on public.fair_events;
create policy "fair_events_public_read" on public.fair_events
  for select to anon, authenticated
  using (active = true and verification_status in ('verified','stale'));

drop policy if exists "fair_events_admin_all" on public.fair_events;
create policy "fair_events_admin_all" on public.fair_events
  for all to authenticated
  using (public.fg_is_admin()) with check (public.fg_is_admin());

-- Fair contacts: signed-in only. These are working email addresses of
-- real people. Publishing them to anonymous visitors invites scraping.
drop policy if exists "fair_contacts_auth_read" on public.fair_contacts;
create policy "fair_contacts_auth_read" on public.fair_contacts
  for select to authenticated
  using (do_not_contact = false);

drop policy if exists "fair_contacts_admin_all" on public.fair_contacts;
create policy "fair_contacts_admin_all" on public.fair_contacts
  for all to authenticated
  using (public.fg_is_admin()) with check (public.fg_is_admin());

drop policy if exists "fair_deadlines_public_read" on public.fair_deadlines;
create policy "fair_deadlines_public_read" on public.fair_deadlines
  for select to anon, authenticated using (true);

drop policy if exists "fair_deadlines_admin_all" on public.fair_deadlines;
create policy "fair_deadlines_admin_all" on public.fair_deadlines
  for all to authenticated
  using (public.fg_is_admin()) with check (public.fg_is_admin());

-- Judge interests: a judge manages their own rows, admins see all.
drop policy if exists "judge_interests_own" on public.judge_fair_interests;
create policy "judge_interests_own" on public.judge_fair_interests
  for all to authenticated
  using (
    public.fg_is_admin()
    or exists (select 1 from public.judges j
               where j.id = judge_id and j.email::citext = (auth.jwt() ->> 'email')::citext)
  )
  with check (
    public.fg_is_admin()
    or exists (select 1 from public.judges j
               where j.id = judge_id and j.email::citext = (auth.jwt() ->> 'email')::citext)
  );

-- Scraper tables: admin read, service key writes (service key bypasses RLS).
drop policy if exists "scrape_sources_admin" on public.fair_scrape_sources;
create policy "scrape_sources_admin" on public.fair_scrape_sources
  for all to authenticated using (public.fg_is_admin()) with check (public.fg_is_admin());

drop policy if exists "scrape_runs_admin" on public.fair_scrape_runs;
create policy "scrape_runs_admin" on public.fair_scrape_runs
  for all to authenticated using (public.fg_is_admin()) with check (public.fg_is_admin());

drop policy if exists "scrape_changes_admin" on public.fair_scrape_changes;
create policy "scrape_changes_admin" on public.fair_scrape_changes
  for all to authenticated using (public.fg_is_admin()) with check (public.fg_is_admin());

-- Email tables: admin only, no exceptions.
drop policy if exists "email_templates_admin" on public.email_templates;
create policy "email_templates_admin" on public.email_templates
  for all to authenticated using (public.fg_is_admin()) with check (public.fg_is_admin());

drop policy if exists "email_campaigns_admin" on public.email_campaigns;
create policy "email_campaigns_admin" on public.email_campaigns
  for all to authenticated using (public.fg_is_admin()) with check (public.fg_is_admin());

drop policy if exists "campaign_recipients_admin" on public.email_campaign_recipients;
create policy "campaign_recipients_admin" on public.email_campaign_recipients
  for all to authenticated using (public.fg_is_admin()) with check (public.fg_is_admin());

drop policy if exists "suppressions_admin" on public.email_suppressions;
create policy "suppressions_admin" on public.email_suppressions
  for all to authenticated using (public.fg_is_admin()) with check (public.fg_is_admin());

-- Anonymous unsubscribe writes are handled by an Edge Function using the
-- service key, so no anon insert policy is granted here.

-- Fair plans: owner reads and writes their own, admin sees all.
drop policy if exists "fair_plans_owner" on public.fair_plans;
create policy "fair_plans_owner" on public.fair_plans
  for all to authenticated
  using (owner_id = auth.uid() or public.fg_is_admin())
  with check (owner_id = auth.uid() or public.fg_is_admin());

drop policy if exists "plan_tasks_owner" on public.fair_plan_tasks;
create policy "plan_tasks_owner" on public.fair_plan_tasks
  for all to authenticated
  using (exists (select 1 from public.fair_plans p
                 where p.id = plan_id and (p.owner_id = auth.uid() or public.fg_is_admin())))
  with check (exists (select 1 from public.fair_plans p
                 where p.id = plan_id and (p.owner_id = auth.uid() or public.fg_is_admin())));

drop policy if exists "plan_budget_owner" on public.fair_plan_budget_lines;
create policy "plan_budget_owner" on public.fair_plan_budget_lines
  for all to authenticated
  using (exists (select 1 from public.fair_plans p
                 where p.id = plan_id and (p.owner_id = auth.uid() or public.fg_is_admin())))
  with check (exists (select 1 from public.fair_plans p
                 where p.id = plan_id and (p.owner_id = auth.uid() or public.fg_is_admin())));

drop policy if exists "plan_volunteers_owner" on public.fair_plan_volunteers;
create policy "plan_volunteers_owner" on public.fair_plan_volunteers
  for all to authenticated
  using (exists (select 1 from public.fair_plans p
                 where p.id = plan_id and (p.owner_id = auth.uid() or public.fg_is_admin())))
  with check (exists (select 1 from public.fair_plans p
                 where p.id = plan_id and (p.owner_id = auth.uid() or public.fg_is_admin())));

drop policy if exists "plan_templates_read" on public.fair_plan_task_templates;
create policy "plan_templates_read" on public.fair_plan_task_templates
  for select to authenticated using (true);

drop policy if exists "plan_templates_admin" on public.fair_plan_task_templates;
create policy "plan_templates_admin" on public.fair_plan_task_templates
  for all to authenticated using (public.fg_is_admin()) with check (public.fg_is_admin());

-- =====================================================================
-- PART 7 - HELPER VIEWS
-- =====================================================================

drop view if exists public.v_upcoming_fair_deadlines;
create view public.v_upcoming_fair_deadlines as
select f.id as fair_id, f.name as fair_name, f.state_code, f.level,
       d.label, d.due_date, d.audience, d.detail_url
from public.fair_deadlines d
join public.fair_events f on f.id = d.fair_id
where d.due_date >= current_date
  and f.active = true
order by d.due_date;

drop view if exists public.v_state_fair_counts;
create view public.v_state_fair_counts as
select state_code,
       count(*) filter (where level = 'state')     as state_fairs,
       count(*) filter (where level = 'regional')  as regional_fairs,
       count(*) filter (where level = 'district')  as district_fairs,
       count(*) filter (where level = 'school')    as school_fairs,
       count(*) filter (where verification_status = 'verified') as verified_rows,
       count(*) filter (where verification_status = 'lead')     as lead_rows,
       max(last_verified_at) as most_recent_check
from public.fair_events
where active = true
group by state_code
order by state_code;

drop view if exists public.v_judge_coverage_by_state;
create view public.v_judge_coverage_by_state as
select coalesce(j.state_code, 'ZZ') as state_code,
       count(*)                                        as judges_total,
       count(*) filter (where j.email_opt_in)          as judges_mailable,
       count(distinct j.county)                        as counties_covered
from public.judges j
group by 1
order by 1;

-- =====================================================================
-- END MIGRATION 01
-- =====================================================================
