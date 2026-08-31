-- =====================================================================
-- FairGame Initiative
-- Migration 04: Judge profile review, fair matching, and publish
-- Run after 01, 02, and 03.
-- =====================================================================
--
-- WHAT THIS ADDS
--   A new judge signs up. You open their profile from the admin
--   dashboard. The system works out which fairs they are eligible for,
--   using how far they will travel and which levels they want to judge.
--   Anything it cannot decide is listed as a research task with the
--   reason it is stuck. When the list looks right you press Publish.
--   The judge then sees those fairs in their portal and receives one
--   email listing them.
--
-- MATCHING WORKS WITHOUT COORDINATES
--   County and state matching runs on data you already collect. Distance
--   in miles switches on once a judge has a city or a postal code and the
--   fair has a location. Nothing breaks while those are blank. They are
--   reported as research tasks instead.
--
-- IT READS THE SIGNUP FORM ANSWERS YOU ALREADY HAVE
--   The live judges table stores two free-text answers, available_level
--   and travel_range. Neither can be compared or measured, so they are
--   left untouched and surfaced as research tasks that quote what the
--   person wrote. Translating "Up to about an hour" into 45 miles is a
--   judgement call, and it stays a human one.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PART 1 - COLUMNS
-- ---------------------------------------------------------------------

alter table public.judges add column if not exists latitude  numeric(9,6);
alter table public.judges add column if not exists longitude numeric(9,6);
alter table public.judges add column if not exists geocode_source text;
alter table public.judges add column if not exists geocoded_at timestamptz;

alter table public.judges add column if not exists profile_status text
  not null default 'new'
  check (profile_status in ('new','in_review','published','needs_research','declined'));
alter table public.judges add column if not exists profile_reviewed_at timestamptz;
alter table public.judges add column if not exists profile_reviewed_by uuid references auth.users(id) on delete set null;
alter table public.judges add column if not exists profile_published_at timestamptz;
alter table public.judges add column if not exists admin_notes text;

create index if not exists judges_profile_status_idx on public.judges (profile_status);

-- Postal code centroids. Left empty on purpose. Load it once from the
-- United States Census ZCTA gazetteer file, which is public domain.
create table if not exists public.us_zip_centroids (
  zip        char(5) primary key,
  city       text,
  state_code char(2),
  county     text,
  latitude   numeric(9,6) not null,
  longitude  numeric(9,6) not null
);
create index if not exists zip_centroids_state_idx on public.us_zip_centroids (state_code);

-- ---------------------------------------------------------------------
-- PART 2 - MATCH RECORDS
-- ---------------------------------------------------------------------

create table if not exists public.judge_fair_matches (
  id             uuid primary key default gen_random_uuid(),
  judge_id       uuid not null references public.judges(id) on delete cascade,
  fair_id        uuid not null references public.fair_events(id) on delete cascade,
  match_score    smallint not null default 0,
  distance_miles numeric(6,1),
  match_reasons  text[] not null default '{}',
  blocked_by     text[] not null default '{}',
  status         text not null default 'proposed'
                   check (status in ('proposed','published','dismissed')),
  dismissed_reason text,
  created_at     timestamptz not null default now(),
  published_at   timestamptz,
  unique (judge_id, fair_id)
);

create index if not exists judge_matches_judge_idx  on public.judge_fair_matches (judge_id);
create index if not exists judge_matches_status_idx on public.judge_fair_matches (status);

-- ---------------------------------------------------------------------
-- PART 3 - DISTANCE
-- ---------------------------------------------------------------------

create or replace function public.fg_miles_between(
  lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric
) returns numeric
language sql immutable as $$
  select case
    when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null
    else round((
      3958.7613 * 2 * asin(sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        power(sin(radians(lon2 - lon1) / 2), 2)
      ))
    )::numeric, 1)
  end;
$$;

-- Fill judge coordinates from their postal code where possible.
-- Postal code first, then city and state. The live signup form collects
-- city but not postal code, so the second pass is the one that will do
-- most of the work until the form is changed.
create or replace function public.fg_geocode_judges_from_zip()
returns integer
language plpgsql security definer set search_path = public as $$
declare v_zip integer; v_city integer;
begin
  update public.judges j
  set latitude = z.latitude,
      longitude = z.longitude,
      geocode_source = 'census_zcta',
      geocoded_at = now()
  from public.us_zip_centroids z
  where j.postal_code is not null
    and left(regexp_replace(j.postal_code, '[^0-9]', '', 'g'), 5) = z.zip
    and j.latitude is null;
  get diagnostics v_zip = row_count;

  update public.judges j
  set latitude = c.lat,
      longitude = c.lon,
      geocode_source = 'census_zcta_city',
      geocoded_at = now()
  from (
    select lower(trim(city)) as city_key, state_code,
           avg(latitude) as lat, avg(longitude) as lon
    from public.us_zip_centroids
    where city is not null
    group by 1, 2
  ) c
  where j.latitude is null
    and j.city is not null
    and j.state_code is not null
    and lower(trim(j.city)) = c.city_key
    and j.state_code = c.state_code;
  get diagnostics v_city = row_count;

  return v_zip + v_city;
end;
$$;

-- ---------------------------------------------------------------------
-- PART 4 - GAPS TO RESEARCH
-- ---------------------------------------------------------------------
-- Returns one row per thing a person needs to look up. The admin profile
-- page renders this as a to-do list. Severity 'blocking' means matching
-- cannot finish. Severity 'limiting' means matching ran but stayed
-- coarse. Severity 'polish' means the match works and the email would
-- simply read better.

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

  -- Casting to text covers both shapes: a plain text column reads as ''
  -- when empty, an array column reads as '{}'.
  if j.county is null or coalesce(j.county::text, '') in ('', '{}') then
    return query select 'JUDGE_NO_COUNTY','limiting','No county on record',
      'County drives the closest matches. Look it up from their organization or ask them.','judge';
  end if;

  if j.postal_code is null and j.city is null then
    return query select 'JUDGE_NO_PLACE','limiting','No city or postal code',
      'Without one of the two the system cannot measure travel distance and falls back to county only.','judge';
  elsif j.latitude is null then
    return query select 'JUDGE_NO_COORDS','limiting','Postal code not yet located',
      'The postal code is not in the centroid table. Load the Census gazetteer file or set latitude and longitude by hand.','judge';
  end if;

  if j.travel_miles is null then
    if j.travel_range is not null and length(trim(j.travel_range)) > 0 then
      return query select 'JUDGE_RANGE_UNPARSED','limiting','Travel distance is still free text',
        'They wrote "' || j.travel_range || '" on the signup form. Put the number of miles in travel_miles so the matcher can use it.','judge';
    else
      return query select 'JUDGE_NO_RADIUS','limiting','No travel distance given',
        'Ask how far they will drive. The system assumes 30 miles until told otherwise.','judge';
    end if;
  end if;

  if j.preferred_levels is null or array_length(j.preferred_levels,1) is null then
    if j.available_level is not null and length(trim(j.available_level)) > 0 then
      return query select 'JUDGE_LEVEL_UNMAPPED','limiting','Fair levels are still free text',
        'They wrote "' || j.available_level || '" on the signup form. Tick the matching boxes for school, district, regional, or state so the matcher can use it.','judge';
    else
      return query select 'JUDGE_NO_LEVELS','limiting','No fair levels chosen',
        'Ask whether they want school, district, regional, or state fairs. Every level is offered until they say.','judge';
    end if;
  end if;

  if j.expertise is null or coalesce(j.expertise::text, '') in ('', '{}') then
    return query select 'JUDGE_NO_EXPERTISE','polish','No subject area',
      'Subject area decides which category a fair assigns them to. Ask what they work in.','judge';
  end if;

  -- Fair-side gaps that weaken this judge's own matches
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

-- ---------------------------------------------------------------------
-- PART 5 - THE MATCHER
-- ---------------------------------------------------------------------
-- Scores every active fair in the judge's state. Writes the result to
-- judge_fair_matches with status 'proposed' and returns it for display.
-- Running it again refreshes the proposals and leaves published rows
-- and dismissed rows alone.

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
-- Output parameter names such as fair_id and status also exist as
-- columns on the tables below. This directive makes the column win.
#variable_conflict use_column
declare
  j          record;
  v_radius   integer;
  v_levels   text[];
  v_counties text[];
  v_county_label text;
  v_levels_given boolean;
begin
  select * into j from public.judges where id = p_judge_id;
  if not found then
    raise exception 'No judge with id %', p_judge_id;
  end if;
  if j.state_code is null then
    raise exception 'Judge % has no state_code. Set it before matching.', p_judge_id;
  end if;

  v_radius := coalesce(j.travel_miles, 30);
  -- The live judges table may hold county as one value or several.
  v_counties := public.fg_text_array(to_jsonb(j.county));
  v_county_label := array_to_string(v_counties, ' / ');
  v_levels_given := j.preferred_levels is not null
                    and array_length(j.preferred_levels,1) is not null;
  v_levels := case when v_levels_given
                then j.preferred_levels
                else array['school','district','regional','state']
              end;

  -- refresh proposals only. Every column is qualified because this
  -- function's RETURNS TABLE list shadows several column names.
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
        + case when j.latitude is not null and f.latitude is not null
                    and public.fg_miles_between(j.latitude,j.longitude,f.latitude,f.longitude) <= v_radius
               then 35 else 0 end
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
          case when j.latitude is not null and f.latitude is not null
                    and public.fg_miles_between(j.latitude,j.longitude,f.latitude,f.longitude) <= v_radius
               then 'Within ' || v_radius || ' miles' end,
          case when f.level = any(v_levels) then
                 case when v_levels_given
                      then 'Level they asked for: ' || f.level
                      else 'Level not chosen yet, showing all' end
               end,
          case when coalesce(f.event_start_date, f.judging_date) >= current_date
               then 'Date still ahead' end,
          case when f.judges_needed then 'Fair is short on judges' end
        ], null)
      ) as reasons,
      (
        array_remove(array[
          case when coalesce(f.event_start_date, f.judging_date) is null then 'FAIR_NO_DATE' end,
          case when f.latitude is null then 'FAIR_NO_COORDS' end,
          case when f.verification_status <> 'verified' then 'FAIR_UNVERIFIED' end,
          case when f.judge_signup_url is null then 'FAIR_NO_SIGNUP' end,
          case when j.latitude is null then 'JUDGE_NO_COORDS' end,
          case when v_counties is null then 'JUDGE_NO_COUNTY' end
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
-- PART 6 - PUBLISH
-- ---------------------------------------------------------------------
-- Turns proposals into something the judge can see, and queues one email
-- listing the fairs. The email goes through the same campaign machinery
-- as a bulk send, so suppression, unsubscribe, and bounce handling all
-- behave the same way. Returns the campaign id so the page can hand it
-- to the send function.

create or replace function public.fg_publish_judge_matches(
  p_judge_id  uuid,
  p_fair_ids  uuid[] default null,   -- null publishes every proposal
  p_send_email boolean default true
)
returns table (published_count integer, campaign_id uuid)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  j            record;
  v_published  integer := 0;
  v_campaign   uuid;
  v_list       text;
  v_subject    text;
  v_body       text;
  v_suppressed boolean;
begin
  if not public.fg_is_admin() then
    raise exception 'Only an admin may publish judge matches.';
  end if;

  select * into j from public.judges where id = p_judge_id;
  if not found then raise exception 'No judge with id %', p_judge_id; end if;

  update public.judge_fair_matches m
  set status = 'published', published_at = now()
  where m.judge_id = p_judge_id
    and m.status = 'proposed'
    and (p_fair_ids is null or m.fair_id = any(p_fair_ids));
  get diagnostics v_published = row_count;

  -- Mirror into judge_fair_interests so the judge portal shows them
  insert into public.judge_fair_interests (judge_id, fair_id, status, source, note)
  select p_judge_id, m.fair_id, 'invited', 'admin_publish',
         'Published by an administrator after profile review'
  from public.judge_fair_matches m
  where m.judge_id = p_judge_id and m.status = 'published'
  on conflict (judge_id, fair_id) do nothing;

  update public.judges
  set profile_status = 'published',
      profile_published_at = now(),
      profile_reviewed_at = coalesce(profile_reviewed_at, now()),
      profile_reviewed_by = coalesce(profile_reviewed_by, auth.uid())
  where id = p_judge_id;

  if not p_send_email or j.email is null then
    return query select v_published, null::uuid;
    return;
  end if;

  select exists (select 1 from public.email_suppressions s where s.email = j.email::citext)
    into v_suppressed;
  if v_suppressed or coalesce(j.email_opt_in, true) = false then
    return query select v_published, null::uuid;
    return;
  end if;

  -- Build the fair list as plain text lines
  select string_agg(line, E'\n' order by sort_date nulls last)
  into v_list
  from (
    select coalesce(f.event_start_date, f.judging_date) as sort_date,
           '- ' || f.name ||
           case when coalesce(f.event_start_date, f.judging_date) is not null
                then ', ' || to_char(coalesce(f.event_start_date, f.judging_date), 'FMMonth FMDD, YYYY')
                else ', date not yet posted' end ||
           case when f.city is not null then ', ' || f.city else '' end ||
           case when m.distance_miles is not null
                then ' (about ' || m.distance_miles || ' miles from you)' else '' end ||
           case when f.judge_signup_url is not null
                then E'\n  Sign up: ' || f.judge_signup_url
                when f.website_url is not null
                then E'\n  Details: ' || f.website_url
                else '' end as line
    from public.judge_fair_matches m
    join public.fair_events f on f.id = m.fair_id
    where m.judge_id = p_judge_id and m.status = 'published'
  ) rows;

  v_subject := 'Science fairs near you that need judges';
  select subject, body_markdown into v_subject, v_body
  from public.email_templates where key = 'judge_matched_fairs' and active;

  if v_body is null then
    v_body := 'Hello {{first_name}},' || E'\n\n' ||
              'Here are the fairs we matched to your profile:' || E'\n\n' ||
              '{{fair_list}}' || E'\n\n' || 'FairGame Initiative';
  end if;

  insert into public.email_campaigns
    (name, template_key, audience, subject, body_markdown,
     audience_state, status, created_by, recipient_count)
  values
    ('Judge match for ' || coalesce(j.name,'judge') || ' ' || to_char(now(),'YYYY-MM-DD'),
     'judge_matched_fairs', 'judge', v_subject, v_body,
     j.state_code, 'approved', auth.uid(), 1)
  returning id into v_campaign;

  insert into public.email_campaign_recipients
    (campaign_id, judge_id, email, full_name, merge_data, status)
  values
    (v_campaign, p_judge_id, j.email::citext, j.name,
     jsonb_build_object(
       'first_name', coalesce(split_part(trim(j.name), ' ', 1), 'there'),
       'county', coalesce(array_to_string(public.fg_text_array(to_jsonb(j.county)), ' / '), ''),
       'state_name', coalesce(j.state_code, ''),
       'fair_list', coalesce(v_list, 'No fairs matched yet. We will write again when one comes up.'),
       'match_count', v_published
     ),
     'approved');

  return query select v_published, v_campaign;
end;
$$;

-- ---------------------------------------------------------------------
-- PART 7 - THE ADMIN QUEUE VIEW
-- ---------------------------------------------------------------------

create or replace view public.v_judge_review_queue as
select j.id                     as judge_id,
       j.name,
       j.email,
       j.org                    as organization,
       array_to_string(public.fg_text_array(to_jsonb(j.expertise)), ', ') as expertise,
       array_to_string(public.fg_text_array(to_jsonb(j.county)),    ' / ') as county,
       j.state_code,
       j.status                 as verification_status,
       j.profile_status,
       j.created_at,
       (select count(*) from public.judge_fair_matches m
         where m.judge_id = j.id and m.status = 'proposed')  as proposed_fairs,
       (select count(*) from public.judge_fair_matches m
         where m.judge_id = j.id and m.status = 'published')  as published_fairs,
       (j.state_code is null or j.email is null)              as blocked,
       (coalesce(j.county::text,'') in ('','{}')
         or j.postal_code is null
         or j.travel_miles is null
         or j.preferred_levels is null
         or array_length(j.preferred_levels,1) is null)       as needs_research,
       j.available_level        as level_answer_raw,
       j.travel_range           as travel_answer_raw
from public.judges j
order by (j.profile_status = 'new') desc, j.created_at desc;

-- ---------------------------------------------------------------------
-- PART 8 - SECURITY
-- ---------------------------------------------------------------------

alter table public.judge_fair_matches enable row level security;
alter table public.us_zip_centroids   enable row level security;

drop policy if exists "judge_matches_admin" on public.judge_fair_matches;
create policy "judge_matches_admin" on public.judge_fair_matches
  for all to authenticated
  using (public.fg_is_admin()) with check (public.fg_is_admin());

-- A judge reads only their own published matches. Proposals stay hidden
-- until an administrator presses Publish, which is the whole point.
drop policy if exists "judge_matches_own_published" on public.judge_fair_matches;
create policy "judge_matches_own_published" on public.judge_fair_matches
  for select to authenticated
  using (
    status = 'published'
    and exists (select 1 from public.judges j
                where j.id = judge_id
                  and j.email::citext = (auth.jwt() ->> 'email')::citext)
  );

drop policy if exists "zip_centroids_read" on public.us_zip_centroids;
create policy "zip_centroids_read" on public.us_zip_centroids
  for select to authenticated using (true);

drop policy if exists "zip_centroids_admin" on public.us_zip_centroids;
create policy "zip_centroids_admin" on public.us_zip_centroids
  for all to authenticated
  using (public.fg_is_admin()) with check (public.fg_is_admin());

-- ---------------------------------------------------------------------
-- PART 9 - THE MATCH EMAIL TEMPLATE
-- ---------------------------------------------------------------------

insert into public.email_templates (key, name, audience, subject, body_markdown, merge_fields)
values
('judge_matched_fairs',
 'Judge: fairs matched to your profile',
 'judge',
 'Science fairs near you that need judges',
$MSG$Hello {{first_name}},

Thank you for joining the FairGame judge network. I went through your profile by hand and matched you to the fairs below, using the distance you are willing to travel and the levels you said you wanted to judge.

{{fair_list}}

These are also waiting in your judge dashboard, where you can accept or pass on each one and see the venue, the grade range, and who to contact.

Nothing here is a commitment. Say yes to what fits your calendar and ignore the rest. When a new fair opens in {{county}} County, it appears in your dashboard and you hear from me once.

If any of this looks wrong, whether the county, the distance, or the subject area, reply and I will correct your record the same day.

{{sender_name}}
{{sender_title}}, FairGame Initiative
fairgameinitiative@outlook.com
fairgameinitiative.org

{{org_postal_address}}
Stop receiving these messages: {{unsubscribe_url}}
$MSG$,
 array['first_name','county','state_name','fair_list','match_count',
       'sender_name','sender_title','org_postal_address','unsubscribe_url'])
on conflict (key) do update
set name = excluded.name, audience = excluded.audience, subject = excluded.subject,
    body_markdown = excluded.body_markdown, merge_fields = excluded.merge_fields,
    updated_at = now();

-- =====================================================================
-- END MIGRATION 04
-- =====================================================================
