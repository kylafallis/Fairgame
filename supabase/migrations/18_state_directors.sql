-- ---------------------------------------------------------------------
-- MIGRATION 18 - STATE DIRECTORS, REGIONAL COORDINATORS AND INVITE LINKS
-- ---------------------------------------------------------------------
-- Run after 16 (and after 17_homepage_stats.sql if that branch has been
-- merged - the two do not touch each other). Safe to run more than once.
--
-- What this adds:
--
--   Two roles. A state director looks after one state; a regional
--   coordinator looks after one region inside a state. Both live in
--   user_roles like every other role, using the state_code column that
--   has been on that table since migration 01, plus a new region_id.
--
--   Regions. A state director groups their state's counties into named
--   regions ("Northwest Ohio": Allen, Lucas, Wood...). A county can sit
--   in at most one region of a state, so a coordinator's patch is never
--   ambiguous. Judges are placed into regions by county, which migration
--   19 fills in.
--
--   Invitations. Nobody can make themselves a state director. An admin
--   (or, for coordinators, that state's director) creates an invitation,
--   which produces a one-time link. Only a SHA-256 fingerprint of the
--   link's secret is stored, never the secret itself, so the link is
--   shown once and cannot be looked up again - a lost link is revoked
--   and a new one made. Links expire after 14 days, work once, and only
--   for the email address they were sent to.
--
--   The state view. fg_state_overview() returns everything the state
--   page shows in one call: fairs, judges (no contact details), regions,
--   coordinators, open invitations, and a list of things that look
--   wrong. It checks who is asking, so an admin can preview any state
--   exactly as its director will see it, a director sees only their own
--   state, and a coordinator only their own region.
--
-- Everything a director or coordinator can do goes through the
-- security-definer functions below. Neither role gets direct write access
-- to any table, and neither gets judges' email addresses or phone numbers.


-- ---------------------------------------------------------------------
-- PART 1 - THE TWO ROLES
-- ---------------------------------------------------------------------

alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('admin','teacher','ambassador','judge',
                  'fair_manager','student','parent','mentor','inactive',
                  'state_director','regional_coordinator'));


-- ---------------------------------------------------------------------
-- PART 2 - REGIONS
-- ---------------------------------------------------------------------
-- counties holds bare county names as migration 19 stores them on
-- judges ("Franklin", not "Franklin County"), so the two compare
-- directly.

create table if not exists public.state_regions (
  id          uuid primary key default gen_random_uuid(),
  state_code  char(2) not null check (state_code ~ '^[A-Z]{2}$'),
  name        text not null check (length(trim(name)) between 1 and 80),
  counties    text[] not null default '{}',
  notes       text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists state_regions_name_uidx
  on public.state_regions (state_code, lower(name));
create index if not exists state_regions_counties_gin
  on public.state_regions using gin (counties);

drop trigger if exists state_regions_touch on public.state_regions;
create trigger state_regions_touch before update on public.state_regions
  for each row execute function public.fg_touch_updated_at();

alter table public.user_roles add column if not exists region_id uuid
  references public.state_regions(id) on delete set null;

comment on column public.user_roles.state_code is
  'For state_director and regional_coordinator: the one state the account covers. Unused by other roles.';
comment on column public.user_roles.region_id is
  'For regional_coordinator: the one region the account covers. Deleting the region leaves the coordinator with no region (and an empty view) rather than deleting the account.';


-- ---------------------------------------------------------------------
-- PART 3 - WHO IS ASKING
-- ---------------------------------------------------------------------

create or replace function public.fg_my_scope()
returns table (role text, state_code char(2), region_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select ur.role, ur.state_code, ur.region_id
  from public.user_roles ur
  where ur.user_id = auth.uid();
$$;

grant execute on function public.fg_my_scope() to authenticated;

-- True for an admin, or the director of exactly this state.
create or replace function public.fg_can_manage_state(p_state char(2))
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select ur.role = 'admin'
        or (ur.role = 'state_director' and ur.state_code = upper(p_state))
    from public.user_roles ur
    where ur.user_id = auth.uid()
  ), false);
$$;

grant execute on function public.fg_can_manage_state(char) to authenticated;

-- Regions: everyone who can see a state can read its regions; writes go
-- through fg_save_region / fg_delete_region below.
alter table public.state_regions enable row level security;

drop policy if exists "state_regions_read" on public.state_regions;
create policy "state_regions_read" on public.state_regions
  for select to authenticated
  using (
    public.fg_can_manage_state(state_code)
    or exists (select 1 from public.user_roles ur
               where ur.user_id = auth.uid()
                 and ur.role = 'regional_coordinator'
                 and ur.region_id = state_regions.id)
  );

drop policy if exists "state_regions_admin_write" on public.state_regions;
create policy "state_regions_admin_write" on public.state_regions
  for all to authenticated
  using (public.fg_is_admin()) with check (public.fg_is_admin());


-- ---------------------------------------------------------------------
-- PART 4 - SAVING AND DELETING REGIONS
-- ---------------------------------------------------------------------
-- County names are trimmed, stripped of a trailing "County"/"Parish"/
-- "Borough", de-duplicated and sorted. A county already in another
-- region of the same state is refused with the region's name, so the
-- director knows where to take it out.

create or replace function public.fg_clean_county(p text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(regexp_replace(
      regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'),
      '\s+(county|parish|borough|census area|city and borough|municipality)$', '', 'i')),
    '');
$$;

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
    and lower(c) = any (select lower(x) from unnest(v_counties) x)
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

grant execute on function public.fg_save_region(uuid, char, text, text[], text) to authenticated;

create or replace function public.fg_delete_region(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state char(2);
begin
  select state_code into v_state from public.state_regions where id = p_id;
  if not found then return; end if;
  if not public.fg_can_manage_state(v_state) then
    raise exception 'You can only delete regions in your own state.';
  end if;
  -- Open coordinator invitations for this region would otherwise point
  -- at nothing; withdraw them along with it.
  update public.role_invites
     set revoked_at = now(), revoked_by = auth.uid()
   where region_id = p_id and accepted_at is null and revoked_at is null;
  delete from public.state_regions where id = p_id;
end;
$$;


-- ---------------------------------------------------------------------
-- PART 5 - INVITATIONS
-- ---------------------------------------------------------------------

create table if not exists public.role_invites (
  id           uuid primary key default gen_random_uuid(),
  role         text not null check (role in ('state_director','regional_coordinator')),
  email        text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  full_name    text,
  state_code   char(2) not null check (state_code ~ '^[A-Z]{2}$'),
  region_id    uuid references public.state_regions(id) on delete set null,
  -- SHA-256 of the secret in the link, hex. The secret itself is never stored.
  token_hash   text not null unique,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '14 days',
  emailed_at   timestamptz,
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users(id) on delete set null,
  revoked_at   timestamptz,
  revoked_by   uuid references auth.users(id) on delete set null
);

create index if not exists role_invites_state_idx on public.role_invites (state_code);
create index if not exists role_invites_email_idx on public.role_invites (lower(email));

alter table public.role_invites enable row level security;

-- Admins see every invitation; a director sees the coordinator
-- invitations for their own state. Nobody writes directly - create,
-- revoke and accept are the functions below.
drop policy if exists "role_invites_read" on public.role_invites;
create policy "role_invites_read" on public.role_invites
  for select to authenticated
  using (
    public.fg_is_admin()
    or (role = 'regional_coordinator' and public.fg_can_manage_state(state_code))
  );

-- The fingerprint is useless without the secret, but there is no reason
-- for a browser to ever hold it either.
revoke all on public.role_invites from anon, authenticated;
grant select (id, role, email, full_name, state_code, region_id, created_by, created_at,
              expires_at, emailed_at, accepted_at, accepted_by, revoked_at, revoked_by)
  on public.role_invites to authenticated;

comment on table public.role_invites is
  'One-time invitation links for state directors and regional coordinators. token_hash is SHA-256 of the secret in the link; the secret is shown once by fg_create_invite and never stored.';

create or replace function public.fg_invite_hash(p_token text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- "kyla@gmail.com" -> "k***@gmail.com". Enough for the person holding the
-- link to know which account to sign in with, without spelling it out.
create or replace function public.fg_mask_email(p text)
returns text
language sql
immutable
as $$
  select case when p is null or position('@' in p) = 0 then null
              else left(p, 1) || '***' || substr(p, position('@' in p)) end;
$$;

-- Creates an invitation and returns the secret, once.
--   Admin:          state_director for any state, or regional_coordinator
--                   for any region.
--   State director: regional_coordinator for a region in their own state.
-- An earlier open invitation for the same person and role is withdrawn,
-- so only the newest link works.
create or replace function public.fg_create_invite(
  p_role      text,
  p_email     text,
  p_full_name text,
  p_state     char(2) default null,
  p_region_id uuid    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_state  char(2) := upper(p_state);
  v_token  text;
  v_row    public.role_invites;
  v_region public.state_regions;
begin
  if p_role not in ('state_director', 'regional_coordinator') then
    raise exception 'Unknown role %.', p_role;
  end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'That email address does not look right.';
  end if;

  if p_role = 'state_director' then
    if not public.fg_is_admin() then
      raise exception 'Only an admin can invite a state director.';
    end if;
    if v_state is null or v_state !~ '^[A-Z]{2}$' then
      raise exception 'Pick a state.';
    end if;
  else
    select * into v_region from public.state_regions where id = p_region_id;
    if not found then
      raise exception 'Pick a region. A state director has to draw regions before coordinators can be invited.';
    end if;
    v_state := v_region.state_code;
    if not public.fg_can_manage_state(v_state) then
      raise exception 'You can only invite coordinators for your own state.';
    end if;
  end if;

  update public.role_invites
     set revoked_at = now(), revoked_by = auth.uid()
   where lower(email) = v_email and role = p_role
     and accepted_at is null and revoked_at is null;

  -- 32 random bytes, URL-safe base64 without padding: 43 characters.
  v_token := translate(rtrim(encode(gen_random_bytes(32), 'base64'), '='), '+/', '-_');

  insert into public.role_invites (role, email, full_name, state_code, region_id, token_hash, created_by)
  values (p_role, v_email, nullif(trim(coalesce(p_full_name, '')), ''), v_state,
          case when p_role = 'regional_coordinator' then p_region_id end,
          public.fg_invite_hash(v_token), auth.uid())
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id, 'token', v_token, 'role', v_row.role, 'email', v_row.email,
    'full_name', v_row.full_name, 'state_code', v_row.state_code,
    'region_id', v_row.region_id, 'region_name', v_region.name,
    'expires_at', v_row.expires_at);
end;
$$;

grant execute on function public.fg_create_invite(text, text, text, char, uuid) to authenticated;

create or replace function public.fg_revoke_invite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.role_invites;
begin
  select * into v_row from public.role_invites where id = p_id;
  if not found then return; end if;
  if not (public.fg_is_admin()
          or (v_row.role = 'regional_coordinator' and public.fg_can_manage_state(v_row.state_code))) then
    raise exception 'You cannot revoke that invitation.';
  end if;
  update public.role_invites
     set revoked_at = now(), revoked_by = auth.uid()
   where id = p_id and accepted_at is null and revoked_at is null;
end;
$$;

grant execute on function public.fg_revoke_invite(uuid) to authenticated;

-- Stamped by the create-invite Edge Function once the email has gone.
create or replace function public.fg_mark_invite_emailed(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.role_invites set emailed_at = now()
  where id = p_id and created_by = auth.uid() and emailed_at is null;
$$;

grant execute on function public.fg_mark_invite_emailed(uuid) to authenticated;

-- What the accept page shows before anyone signs in. Callable without an
-- account; reveals nothing without the secret, and only a masked email
-- with it.
create or replace function public.fg_invite_preview(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'role', i.role,
    'state_code', i.state_code,
    'region_name', r.name,
    'full_name', i.full_name,
    'email_hint', public.fg_mask_email(i.email),
    'expires_at', i.expires_at,
    'status', case when i.revoked_at  is not null then 'revoked'
                   when i.accepted_at is not null then 'accepted'
                   when i.expires_at < now()      then 'expired'
                   else 'open' end)
  from public.role_invites i
  left join public.state_regions r on r.id = i.region_id
  where i.token_hash = public.fg_invite_hash(p_token);
$$;

grant execute on function public.fg_invite_preview(text) to anon, authenticated;

-- Redeems a link for the signed-in person. The address on the account
-- must be the address the invitation was sent to, so a forwarded or
-- leaked link is no use to anyone else. An admin is never demoted by
-- accepting; they already see every state.
create or replace function public.fg_accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text;
  v_name  text;
  v_role  text;
  v_inv   public.role_invites;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    raise exception 'Sign in first.';
  end if;

  select * into v_inv from public.role_invites
  where token_hash = public.fg_invite_hash(p_token)
  for update;

  if not found then
    raise exception 'This invitation link is not valid. Check that the whole link was copied.';
  end if;
  if v_inv.accepted_at is not null then
    if v_inv.accepted_by = auth.uid() then
      return jsonb_build_object('role', v_inv.role, 'state_code', v_inv.state_code,
                                'region_id', v_inv.region_id, 'already', true);
    end if;
    raise exception 'This invitation has already been used.';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'This invitation was withdrawn. Ask whoever sent it for a new link.';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'This invitation expired on %. Ask whoever sent it for a new link.',
      to_char(v_inv.expires_at, 'FMMonth FMDD, YYYY');
  end if;
  if lower(trim(v_email)) <> lower(v_inv.email) then
    raise exception 'This invitation was sent to %. You are signed in as %. Sign out and sign in with the invited address.',
      public.fg_mask_email(v_inv.email), v_email;
  end if;
  if v_inv.role = 'regional_coordinator' and v_inv.region_id is null then
    raise exception 'The region this invitation was for has been deleted. Ask for a new link.';
  end if;

  select role into v_role from public.user_roles where user_id = auth.uid();
  if v_role = 'admin' then
    raise exception 'You are an admin, which already covers every state. Nothing to accept.';
  end if;

  v_name := coalesce(v_inv.full_name,
                     auth.jwt() -> 'user_metadata' ->> 'name',
                     split_part(v_email, '@', 1));

  insert into public.user_roles (user_id, role, full_name, state_code, region_id)
  values (auth.uid(), v_inv.role, v_name, v_inv.state_code, v_inv.region_id)
  on conflict (user_id) do update
    set role       = excluded.role,
        state_code = excluded.state_code,
        region_id  = excluded.region_id,
        full_name  = coalesce(user_roles.full_name, excluded.full_name);

  update public.role_invites
     set accepted_at = now(), accepted_by = auth.uid()
   where id = v_inv.id;

  return jsonb_build_object('role', v_inv.role, 'state_code', v_inv.state_code,
                            'region_id', v_inv.region_id, 'previous_role', v_role);
end;
$$;

grant execute on function public.fg_accept_invite(text) to authenticated;

-- Taking someone off a state or region. Their account stays; it just has
-- no portal until given another role.
create or replace function public.fg_remove_state_role(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_roles;
begin
  select * into v_row from public.user_roles where user_id = p_user_id;
  if not found or v_row.role not in ('state_director', 'regional_coordinator') then
    return;
  end if;
  if not (public.fg_is_admin()
          or (v_row.role = 'regional_coordinator' and public.fg_can_manage_state(v_row.state_code))) then
    raise exception 'You cannot remove that person.';
  end if;
  update public.user_roles set role = 'inactive', region_id = null where user_id = p_user_id;
end;
$$;

grant execute on function public.fg_remove_state_role(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- PART 6 - THE STATE VIEW
-- ---------------------------------------------------------------------
-- One call returns the whole page. p_region narrows it to one region;
-- for a coordinator it is always their own region whatever is passed.
--
-- Judges come back with a fixed list of columns and no email, phone,
-- notes, LinkedIn or background-check details. Columns are picked out of
-- to_jsonb(row) rather than named in a select, so a column that a live
-- database happens not to have yet is just missing, not an error.

create or replace function public.fg_pick(p jsonb, p_keys text[])
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(p) where key = any (p_keys);
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
    'cycle_year','active','isef_affiliate'];
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
    select coalesce(array_agg(lower(c)), '{}') into v_counties from unnest(v_region.counties) c;
  end if;

  -- Fairs. A regional view keeps fairs held in, or serving, its counties.
  select coalesce(jsonb_agg(public.fg_pick(to_jsonb(f), v_fair_keys)
                            order by f.event_start_date nulls last, f.name), '[]')
    into v_fairs
  from public.fair_events f
  where f.state_code = v_state
    and coalesce(f.active, true)
    and (v_counties is null
         or lower(public.fg_clean_county(f.county)) = any (v_counties)
         or exists (select 1 from unnest(f.counties_served) cs
                    where lower(public.fg_clean_county(cs)) = any (v_counties)));

  -- Judges, contact details left out.
  select coalesce(jsonb_agg(public.fg_pick(to_jsonb(j), v_judge_keys)
                            order by j.name), '[]')
    into v_judges
  from public.judges j
  where j.state_code = v_state
    and coalesce(to_jsonb(j) ->> 'country', 'US') = 'US'
    and (v_counties is null or lower(public.fg_clean_county(j.county)) = any (v_counties));

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
      and (v_counties is null or lower(public.fg_clean_county(f.county)) = any (v_counties))
    union all
    select jsonb_build_object('kind','fair','id',f.id,'severity','warn',
             'message', f.name || ' has not been verified (' || f.verification_status || ').')
    from public.fair_events f
    where f.state_code = v_state and coalesce(f.active, true)
      and f.verification_status in ('lead','stale')
      and (v_counties is null or lower(public.fg_clean_county(f.county)) = any (v_counties))
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
      and (v_counties is null or lower(public.fg_clean_county(f.county)) = any (v_counties))
    union all
    select jsonb_build_object('kind','fair','id',f.id,'severity','info',
             'message', f.name || ' ended on ' || to_char(coalesce(f.event_end_date, f.event_start_date), 'FMMon FMDD, YYYY')
                        || ' and has no date for the next fair yet.')
    from public.fair_events f
    where f.state_code = v_state and coalesce(f.active, true)
      and coalesce(f.event_end_date, f.event_start_date) < current_date - 30
      and (v_counties is null or lower(public.fg_clean_county(f.county)) = any (v_counties))
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
      and (v_counties is null or lower(public.fg_clean_county(j.county)) = any (v_counties))
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
                        and lower(c) = lower(public.fg_clean_county(j.county)))
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

grant execute on function public.fg_state_overview(char, uuid) to authenticated;

-- Admin overview: how far along each state is. Feeds the admin page's
-- state picker so the states with work in them are easy to find.
create or replace function public.fg_state_summary()
returns table (state_code char(2), judges bigint, fairs bigint, regions bigint,
               directors bigint, coordinators bigint, open_invites bigint)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select j.state_code from public.judges j
     where j.state_code ~ '^[A-Z]{2}$' and coalesce(to_jsonb(j) ->> 'country', 'US') = 'US'
    union select f.state_code from public.fair_events f
    union select r.state_code from public.state_regions r
    union select i.state_code from public.role_invites i
  )
  select s.state_code,
    (select count(*) from public.judges j where j.state_code = s.state_code
       and coalesce(to_jsonb(j) ->> 'country', 'US') = 'US'),
    (select count(*) from public.fair_events f where f.state_code = s.state_code and coalesce(f.active, true)),
    (select count(*) from public.state_regions r where r.state_code = s.state_code),
    (select count(*) from public.user_roles ur where ur.state_code = s.state_code and ur.role = 'state_director'),
    (select count(*) from public.user_roles ur where ur.state_code = s.state_code and ur.role = 'regional_coordinator'),
    (select count(*) from public.role_invites i where i.state_code = s.state_code
       and i.accepted_at is null and i.revoked_at is null and i.expires_at > now())
  from s
  where public.fg_is_admin()
  order by s.state_code;
$$;

grant execute on function public.fg_state_summary() to authenticated;

-- fg_delete_region is defined before role_invites exists in this file;
-- plpgsql resolves the table when the function runs, so that is fine.
grant execute on function public.fg_delete_region(uuid) to authenticated;
