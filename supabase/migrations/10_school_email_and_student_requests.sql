-- =====================================================================
-- FairGame Initiative
-- Migration 10: School email addresses, and students who never got queued
-- Run after 07, 08 and 09. Safe to run more than once.
-- =====================================================================
--
-- PART ONE - SCHOOL EMAIL ADDRESSES
--
--   Students and teachers should be signing up with a school address,
--   not a personal one. That is the goal here.
--
--   A note on '.edu' specifically. In the United States .edu is almost
--   entirely higher education - it is restricted, and K-12 districts
--   generally cannot get one. The schools FairGame actually serves use
--   things like:
--
--       columbus.k12.oh.us          a state K-12 domain
--       cps-k12.org                 Cincinnati Public Schools
--       walnuthillseagles.com       an individual school
--
--   A strict "must end in .edu" rule would turn away nearly every real
--   K-12 teacher and student while admitting any university student who
--   asked. So fg_is_school_email accepts .edu AND the standard K-12
--   patterns, plus an allowlist an admin can add district domains to as
--   schools come on board, without needing a code change.
--
--   If you would rather have the strict rule anyway, set the flag in
--   fg_school_email_policy to 'edu_only' - see PART 1c.
--
--   This applies to accounts created from now on. Nobody currently
--   holding a role loses it, because enforcement sits in the role claim
--   rather than in a check over the existing table.
--
-- PART TWO - STUDENTS WHO REGISTERED BUT WERE NEVER QUEUED
--
--   Registering an account and asking for a mentor were two unrelated
--   acts. The matcher lists portal_requests rows of type
--   'student_mentor_request', which only the public mentor request form
--   ever created. A student who signed up for an account - and even one
--   who pressed "Request a Mentor" inside their own portal, which only
--   sent a message - never appeared in the queue at all.
--
--   fg_students_without_request finds them, and
--   fg_create_student_request puts one in the queue properly.
-- =====================================================================


do $$
begin
  if to_regprocedure('public.fg_is_admin()') is null then
    raise exception 'Missing public.fg_is_admin(). Run migration 01 first.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- PART 1a - THE DISTRICT ALLOWLIST
-- ---------------------------------------------------------------------
-- Every domain here is accepted, alongside the built-in patterns below.
-- Subdomains count, so adding 'cps-k12.org' also admits
-- 'students.cps-k12.org'.

create table if not exists public.school_email_domains (
  domain     text primary key,
  school_name text,
  note       text,
  added_by   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.school_email_domains enable row level security;

-- Readable by anyone signed in, so the signup form can explain itself.
-- Only an admin may add to it.
drop policy if exists "school_domains_read" on public.school_email_domains;
create policy "school_domains_read" on public.school_email_domains
  for select to authenticated using (true);

drop policy if exists "school_domains_admin" on public.school_email_domains;
create policy "school_domains_admin" on public.school_email_domains
  for all to authenticated
  using (public.fg_is_admin()) with check (public.fg_is_admin());

comment on table public.school_email_domains is
  'District and school email domains accepted at signup, beyond the built-in .edu and K-12 patterns. Subdomains are included.';


-- ---------------------------------------------------------------------
-- PART 1b - THE POLICY SWITCH
-- ---------------------------------------------------------------------
-- 'school'   accepts .edu, K-12 patterns, and the allowlist  (default)
-- 'edu_only' accepts only .edu - strict, and will turn away most K-12
-- 'off'      accepts anything, which is how it behaved before today

create table if not exists public.fg_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

insert into public.fg_settings (key, value)
values ('school_email_policy', 'school')
on conflict (key) do nothing;

alter table public.fg_settings enable row level security;

drop policy if exists "fg_settings_read" on public.fg_settings;
create policy "fg_settings_read" on public.fg_settings
  for select to authenticated using (true);

drop policy if exists "fg_settings_admin" on public.fg_settings;
create policy "fg_settings_admin" on public.fg_settings
  for all to authenticated
  using (public.fg_is_admin()) with check (public.fg_is_admin());


-- ---------------------------------------------------------------------
-- PART 1c - THE TEST
-- ---------------------------------------------------------------------

create or replace function public.fg_is_school_email(p_email text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_domain text;
  v_policy text;
begin
  if p_email is null or position('@' in p_email) = 0 then
    return false;
  end if;

  v_domain := lower(split_part(trim(p_email), '@', 2));
  if v_domain = '' then return false; end if;

  select value into v_policy from public.fg_settings where key = 'school_email_policy';
  v_policy := coalesce(v_policy, 'school');

  if v_policy = 'off' then
    return true;
  end if;

  -- Strict: higher education only.
  if v_domain like '%.edu' then
    return true;
  end if;

  if v_policy = 'edu_only' then
    return false;
  end if;

  -- ── The K-12 patterns ──────────────────────────────────────────────
  -- k12.<state>.us is the long-standing US schools convention, e.g.
  -- columbus.k12.oh.us. The second form catches districts that put k12
  -- in the name itself, e.g. cps-k12.org.
  if v_domain ~ '\.k12\.[a-z]{2}\.us$' then return true; end if;
  if v_domain ~ '(^|[.-])k12([.-]|$)'   then return true; end if;

  -- Academic domains outside the US, e.g. ac.uk, edu.au, sch.uk.
  if v_domain ~ '\.(ac|edu|sch)\.[a-z]{2}$' then return true; end if;

  -- ── The allowlist, including subdomains ────────────────────────────
  if exists (
    select 1 from public.school_email_domains d
    where v_domain = lower(d.domain)
       or v_domain like '%.' || lower(d.domain)
  ) then
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.fg_is_school_email(text) to anon, authenticated;

comment on function public.fg_is_school_email(text) is
  'True when an address looks like a school one. Governed by fg_settings.school_email_policy: school (default), edu_only, or off.';


-- ---------------------------------------------------------------------
-- PART 1d - ENFORCEMENT
-- ---------------------------------------------------------------------
-- The browser check on the signup form is for the person filling it in.
-- This is the one that actually holds, because it sits on the only path
-- that grants a student or teacher their role. Replaces the version
-- from migration 06; ambassador is deliberately left alone, since a
-- student ambassador may well be signing up before they have a school
-- address issued.

create or replace function public.fg_self_provision_role(p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  text;
  v_name  text;
  v_email text;
begin
  if p_role not in ('student', 'ambassador', 'teacher') then
    raise exception 'Role % cannot be self-provisioned', p_role;
  end if;

  select email into v_email from auth.users where id = auth.uid();

  -- Anyone who already holds a role keeps it, whatever their address.
  -- This gate is for new claims only.
  select role into v_role from public.user_roles where user_id = auth.uid();
  if v_role is not null then
    return v_role;
  end if;

  if p_role in ('student', 'teacher') and not public.fg_is_school_email(v_email) then
    raise exception
      'A school email address is required for a % account. % is not one we recognise. If your school''s domain is missing, email fairgameinitiative@outlook.com and we will add it.',
      p_role, coalesce(v_email, '(no address)');
  end if;

  v_name := auth.jwt() -> 'user_metadata' ->> 'name';

  insert into public.user_roles (user_id, role, full_name)
  values (auth.uid(), p_role, v_name)
  on conflict (user_id) do nothing;

  select role into v_role from public.user_roles where user_id = auth.uid();
  return v_role;
end;
$$;

grant execute on function public.fg_self_provision_role(text) to authenticated;


-- ---------------------------------------------------------------------
-- PART 2a - STUDENTS WHO ARE NOT IN THE QUEUE
-- ---------------------------------------------------------------------
-- A registered student with no open mentor request. This is the list
-- that explains "I registered but nobody can match me".

create or replace function public.fg_students_without_request()
returns table (
  user_id       uuid,
  email         text,
  full_name     text,
  registered_at timestamptz,
  project_title text,
  project_field text,
  school        text,
  grade         text
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id,
         u.email::text,
         coalesce(r.full_name, u.raw_user_meta_data ->> 'name', split_part(u.email::text, '@', 1)),
         u.created_at,
         p.title,
         p.field,
         coalesce(p.school, u.raw_user_meta_data ->> 'school'),
         p.grade
  from auth.users u
  join public.user_roles r on r.user_id = u.id and r.role = 'student'
  left join public.student_projects p on p.student_id = u.id
  where public.fg_is_admin()
    -- Nothing open in the queue for this address.
    and not exists (
      select 1 from public.portal_requests pr
      where pr.type = 'student_mentor_request'
        and lower(pr.email) = lower(u.email::text)
        and pr.status in ('pending', 'active')
    )
    -- And not already in a live match.
    and not exists (
      select 1 from public.mentorships m
      where lower(coalesce(m.student_email, '')) = lower(u.email::text)
        and m.status in ('pending', 'active')
    )
  order by u.created_at;
$$;

grant execute on function public.fg_students_without_request() to authenticated;


-- ---------------------------------------------------------------------
-- PART 2b - PUT ONE IN THE QUEUE
-- ---------------------------------------------------------------------
-- Raises the portal_requests row the matcher reads. Callable by an
-- admin on a student's behalf, and by a student for themselves - the
-- portal's own "Request a Mentor" button now goes through here, which
-- is what it should have been doing all along.

create or replace function public.fg_create_student_request(
  p_user_id uuid    default null,
  p_topics  text[]  default null,
  p_format  text    default null,
  p_title   text    default null,
  p_desc    text    default null,
  p_grade   text    default null,
  p_school  text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid;
  v_email  text;
  v_name   text;
  v_proj   public.student_projects;
  v_id     uuid;
  v_topics text[];
begin
  -- Default to the caller. An admin may name someone else; nobody else may.
  v_uid := coalesce(p_user_id, auth.uid());
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  if v_uid <> auth.uid() and not public.fg_is_admin() then
    raise exception 'Only an admin can raise a request for another person';
  end if;

  select email::text, coalesce(raw_user_meta_data ->> 'name', split_part(email::text, '@', 1))
    into v_email, v_name
  from auth.users where id = v_uid;

  if v_email is null then
    raise exception 'No account found for that id';
  end if;

  -- Reuse an open request rather than stacking duplicates; a student
  -- pressing the button twice should not appear in the queue twice.
  select id into v_id from public.portal_requests
  where type = 'student_mentor_request'
    and lower(email) = lower(v_email)
    and status in ('pending', 'active')
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select * into v_proj from public.student_projects where student_id = v_uid;

  -- Topics drive the whole match score, so fall back to the project's
  -- field when none were given rather than queueing a blank request.
  v_topics := coalesce(
    p_topics,
    case when coalesce(p_title, v_proj.field) is not null
         then array_remove(array[coalesce(v_proj.field, '')], '')
         else null end);

  insert into public.portal_requests (name, email, school, type, status, data)
  values (
    coalesce(v_name, 'Student'),
    v_email,
    coalesce(p_school, v_proj.school, ''),
    'student_mentor_request',
    'pending',
    jsonb_strip_nulls(jsonb_build_object(
      'topics', to_jsonb(coalesce(v_topics, '{}'::text[])),
      'format', coalesce(p_format, 'Either works'),
      'title',  coalesce(p_title, v_proj.title),
      'desc',   coalesce(p_desc,  v_proj.description),
      'grade',  coalesce(p_grade, v_proj.grade),
      'source', case when v_uid = auth.uid() then 'student_portal' else 'admin_on_behalf' end
    ))
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.fg_create_student_request(uuid, text[], text, text, text, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- PART 3 - REPORT BACK
-- ---------------------------------------------------------------------
do $$
declare
  v_students integer;
  v_queued   integer;
  v_nonschool integer;
begin
  select count(*) into v_students from public.user_roles where role = 'student';
  select count(*) into v_queued from public.portal_requests
    where type = 'student_mentor_request' and status in ('pending','active');

  select count(*) into v_nonschool
  from auth.users u
  join public.user_roles r on r.user_id = u.id
  where r.role in ('student','teacher')
    and not public.fg_is_school_email(u.email::text);

  raise notice '';
  raise notice '─────────────────────────────────────────────────';
  raise notice 'Migration 10 applied. Nothing was deleted.';
  raise notice '';
  raise notice 'School email rule is ON, policy = school';
  raise notice '  Accepts .edu, k12 patterns, ac.uk style, and the';
  raise notice '  allowlist in public.school_email_domains.';
  raise notice '';
  raise notice '  % existing student/teacher account(s) would not pass it.', v_nonschool;
  raise notice '  They keep their access - the rule applies to new claims.';
  raise notice '';
  raise notice '  To add a district:';
  raise notice '    insert into public.school_email_domains (domain, school_name)';
  raise notice '    values (''cps-k12.org'', ''Cincinnati Public Schools'');';
  raise notice '';
  raise notice '  For strict .edu only:';
  raise notice '    update public.fg_settings set value = ''edu_only''';
  raise notice '    where key = ''school_email_policy'';';
  raise notice '';
  raise notice 'Registered students: %   In the mentor queue: %', v_students, v_queued;
  raise notice '  Run  select * from public.fg_students_without_request();';
  raise notice '  to see who registered but was never queued.';
  raise notice '─────────────────────────────────────────────────';
end $$;

-- =====================================================================
-- END MIGRATION 10
-- =====================================================================
