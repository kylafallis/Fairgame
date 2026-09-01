-- =====================================================================
-- FairGame Initiative
-- Migration 05: Reconcile with the live database
-- Run after 01, 02, 03, and 04. Safe to run more than once.
-- =====================================================================
--
-- WHY THIS EXISTS
--   The first four migrations were written before the live schema was
--   read end to end. Four things turned up that they did not account for.
--
--   1. user_roles rejects the role 'student', which real accounts use.
--   2. judges.travel_miles defaults to 10, so the "no travel distance"
--      research flag could never fire and every unreviewed judge was
--      silently scored on a 10 mile radius.
--   3. judges.status defaults to 'active', so the "active judges only"
--      filter on a campaign excluded nobody. profile_status is the real
--      review gate and the filter should use it.
--   4. The fairs table already holds school fairs registered by
--      teachers, and nothing connected them to the directory. A judge
--      could never be matched to a FairGame school fair, which is the
--      one kind of fair this organization exists to create.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PART 1 - ROLES THAT ACTUALLY EXIST
-- ---------------------------------------------------------------------

alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('admin','teacher','ambassador','judge',
                  'fair_manager','student','parent','inactive'));

-- Copy roles out of user metadata. Anything unrecognized parks as
-- inactive rather than stopping the run, and the review query below
-- makes those visible.
insert into public.user_roles (user_id, role, full_name)
select id,
       case when coalesce(raw_user_meta_data->>'role','') in
                 ('admin','teacher','ambassador','judge','fair_manager','student','parent')
            then raw_user_meta_data->>'role'
            else 'inactive' end,
       raw_user_meta_data->>'name'
from auth.users
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------
-- PART 2 - TRAVEL DISTANCE
-- ---------------------------------------------------------------------
-- travel_miles carries a default of 10. A defaulted 10 and a deliberate
-- 10 are indistinguishable, so this column records which one it is.

alter table public.judges add column if not exists travel_miles_confirmed boolean not null default false;

-- Anyone who already differs from the default clearly had it set on purpose.
update public.judges
set travel_miles_confirmed = true
where travel_miles is not null and travel_miles <> 10 and travel_miles_confirmed = false;

comment on column public.judges.travel_miles_confirmed is
  'True once a person has confirmed the mileage. False means the row may still be carrying the default of 10.';

-- ---------------------------------------------------------------------
-- PART 3 - PUBLIC LISTING SEPARATE FROM VERIFICATION
-- ---------------------------------------------------------------------
-- A school fair a teacher registers is real, so calling it unverified to
-- keep it off the public page would be dishonest. This column carries
-- that decision instead.

alter table public.fair_events add column if not exists public_listing boolean not null default true;

comment on column public.fair_events.public_listing is
  'True for the regional and state directory. False for a school fair, which signed-in users see and anonymous visitors do not.';

-- ---------------------------------------------------------------------
-- PART 4 - SCHOOL FAIRS ENTER THE DIRECTORY
-- ---------------------------------------------------------------------

alter table public.fairs add column if not exists state_code char(2) not null default 'OH';
alter table public.fairs add column if not exists list_publicly boolean not null default false;
alter table public.fairs add column if not exists fair_event_id uuid
  references public.fair_events(id) on delete set null;

create or replace function public.fg_slugify(v text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(coalesce(v,'')), '[^a-z0-9]+', '-', 'g'));
$$;

-- Creates or refreshes the directory entry for one registered school fair.
create or replace function public.fg_sync_school_fair(p_fair_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare f record; v_event uuid; v_slug text;
begin
  select * into f from public.fairs where id = p_fair_id;
  if not found then return null; end if;

  v_slug := 'school-' || left(public.fg_slugify(f.school_name), 40) || '-' ||
            coalesce(to_char(f.fair_date, 'YYYY'), 'tbd') || '-' || left(f.id::text, 8);

  if f.fair_event_id is not null then
    update public.fair_events
    set name             = f.school_name || ' Science Fair',
        city             = f.city,
        county           = f.county,
        state_code       = f.state_code,
        event_start_date = f.fair_date,
        judging_date     = f.fair_date,
        public_listing   = f.list_publicly,
        active           = (f.status <> 'cancelled'),
        last_verified_at = now(),
        notes            = 'Registered through the FairGame teacher portal by ' || f.teacher_name || '.'
    where id = f.fair_event_id
    returning id into v_event;
  else
    insert into public.fair_events
      (slug, name, level, state_code, host_org, city, county,
       event_start_date, judging_date, judges_needed, public_listing, active,
       source_url, verification_status, last_verified_at, verified_by, notes)
    values
      (v_slug, f.school_name || ' Science Fair', 'school', f.state_code,
       f.school_name, f.city, f.county, f.fair_date, f.fair_date,
       true, f.list_publicly, (f.status <> 'cancelled'),
       'https://fairgameinitiative.org/portal-teacher.html', 'verified', now(),
       f.teacher_name,
       'Registered through the FairGame teacher portal by ' || f.teacher_name || '.')
    on conflict (slug) do update
      set name = excluded.name, city = excluded.city, county = excluded.county,
          event_start_date = excluded.event_start_date, last_verified_at = now()
    returning id into v_event;

    update public.fairs set fair_event_id = v_event where id = f.id;
  end if;

  return v_event;
end;
$$;

create or replace function public.fg_fairs_sync_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.fg_sync_school_fair(new.id);
  return new;
end;
$$;

drop trigger if exists fairs_sync_directory on public.fairs;
create trigger fairs_sync_directory
  after insert or update of school_name, city, county, fair_date, status, state_code, list_publicly
  on public.fairs
  for each row execute function public.fg_fairs_sync_trigger();

-- Backfill every school fair already registered.
do $$
declare r record;
begin
  for r in select id from public.fairs where fair_event_id is null loop
    perform public.fg_sync_school_fair(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- PART 5 - FAIR MANAGER PLANS ENTER THE DIRECTORY TOO
-- ---------------------------------------------------------------------

alter table public.fair_plans add column if not exists fair_event_id uuid
  references public.fair_events(id) on delete set null;

create or replace function public.fg_sync_plan_fair(p_plan_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare p record; v_event uuid; v_slug text;
begin
  select * into p from public.fair_plans where id = p_plan_id;
  if not found then return null; end if;
  if p.target_date is null then return null; end if;

  v_slug := 'plan-' || left(public.fg_slugify(p.fair_name), 40) || '-' ||
            to_char(p.target_date, 'YYYY') || '-' || left(p.id::text, 8);

  if p.fair_event_id is not null then
    update public.fair_events
    set name             = p.fair_name,
        level            = p.level,
        state_code       = p.state_code,
        city             = p.city,
        county           = p.county,
        venue_name       = p.venue_name,
        event_start_date = p.target_date,
        judging_date     = p.target_date,
        grade_min        = p.grade_min,
        grade_max        = p.grade_max,
        judges_needed_count = p.judges_needed,
        advances_to_id   = p.advances_to_id,
        public_listing   = p.public_listing,
        active           = (p.status <> 'cancelled'),
        last_verified_at = now()
    where id = p.fair_event_id
    returning id into v_event;
  else
    insert into public.fair_events
      (slug, name, level, state_code, host_org, city, county, venue_name,
       event_start_date, judging_date, grade_min, grade_max,
       judges_needed, judges_needed_count, advances_to_id,
       public_listing, active, source_url, verification_status,
       last_verified_at, notes)
    values
      (v_slug, p.fair_name, p.level, p.state_code, p.organization, p.city, p.county,
       p.venue_name, p.target_date, p.target_date, p.grade_min, p.grade_max,
       true, p.judges_needed, p.advances_to_id,
       p.public_listing, (p.status <> 'cancelled'),
       'https://fairgameinitiative.org/portal-fairmanager.html', 'verified',
       now(), 'Planned through the FairGame fair manager portal.')
    returning id into v_event;

    update public.fair_plans set fair_event_id = v_event where id = p.id;
  end if;

  return v_event;
end;
$$;

create or replace function public.fg_plans_sync_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.fg_sync_plan_fair(new.id);
  return new;
end;
$$;

drop trigger if exists fair_plans_sync_directory on public.fair_plans;
create trigger fair_plans_sync_directory
  after insert or update of fair_name, level, state_code, city, county,
                            venue_name, target_date, status, public_listing,
                            judges_needed, advances_to_id
  on public.fair_plans
  for each row execute function public.fg_plans_sync_trigger();

-- ---------------------------------------------------------------------
-- PART 6 - VISIBILITY
-- ---------------------------------------------------------------------
-- Anonymous visitors see the confirmed public directory. Signed-in users
-- also see school fairs and unconfirmed leads, which is what makes judge
-- matching to a school fair work at all.

drop policy if exists "fair_events_public_read" on public.fair_events;
create policy "fair_events_public_read" on public.fair_events
  for select to anon
  using (active = true and public_listing = true
         and verification_status in ('verified','stale'));

drop policy if exists "fair_events_auth_read" on public.fair_events;
create policy "fair_events_auth_read" on public.fair_events
  for select to authenticated
  using (active = true);

-- ---------------------------------------------------------------------
-- PART 7 - CAMPAIGN AUDIENCE FILTER THAT ACTUALLY FILTERS
-- ---------------------------------------------------------------------
-- judges.status defaults to 'active', so filtering on it excluded nobody.
-- profile_status is the real gate, so it becomes an option here.

drop function if exists public.fg_preview_judge_recipients(char(2), text[], text[], boolean);

create or replace function public.fg_preview_judge_recipients(
  p_state          char(2),
  p_expertise      text[]  default null,
  p_counties       text[]  default null,
  p_verified_only  boolean default false,
  p_published_only boolean default false
)
returns table (
  judge_id       uuid,
  full_name      text,
  email          citext,
  county         text,
  expertise      text,
  profile_status text
)
language sql stable security definer set search_path = public as $$
  select j.id,
         j.name,
         j.email::citext,
         array_to_string(public.fg_text_array(to_jsonb(j.county)), ' / '),
         array_to_string(public.fg_text_array(to_jsonb(j.expertise)), ', '),
         j.profile_status
  from public.judges j
  where public.fg_is_admin()
    and j.state_code = p_state
    and coalesce(j.email_opt_in, true) = true
    and j.email is not null
    and (p_verified_only  is false or j.status = 'active')
    and (p_published_only is false or j.profile_status = 'published')
    and (p_expertise is null
         or public.fg_text_array(to_jsonb(j.expertise)) && p_expertise)
    and (p_counties is null
         or public.fg_text_array(to_jsonb(j.county)) && p_counties)
    and not exists (
      select 1 from public.email_suppressions s where s.email = j.email::citext
    )
  order by 4 nulls last, j.name;
$$;

-- ---------------------------------------------------------------------
-- PART 8 - GAPS AND MATCHING, CORRECTED FOR THE REAL DEFAULTS
-- ---------------------------------------------------------------------

create or replace function public.fg_judge_profile_gaps(p_judge_id uuid)
returns table (
  gap_code   text,
  severity   text,
  label      text,
  how_to_fix text,
  subject    text
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare j record;
begin
  select * into j from public.judges where id = p_judge_id;
  if not found then return; end if;

  if j.email is null or length(trim(j.email)) = 0 then
    return query select 'JUDGE_NO_EMAIL','blocking','No email address',
      'Nothing can be sent to this judge. Ask for an address or remove the record.','judge';
  end if;

  if j.state_code is null then
    return query select 'JUDGE_NO_STATE','blocking','No state on record',
      'Set state_code on the judge. Without it no fair can be matched.','judge';
  end if;

  if j.county is null or coalesce(j.county::text, '') in ('', '{}') then
    return query select 'JUDGE_NO_COUNTY','limiting','No county on record',
      'County drives the closest matches. Look it up from their organization or ask them.','judge';
  end if;

  if j.postal_code is null and j.city is null then
    return query select 'JUDGE_NO_PLACE','limiting','No city or postal code',
      'Without one of the two the system cannot measure travel distance and falls back to county only.','judge';
  elsif j.latitude is null then
    return query select 'JUDGE_NO_COORDS','limiting','Location not yet placed on the map',
      'Load the Census centroid table, or set latitude and longitude by hand.','judge';
  end if;

  -- Travel distance. The column defaults to 10, so an unconfirmed row
  -- looks identical to someone who genuinely said ten miles.
  if not coalesce(j.travel_miles_confirmed, false) then
    if j.travel_range is not null and length(trim(j.travel_range)) > 0 then
      return query select 'JUDGE_RANGE_UNPARSED','limiting','Travel distance is still free text',
        'They wrote "' || j.travel_range || '" on the signup form. Enter that as a number of miles and the record will stop using the default of ' ||
        coalesce(j.travel_miles, 10) || '.','judge';
    else
      return query select 'JUDGE_RANGE_UNCONFIRMED','limiting','Travel distance never confirmed',
        'The record still carries the default of ' || coalesce(j.travel_miles, 10) ||
        ' miles, which nobody has checked. Ask how far they will drive.','judge';
    end if;
  end if;

  if j.preferred_levels is null or array_length(j.preferred_levels,1) is null then
    if j.available_level is not null and length(trim(j.available_level)) > 0 then
      return query select 'JUDGE_LEVEL_UNMAPPED','limiting','Fair levels are still free text',
        'They wrote "' || j.available_level || '" on the signup form. Tick the matching boxes for school, district, regional, or state.','judge';
    else
      return query select 'JUDGE_NO_LEVELS','limiting','No fair levels chosen',
        'Ask whether they want school, district, regional, or state fairs. Every level is offered until they say.','judge';
    end if;
  end if;

  if j.expertise is null or coalesce(j.expertise::text, '') in ('', '{}') then
    return query select 'JUDGE_NO_EXPERTISE','polish','No subject area',
      'Subject area decides which category a fair assigns them to. Ask what they work in.','judge';
  end if;

  return query
    select distinct on (f.id, gap.code)
           gap.code, gap.sev, gap.lbl, gap.fix, 'fair: ' || f.name
    from public.judge_fair_matches m
    join public.fair_events f on f.id = m.fair_id
    cross join lateral (
      values
        ('FAIR_NO_DATE','blocking','Fair has no date posted',
         'Check the fair website or call. A judge cannot be invited to an undated event.'),
        ('FAIR_NO_COORDS','limiting','Fair has no location coordinates',
         'Add city and postal code to the fair so distance can be measured.'),
        ('FAIR_UNVERIFIED','limiting','Fair listing is unconfirmed',
         'Confirm the listing against the fair website, then set it to verified.'),
        ('FAIR_NO_SIGNUP','polish','No judge signup link',
         'Find the judge signup page so the email can link straight to it.')
    ) as gap(code, sev, lbl, fix)
    where m.judge_id = p_judge_id
      and (
        (gap.code = 'FAIR_NO_DATE'   and f.event_start_date is null and f.judging_date is null) or
        (gap.code = 'FAIR_NO_COORDS' and f.latitude is null) or
        (gap.code = 'FAIR_UNVERIFIED' and f.verification_status <> 'verified') or
        (gap.code = 'FAIR_NO_SIGNUP' and f.judge_signup_url is null)
      );
end;
$$;

-- Matching now scores distance in two bands, so a judge carrying the
-- default of 10 miles still sees what is an hour away, labelled honestly
-- as beyond the distance on file.
create or replace function public.fg_match_judge_fairs(p_judge_id uuid)
returns table (
  fair_id        uuid,
  fair_name      text,
  level          text,
  event_date     date,
  city           text,
  county         text,
  distance_miles numeric,
  match_score    smallint,
  match_reasons  text[],
  blocked_by     text[],
  status         text
)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  j              record;
  v_radius       integer;
  v_outer        integer;
  v_levels       text[];
  v_counties     text[];
  v_county_label text;
  v_levels_given boolean;
  v_radius_ok    boolean;
begin
  select * into j from public.judges where id = p_judge_id;
  if not found then
    raise exception 'No judge with id %', p_judge_id;
  end if;
  if j.state_code is null then
    raise exception 'Judge % has no state_code. Set it before matching.', p_judge_id;
  end if;

  v_radius    := coalesce(j.travel_miles, 10);
  v_outer     := greatest(v_radius * 3, 50);
  v_radius_ok := coalesce(j.travel_miles_confirmed, false);
  v_counties  := public.fg_text_array(to_jsonb(j.county));
  v_county_label := array_to_string(v_counties, ' / ');
  v_levels_given := j.preferred_levels is not null
                    and array_length(j.preferred_levels,1) is not null;
  v_levels := case when v_levels_given
                then j.preferred_levels
                else array['school','district','regional','state']
              end;

  delete from public.judge_fair_matches m
  where m.judge_id = p_judge_id and m.status = 'proposed';

  insert into public.judge_fair_matches
    (judge_id, fair_id, match_score, distance_miles, match_reasons, blocked_by, status)
  select p_judge_id, c.id, c.score, c.miles, c.reasons, c.blockers, 'proposed'
  from (
    select
      f.id,
      public.fg_miles_between(j.latitude, j.longitude, f.latitude, f.longitude) as miles,
      (
          case when v_counties is not null
                    and (f.county = any(v_counties)
                         or coalesce(f.counties_served,'{}') && v_counties)
               then 40 else 0 end
        + case
            when j.latitude is null or f.latitude is null then 0
            when public.fg_miles_between(j.latitude,j.longitude,f.latitude,f.longitude) <= v_radius then 35
            when public.fg_miles_between(j.latitude,j.longitude,f.latitude,f.longitude) <= v_outer  then 15
            else 0 end
        + case when f.level = any(v_levels) then 20 else 0 end
        + case when coalesce(f.event_start_date, f.judging_date) >= current_date then 15 else 0 end
        + case when f.judges_needed then 10 else 0 end
        + case when coalesce(j.virtual_ok,false) and f.judging_format in ('virtual','hybrid')
               then 10 else 0 end
      )::smallint as score,
      (
        array_remove(array[
          case when v_counties is not null
                    and (f.county = any(v_counties)
                         or coalesce(f.counties_served,'{}') && v_counties)
               then 'Serves ' || v_county_label || ' County' end,
          case
            when j.latitude is null or f.latitude is null then null
            when public.fg_miles_between(j.latitude,j.longitude,f.latitude,f.longitude) <= v_radius
              then 'Within ' || v_radius || ' miles' ||
                   case when v_radius_ok then '' else ', a distance nobody has confirmed' end
            when public.fg_miles_between(j.latitude,j.longitude,f.latitude,f.longitude) <= v_outer
              then 'About ' || public.fg_miles_between(j.latitude,j.longitude,f.latitude,f.longitude) ||
                   ' miles away, beyond the ' || v_radius || ' miles on file'
            else null end,
          case when f.level = any(v_levels) then
                 case when v_levels_given
                      then 'Level they asked for: ' || f.level
                      else 'Level not chosen yet, showing all' end
               end,
          case when coalesce(f.event_start_date, f.judging_date) >= current_date
               then 'Date still ahead' end,
          case when f.judges_needed then 'Fair is short on judges' end,
          case when f.level = 'school' then 'A FairGame school fair' end
        ], null)
      ) as reasons,
      (
        array_remove(array[
          case when coalesce(f.event_start_date, f.judging_date) is null then 'FAIR_NO_DATE' end,
          case when f.latitude is null then 'FAIR_NO_COORDS' end,
          case when f.verification_status <> 'verified' then 'FAIR_UNVERIFIED' end,
          case when f.judge_signup_url is null and f.level <> 'school' then 'FAIR_NO_SIGNUP' end,
          case when j.latitude is null then 'JUDGE_NO_COORDS' end,
          case when v_counties is null then 'JUDGE_NO_COUNTY' end,
          case when not v_radius_ok then 'JUDGE_RANGE_UNCONFIRMED' end
        ], null)
      ) as blockers
    from public.fair_events f
    where f.active = true
      and f.state_code = j.state_code
  ) c
  where c.score > 0
  on conflict (judge_id, fair_id) do nothing;

  return query
    select m.fair_id, f.name, f.level,
           coalesce(f.event_start_date, f.judging_date),
           f.city, f.county, m.distance_miles, m.match_score,
           m.match_reasons, m.blocked_by, m.status
    from public.judge_fair_matches m
    join public.fair_events f on f.id = m.fair_id
    where m.judge_id = p_judge_id
    order by m.match_score desc,
             coalesce(f.event_start_date, f.judging_date) nulls last;
end;
$$;

-- ---------------------------------------------------------------------
-- PART 9 - REVIEW QUEUE REFRESH
-- ---------------------------------------------------------------------

drop view if exists public.v_judge_review_queue;
create view public.v_judge_review_queue as
select j.id                     as judge_id,
       j.name,
       j.email,
       j.org                    as organization,
       array_to_string(public.fg_text_array(to_jsonb(j.expertise)), ', ') as expertise,
       array_to_string(public.fg_text_array(to_jsonb(j.county)),    ' / ') as county,
       j.city,
       j.state_code,
       j.status                 as account_status,
       j.profile_status,
       j.created_at,
       (select count(*) from public.judge_fair_matches m
         where m.judge_id = j.id and m.status = 'proposed')  as proposed_fairs,
       (select count(*) from public.judge_fair_matches m
         where m.judge_id = j.id and m.status = 'published')  as published_fairs,
       (j.state_code is null or j.email is null)              as blocked,
       (coalesce(j.county::text,'') in ('','{}')
         or (j.postal_code is null and j.city is null)
         or not coalesce(j.travel_miles_confirmed,false)
         or j.preferred_levels is null
         or array_length(j.preferred_levels,1) is null)       as needs_research,
       j.available_level        as level_answer_raw,
       j.travel_range           as travel_answer_raw,
       j.travel_miles,
       j.travel_miles_confirmed
from public.judges j
order by (j.profile_status = 'new') desc, j.created_at desc;

-- ---------------------------------------------------------------------
-- PART 10 - PLACE FAIRS ON THE MAP
-- ---------------------------------------------------------------------
-- Same idea as the judge geocoder. Postal code first, then city and
-- state. Clears most of the FAIR_NO_COORDS research flags in one call
-- once the centroid table is loaded.

create or replace function public.fg_geocode_fairs()
returns integer
language plpgsql security definer set search_path = public as $$
declare v_zip integer; v_city integer;
begin
  update public.fair_events f
  set latitude = z.latitude, longitude = z.longitude
  from public.us_zip_centroids z
  where f.postal_code is not null
    and left(regexp_replace(f.postal_code, '[^0-9]', '', 'g'), 5) = z.zip
    and f.latitude is null;
  get diagnostics v_zip = row_count;

  update public.fair_events f
  set latitude = c.lat, longitude = c.lon
  from (
    select lower(trim(city)) as city_key, state_code,
           avg(latitude) as lat, avg(longitude) as lon
    from public.us_zip_centroids where city is not null
    group by 1, 2
  ) c
  where f.latitude is null
    and f.city is not null
    and lower(trim(f.city)) = c.city_key
    and f.state_code = c.state_code;
  get diagnostics v_city = row_count;

  return v_zip + v_city;
end;
$$;

-- ---------------------------------------------------------------------
-- PART 11 - EXISTING SEED ROWS STAY PUBLIC
-- ---------------------------------------------------------------------

update public.fair_events
set public_listing = true
where level <> 'school' and public_listing is distinct from true;

-- =====================================================================
-- END MIGRATION 05
-- =====================================================================
