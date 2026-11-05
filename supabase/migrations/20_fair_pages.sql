-- ---------------------------------------------------------------------
-- MIGRATION 20 - FAIR PAGES, STATE DIRECTORS EDIT THEIR FAIRS, FRESH START
-- ---------------------------------------------------------------------
-- Run after 19. Safe to run more than once.
--
-- PART 1  Every current fair goes back to "not verified", once. The
--         public directory only ever shows verified fairs (migration 01's
--         policy), so each state's fairs stay off the public site until
--         its director has checked them and pressed "Mark verified". The
--         old status is kept in previous_verification_status; the undo is
--         at the bottom of this file.
-- PART 2  A few more things a fair page needs: an "about" paragraph and a
--         public contact address.
-- PART 3  fair.html: one page per fair (?f=<slug>) and a list per state
--         (?state=OH). Anyone can see verified fairs; the state's director
--         and admins also see unverified ones, marked as a preview.
-- PART 4  Directors (and admins) add, edit, verify and retire fairs in
--         their own state from the state portal. Coordinators look only.
-- PART 5  County names compare ignoring case, accents and punctuation,
--         so "Prince Georges" (the ZIP list) matches "Prince George's"
--         (the county map). Redefines fg_save_region and
--         fg_state_overview with that, and gives the overview the extra
--         fair fields the editor shows.
--
-- User accounts are not touched.


-- ---------------------------------------------------------------------
-- PART 1 - A FRESH START FOR EVERY FAIR (runs once)
-- ---------------------------------------------------------------------
-- Guarded on the backup column: once it exists this part has run, and
-- running the file again must not undo a director's verifications.

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'fair_events'
                   and column_name = 'previous_verification_status') then
    alter table public.fair_events add column previous_verification_status text;
    update public.fair_events
       set previous_verification_status = verification_status,
           verification_status = 'lead',
           last_verified_at = null,
           verified_by = null;
  end if;
end $$;

comment on column public.fair_events.previous_verification_status is
  'What verification_status was before migration 20 reset every fair to lead, so a state director could verify their own state.';


-- ---------------------------------------------------------------------
-- PART 2 - FIELDS FOR THE FAIR PAGE
-- ---------------------------------------------------------------------

alter table public.fair_events add column if not exists about text;
alter table public.fair_events add column if not exists public_email text;
alter table public.fair_events add column if not exists updated_by uuid references auth.users(id) on delete set null;

comment on column public.fair_events.about is 'Shown on the public fair page. Written by the state director.';
comment on column public.fair_events.public_email is 'A contact address the fair is happy to publish on its page. Private contacts stay in fair_contacts.';


-- ---------------------------------------------------------------------
-- PART 5a - COUNTY KEYS (used by everything below)
-- ---------------------------------------------------------------------

create or replace function public.fg_county_key(p text)
returns text
language sql
immutable
as $$
  select nullif(lower(regexp_replace(
           translate(coalesce(public.fg_clean_county(p), ''),
                     'ñÑáàâäéèêëíìîïóòôöúùûüçÁÀÂÄÉÈÊËÍÌÎÏÓÒÔÖÚÙÛÜÇ',
                     'nNaaaaeeeeiiiioooouuuucAAAAEEEEIIIIOOOOUUUUC'),
           '[^A-Za-z0-9]', '', 'g')), '');
$$;

-- South Dakota renamed Shannon County to Oglala Lakota County in 2015;
-- the ZIP list predates it.
do $$
begin
  if to_regclass('public.zip_counties') is not null then
    update public.zip_counties set county = 'Oglala Lakota' where state_code = 'SD' and county = 'Shannon';
  end if;
end $$;
update public.judges set county = 'Oglala Lakota' where state_code = 'SD' and county = 'Shannon';


-- ---------------------------------------------------------------------
-- PART 3 - THE PUBLIC FAIR PAGE
-- ---------------------------------------------------------------------
-- Only the columns a fair page shows. Never contacts, notes or sources.

create or replace function public.fg_fair_public_row(f public.fair_events)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.fg_pick(to_jsonb(f), array[
    'id','slug','name','short_name','level','state_code','host_org','venue_name','venue_address',
    'city','county','postal_code','counties_served','grade_min','grade_max','divisions',
    'event_start_date','event_end_date','judging_date','judging_start_time','judging_end_time',
    'awards_date','schedule_note','registration_opens','registration_deadline','payment_deadline',
    'fee_note','isef_affiliate','registration_platform','website_url','registration_url',
    'judge_signup_url','rules_url','judges_needed','judges_needed_count','judging_format',
    'about','public_email','verification_status','last_verified_at','cycle_year'])
  || jsonb_build_object(
       'advances_to', (select jsonb_build_object('slug', a.slug, 'name', a.name)
                       from public.fair_events a
                       where a.id = f.advances_to_id and a.active
                         and a.verification_status in ('verified','stale')),
       'feeders', (select coalesce(jsonb_agg(jsonb_build_object('slug', b.slug, 'name', b.name) order by b.name), '[]')
                   from public.fair_events b
                   where b.advances_to_id = f.id and b.active
                     and b.verification_status in ('verified','stale')));
$$;

-- One fair. Public if active and verified (or verified once, now stale);
-- otherwise only its state's director or an admin sees it, as a preview.
create or replace function public.fg_fair_page(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f public.fair_events;
  v_public boolean;
begin
  select * into f from public.fair_events where slug = p_slug;
  if not found then return null; end if;
  v_public := f.active and f.verification_status in ('verified', 'stale');
  if not v_public and not (auth.uid() is not null and public.fg_can_manage_state(f.state_code)) then
    return null;
  end if;
  return public.fg_fair_public_row(f)
      || jsonb_build_object('preview', not v_public,
                            'can_edit', auth.uid() is not null and public.fg_can_manage_state(f.state_code));
end;
$$;

grant execute on function public.fg_fair_page(text) to anon, authenticated;

-- Every public fair in one state, for the state list.
create or replace function public.fg_state_fairs_public(p_state char(2))
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(public.fg_pick(to_jsonb(f), array[
           'slug','name','short_name','level','city','county','event_start_date','event_end_date',
           'judging_date','registration_deadline','grade_min','grade_max','judges_needed'])
         order by f.event_start_date nulls last, f.name), '[]')
  from public.fair_events f
  where f.state_code = upper(p_state) and f.active
    and f.verification_status in ('verified', 'stale');
$$;

grant execute on function public.fg_state_fairs_public(char) to anon, authenticated;


-- ---------------------------------------------------------------------
-- PART 4 - EDITING FAIRS FROM THE STATE PORTAL
-- ---------------------------------------------------------------------
-- p_fields carries only what changed; anything not in the list below is
-- ignored. p_verify stamps the fair verified by the person saving it,
-- which is what puts it on the public site.

create or replace function public.fg_save_fair(
  p_id     uuid,
  p_state  char(2),
  p_fields jsonb,
  p_verify boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed text[] := array[
    'name','short_name','level','host_org','venue_name','venue_address','city','county','postal_code',
    'counties_served','grade_min','grade_max','divisions','event_start_date','event_end_date',
    'judging_date','judging_start_time','judging_end_time','awards_date','schedule_note',
    'registration_opens','registration_deadline','payment_deadline','fee_note','isef_affiliate',
    'registration_platform','website_url','registration_url','judge_signup_url','rules_url',
    'judges_needed','judges_needed_count','judging_format','about','public_email','cycle_year'];
  v_in    jsonb := public.fg_pick(coalesce(p_fields, '{}'), v_allowed);
  v_row   public.fair_events;
  v_state char(2);
  v_name  text;
  v_slug  text;
  v_url   text;
begin
  if p_id is not null then
    select * into v_row from public.fair_events where id = p_id for update;
    if not found then raise exception 'That fair no longer exists. Reload the page.'; end if;
    v_state := v_row.state_code;
  else
    v_state := upper(p_state);
  end if;
  if v_state is null or not public.fg_can_manage_state(v_state) then
    raise exception 'You can only edit fairs in your own state.';
  end if;

  -- Blank strings mean "clear it".
  select coalesce(jsonb_object_agg(key, case when jsonb_typeof(value) = 'string' and trim(value #>> '{}') = ''
                                             then 'null'::jsonb else value end), '{}')
    into v_in from jsonb_each(v_in);

  -- Links must be web links; anything else would be a way to put a
  -- javascript: URL on a public page.
  foreach v_url in array array['website_url','registration_url','judge_signup_url','rules_url'] loop
    if v_in ? v_url and jsonb_typeof(v_in -> v_url) = 'string'
       and (v_in ->> v_url) !~* '^https?://[^\s<>"]+$' then
      raise exception 'Links need to start with http:// or https:// (check %).', replace(v_url, '_', ' ');
    end if;
  end loop;
  if v_in ? 'public_email' and jsonb_typeof(v_in -> 'public_email') = 'string'
     and (v_in ->> 'public_email') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'The public email address does not look right.';
  end if;

  if p_id is null then
    v_name := trim(coalesce(v_in ->> 'name', ''));
    if v_name = '' then raise exception 'Give the fair a name.'; end if;
    v_slug := trim(both '-' from regexp_replace(lower(v_state || '-' || v_name), '[^a-z0-9]+', '-', 'g'));
    if exists (select 1 from public.fair_events where slug = v_slug) then
      v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
    end if;
    insert into public.fair_events (slug, name, level, state_code, source_url, verification_status, updated_by)
    values (v_slug, v_name, coalesce(v_in ->> 'level', 'district'), v_state,
            'Added in the FairGame state portal', 'lead', auth.uid())
    returning * into v_row;
  end if;

  -- Overlay what was sent onto the current row, then write the allowed
  -- columns back. jsonb_populate_record does the type conversions.
  v_row := jsonb_populate_record(v_row, v_in);
  if trim(coalesce(v_row.name, '')) = '' then raise exception 'The fair needs a name.'; end if;

  update public.fair_events set
    name = trim(v_row.name), short_name = v_row.short_name, level = v_row.level,
    host_org = v_row.host_org, venue_name = v_row.venue_name, venue_address = v_row.venue_address,
    city = v_row.city, county = public.fg_clean_county(v_row.county), postal_code = v_row.postal_code,
    counties_served = coalesce(v_row.counties_served, '{}'), grade_min = v_row.grade_min, grade_max = v_row.grade_max,
    divisions = coalesce(v_row.divisions, '{}'), event_start_date = v_row.event_start_date,
    event_end_date = v_row.event_end_date, judging_date = v_row.judging_date,
    judging_start_time = v_row.judging_start_time, judging_end_time = v_row.judging_end_time,
    awards_date = v_row.awards_date, schedule_note = v_row.schedule_note,
    registration_opens = v_row.registration_opens, registration_deadline = v_row.registration_deadline,
    payment_deadline = v_row.payment_deadline, fee_note = v_row.fee_note,
    isef_affiliate = coalesce(v_row.isef_affiliate, false), registration_platform = v_row.registration_platform,
    website_url = v_row.website_url, registration_url = v_row.registration_url,
    judge_signup_url = v_row.judge_signup_url, rules_url = v_row.rules_url,
    judges_needed = coalesce(v_row.judges_needed, true), judges_needed_count = v_row.judges_needed_count,
    judging_format = v_row.judging_format, about = v_row.about, public_email = v_row.public_email,
    cycle_year = v_row.cycle_year,
    updated_by = auth.uid(),
    verification_status = case when p_verify then 'verified' else verification_status end,
    last_verified_at    = case when p_verify then now() else last_verified_at end,
    verified_by         = case when p_verify then coalesce(
                            (select full_name from public.user_roles where user_id = auth.uid()),
                            (select email from auth.users where id = auth.uid())) else verified_by end
  where id = v_row.id
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'slug', v_row.slug,
                            'verification_status', v_row.verification_status);
exception
  when check_violation then
    raise exception 'One of the choices is not allowed (check the level and judging format).';
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'A date, time or number is not in the right format.';
end;
$$;

grant execute on function public.fg_save_fair(uuid, char, jsonb, boolean) to authenticated;

-- Retiring takes a fair off the site and out of the director's lists
-- without deleting its history. Bringing it back is the same call.
create or replace function public.fg_set_fair_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state char(2);
begin
  select state_code into v_state from public.fair_events where id = p_id;
  if not found then return; end if;
  if not public.fg_can_manage_state(v_state) then
    raise exception 'You can only change fairs in your own state.';
  end if;
  update public.fair_events
     set active = p_active, updated_by = auth.uid(),
         verification_status = case when p_active then verification_status else 'retired' end
   where id = p_id;
end;
$$;

grant execute on function public.fg_set_fair_active(uuid, boolean) to authenticated;


-- ---------------------------------------------------------------------
-- PART 5b - REGIONS AND THE STATE VIEW, WITH COUNTY KEYS
-- ---------------------------------------------------------------------

create or replace function public.fg_save_region(
  p_id       uuid,
  p_state    char(2),
  p_name     text,
  p_counties text[],
  p_notes    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state    char(2) := upper(p_state);
  v_counties text[];
  v_clash    record;
  v_id       uuid;
begin
  if p_id is not null then
    select state_code into v_state from public.state_regions where id = p_id;
    if not found then
      raise exception 'That region no longer exists. Reload the page.';
    end if;
  end if;

  if v_state is null or v_state !~ '^[A-Z]{2}$' then
    raise exception 'Pick a state.';
  end if;
  if not public.fg_can_manage_state(v_state) then
    raise exception 'You can only edit regions in your own state.';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Give the region a name.';
  end if;

  select coalesce(array_agg(distinct c order by c), '{}') into v_counties
  from (select public.fg_clean_county(x) as c from unnest(coalesce(p_counties, '{}')) x) s
  where c is not null;

  select r.name, c into v_clash
  from public.state_regions r, unnest(r.counties) c
  where r.state_code = v_state
    and r.id is distinct from p_id
    and public.fg_county_key(c) = any (select public.fg_county_key(x) from unnest(v_counties) x)
  limit 1;
  if found then
    raise exception '% County is already in the region "%". Take it out of that region first.',
      v_clash.c, v_clash.name;
  end if;

  if p_id is null then
    insert into public.state_regions (state_code, name, counties, notes, created_by)
    values (v_state, trim(p_name), v_counties, nullif(trim(coalesce(p_notes, '')), ''), auth.uid())
    returning id into v_id;
  else
    update public.state_regions
       set name = trim(p_name),
           counties = v_counties,
           notes = nullif(trim(coalesce(p_notes, '')), '')
     where id = p_id
    returning id into v_id;
  end if;
  return v_id;
exception
  when unique_violation then
    raise exception 'There is already a region called "%" in this state.', trim(p_name);
end;
$$;

create or replace function public.fg_state_overview(p_state char(2), p_region uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me       record;
  v_state    char(2) := upper(p_state);
  v_region   public.state_regions;
  v_counties text[];   -- lower-case; null means the whole state
  v_viewer   text;
  v_fairs    jsonb;
  v_judges   jsonb;
  v_regions  jsonb;
  v_people   jsonb := '[]';
  v_invites  jsonb := '[]';
  v_issues   jsonb := '[]';
  v_judge_keys text[] := array['id','name','org','city','county','state_code','postal_code',
    'expertise','status','available_level','preferred_levels','preferred_grade_bands',
    'travel_miles','travel_range','virtual_ok','latitude','longitude','created_at','times_served'];
  v_fair_keys text[] := array['id','slug','name','short_name','level','city','county',
    'counties_served','event_start_date','event_end_date','judging_date',
    'registration_deadline','website_url','judge_signup_url','judges_needed',
    'judges_needed_count','judging_format','verification_status','last_verified_at',
    'cycle_year','active','isef_affiliate','host_org','venue_name','venue_address','postal_code',
    'grade_min','grade_max','divisions','judging_start_time','judging_end_time','awards_date',
    'schedule_note','registration_opens','payment_deadline','fee_note','registration_platform',
    'registration_url','rules_url','about','public_email','verified_by','state_code'];
begin
  select * into v_me from public.fg_my_scope();
  if v_me.role is null then
    raise exception 'Sign in first.';
  end if;

  if v_me.role = 'admin' then
    v_viewer := 'admin';
  elsif v_me.role = 'state_director' then
    v_viewer := 'state_director';
    v_state  := v_me.state_code;           -- always their own state
  elsif v_me.role = 'regional_coordinator' then
    v_viewer := 'regional_coordinator';
    v_state  := v_me.state_code;
    p_region := v_me.region_id;            -- always their own region
    if p_region is null then
      return jsonb_build_object('state_code', v_state, 'viewer', v_viewer, 'no_region', true,
        'fairs', '[]'::jsonb, 'judges', '[]'::jsonb, 'regions', '[]'::jsonb,
        'people', '[]'::jsonb, 'invites', '[]'::jsonb, 'issues', '[]'::jsonb);
    end if;
  else
    raise exception 'This page is for state directors and regional coordinators.';
  end if;

  if v_state is null or v_state !~ '^[A-Z]{2}$' then
    raise exception 'Pick a state.';
  end if;

  if p_region is not null then
    select * into v_region from public.state_regions where id = p_region and state_code = v_state;
    if not found then
      raise exception 'That region is not in %.', v_state;
    end if;
    select coalesce(array_agg(public.fg_county_key(c)), '{}') into v_counties from unnest(v_region.counties) c;
  end if;

  -- Fairs. A regional view keeps fairs held in, or serving, its counties.
  select coalesce(jsonb_agg(public.fg_pick(to_jsonb(f), v_fair_keys)
                            order by f.event_start_date nulls last, f.name), '[]')
    into v_fairs
  from public.fair_events f
  where f.state_code = v_state
    and coalesce(f.active, true)
    and (v_counties is null
         or public.fg_county_key(f.county) = any (v_counties)
         or exists (select 1 from unnest(f.counties_served) cs
                    where public.fg_county_key(cs) = any (v_counties)));

  -- Judges, contact details left out.
  select coalesce(jsonb_agg(public.fg_pick(to_jsonb(j), v_judge_keys)
                            order by j.name), '[]')
    into v_judges
  from public.judges j
  where j.state_code = v_state
    and coalesce(to_jsonb(j) ->> 'country', 'US') = 'US'
    and (v_counties is null or public.fg_county_key(j.county) = any (v_counties));

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'name', r.name, 'counties', r.counties, 'notes', r.notes,
           'updated_at', r.updated_at) order by r.name), '[]')
    into v_regions
  from public.state_regions r
  where r.state_code = v_state and (p_region is null or r.id = p_region);

  -- Who holds a role in this state. A coordinator does not get the list.
  if v_viewer <> 'regional_coordinator' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'user_id', ur.user_id, 'role', ur.role, 'full_name', ur.full_name,
             'email', u.email, 'region_id', ur.region_id, 'since', ur.updated_at)
             order by ur.role desc, ur.full_name), '[]')
      into v_people
    from public.user_roles ur
    join auth.users u on u.id = ur.user_id
    where ur.state_code = v_state
      and ur.role in ('state_director', 'regional_coordinator')
      and (v_viewer = 'admin' or ur.role = 'regional_coordinator');

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', i.id, 'role', i.role, 'email', i.email, 'full_name', i.full_name,
             'region_id', i.region_id, 'created_at', i.created_at, 'expires_at', i.expires_at,
             'emailed_at', i.emailed_at, 'accepted_at', i.accepted_at, 'revoked_at', i.revoked_at,
             'status', case when i.revoked_at  is not null then 'revoked'
                            when i.accepted_at is not null then 'accepted'
                            when i.expires_at < now()      then 'expired'
                            else 'open' end)
             order by i.created_at desc), '[]')
      into v_invites
    from public.role_invites i
    where i.state_code = v_state
      and (v_viewer = 'admin' or i.role = 'regional_coordinator')
      and i.created_at > now() - interval '180 days';
  end if;

  -- Things that look wrong. Each has a kind, a severity and a message
  -- the page can show as it is.
  select coalesce(jsonb_agg(x), '[]') into v_issues from (
    -- Fairs
    select jsonb_build_object('kind','fair','id',f.id,'severity','warn',
             'message', f.name || ' has no fair date.') x
    from public.fair_events f
    where f.state_code = v_state and coalesce(f.active, true)
      and f.event_start_date is null and f.judging_date is null
      and (v_counties is null or public.fg_county_key(f.county) = any (v_counties))
    union all
    select jsonb_build_object('kind','fair','id',f.id,'severity','warn',
             'message', f.name || case when f.verification_status = 'stale' then ' has out-of-date details. Check them and mark it verified.' else ' is not verified yet. Check its details and mark it verified.' end)
    from public.fair_events f
    where f.state_code = v_state and coalesce(f.active, true)
      and f.verification_status in ('lead','stale')
      and (v_counties is null or public.fg_county_key(f.county) = any (v_counties))
    union all
    select jsonb_build_object('kind','fair','id',f.id,'severity','info',
             'message', f.name || ' has no county, so it cannot be placed in a region.')
    from public.fair_events f
    where f.state_code = v_state and coalesce(f.active, true) and v_counties is null
      and public.fg_clean_county(f.county) is null
      and coalesce(array_length(f.counties_served, 1), 0) = 0
    union all
    select jsonb_build_object('kind','fair','id',f.id,'severity','info',
             'message', f.name || ' has no website link.')
    from public.fair_events f
    where f.state_code = v_state and coalesce(f.active, true)
      and nullif(trim(coalesce(f.website_url, '')), '') is null
      and (v_counties is null or public.fg_county_key(f.county) = any (v_counties))
    union all
    select jsonb_build_object('kind','fair','id',f.id,'severity','info',
             'message', f.name || ' ended on ' || to_char(coalesce(f.event_end_date, f.event_start_date), 'FMMon FMDD, YYYY')
                        || ' and has no date for the next fair yet.')
    from public.fair_events f
    where f.state_code = v_state and coalesce(f.active, true)
      and coalesce(f.event_end_date, f.event_start_date) < current_date - 30
      and (v_counties is null or public.fg_county_key(f.county) = any (v_counties))
    union all
    -- Judges
    select jsonb_build_object('kind','judge','id',j.id,'severity','warn',
             'message', coalesce(j.name, 'A judge') || ' has no county, so they are not in any region.')
    from public.judges j
    where j.state_code = v_state and v_counties is null
      and coalesce(to_jsonb(j) ->> 'country', 'US') = 'US'
      and public.fg_clean_county(j.county) is null
      and coalesce(j.status, '') <> 'inactive'
    union all
    select jsonb_build_object('kind','judge','id',j.id,'severity','info',
             'message', coalesce(j.name, 'A judge') || ' applied ' ||
                        to_char(j.created_at, 'FMMon FMDD') || ' and is still waiting for review.')
    from public.judges j
    where j.state_code = v_state and j.status = 'unverified'
      and coalesce(to_jsonb(j) ->> 'country', 'US') = 'US'
      and (v_counties is null or public.fg_county_key(j.county) = any (v_counties))
    union all
    -- Judges whose county is not in any region (only once regions exist)
    select jsonb_build_object('kind','judge','id',j.id,'severity','info',
             'message', coalesce(j.name, 'A judge') || ' is in ' || public.fg_clean_county(j.county)
                        || ' County, which is not in any region yet.')
    from public.judges j
    where j.state_code = v_state and v_counties is null
      and coalesce(to_jsonb(j) ->> 'country', 'US') = 'US'
      and public.fg_clean_county(j.county) is not null
      and exists (select 1 from public.state_regions r where r.state_code = v_state)
      and not exists (select 1 from public.state_regions r, unnest(r.counties) c
                      where r.state_code = v_state
                        and public.fg_county_key(c) = public.fg_county_key(j.county))
    union all
    -- Regions
    select jsonb_build_object('kind','region','id',r.id,'severity','warn',
             'message', 'Region "' || r.name || '" has no counties.')
    from public.state_regions r
    where r.state_code = v_state and (p_region is null or r.id = p_region)
      and coalesce(array_length(r.counties, 1), 0) = 0
    union all
    select jsonb_build_object('kind','region','id',r.id,'severity','info',
             'message', 'Region "' || r.name || '" has no coordinator yet.')
    from public.state_regions r
    where r.state_code = v_state and p_region is null
      and not exists (select 1 from public.user_roles ur
                      where ur.region_id = r.id and ur.role = 'regional_coordinator')
  ) s;

  return jsonb_build_object(
    'state_code', v_state,
    'viewer', v_viewer,
    'region', case when p_region is null then null
                   else jsonb_build_object('id', v_region.id, 'name', v_region.name,
                                           'counties', v_region.counties) end,
    'fairs', v_fairs,
    'judges', v_judges,
    'regions', v_regions,
    'people', v_people,
    'invites', v_invites,
    'issues', v_issues,
    'generated_at', now());
end;
$$;


-- ---------------------------------------------------------------------
-- UNDO PART 1 (only if you want the old verified flags back)
-- ---------------------------------------------------------------------
-- update public.fair_events
--    set verification_status = previous_verification_status
--  where previous_verification_status is not null
--    and verification_status = 'lead';
