-- =====================================================================
-- FairGame - DIAGNOSTIC ONLY
-- =====================================================================
-- This script writes NOTHING. Every statement is a SELECT. It is safe
-- to run as many times as you like, and safe to run at any point.
--
-- Run it in the Supabase SQL editor. That editor connects as the
-- 'postgres' role, which BYPASSES row level security - so any row it
-- shows you is really there, whether or not the website can see it.
--
-- Run each section and keep the output. Section 1 is the one that
-- answers "did I lose anything".
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. IS MY DATA STILL THERE?
-- ---------------------------------------------------------------------
-- Every table the site uses, and how many rows are in it right now.
-- A table that does not exist shows as 'MISSING' rather than erroring.

select
  t.name                                      as table_name,
  case when c.oid is null then 'MISSING' else 'exists' end as state,
  case when c.oid is null then null
       else (select n_live_tup from pg_stat_user_tables s
             where s.relname = t.name and s.schemaname = 'public')
  end                                         as approx_rows
from (values
  ('user_roles'), ('portal_requests'), ('judges'), ('fairs'),
  ('students'), ('documents'), ('events'), ('stats'),
  ('messages'), ('community_posts'), ('student_projects'),
  ('judge_requests'), ('resource_downloads'), ('email_subscribers'),
  ('mentorships'), ('mentorship_sessions'),
  ('guardian_consents'), ('mentor_messages'), ('mentor_attestations')
) as t(name)
left join pg_class c
  on c.relname = t.name
 and c.relnamespace = 'public'::regnamespace
 and c.relkind = 'r'
order by state, t.name;


-- ---------------------------------------------------------------------
-- 2. EXACT COUNTS FOR THE TABLES THAT MATTER MOST
-- ---------------------------------------------------------------------
-- Section 1 uses statistics, which can lag. These are exact.
-- If a table is MISSING above, its line here will error - that is fine,
-- just run the others.

select 'user_roles'      as tbl, count(*) from public.user_roles
union all select 'portal_requests', count(*) from public.portal_requests
union all select 'judges',          count(*) from public.judges
union all select 'fairs',           count(*) from public.fairs;


-- ---------------------------------------------------------------------
-- 3. DID MIGRATION 07 AND 08 ACTUALLY LAND?
-- ---------------------------------------------------------------------
-- Each function either exists or it does not. This tells you exactly
-- how far each script got.

select
  f.name as function_name,
  f.from_migration,
  case when p.oid is null then 'NOT CREATED' else 'exists' end as state
from (values
  ('fg_consent_is_valid',            '07'),
  ('fg_mentorship_channel_open',     '07'),
  ('fg_suggest_mentor_matches',      '07'),
  ('fg_scan_contact_info',           '07'),
  ('fg_scan_safeguarding',           '07'),
  ('fg_link_mentorship_accounts',    '08'),
  ('fg_claim_mentor_role',           '08'),
  ('fg_consent_lookup',              '08'),
  ('fg_consent_sign',                '08'),
  ('fg_consent_revoke',              '08'),
  ('fg_request_consent',             '08'),
  ('fg_record_background_check',     '08'),
  ('fg_attest_conduct_policy',       '08')
) as f(name, from_migration)
left join pg_proc p
  on p.proname = f.name
 and p.pronamespace = 'public'::regnamespace
order by f.from_migration, f.name;


-- ---------------------------------------------------------------------
-- 4. IS ANYTHING HIDDEN BY ROW LEVEL SECURITY?
-- ---------------------------------------------------------------------
-- This is the usual cause of "my data disappeared". RLS on with zero
-- policies means NOBODY except the service role can read the table -
-- the rows are still there, the website just cannot see them.

select
  c.relname                                   as table_name,
  c.relrowsecurity                            as rls_enabled,
  count(p.polname)                            as policy_count,
  case
    when c.relrowsecurity and count(p.polname) = 0
      then 'HIDDEN - rls on, no policies'
    when c.relrowsecurity
      then 'protected'
    else 'open to any signed-in user'
  end                                         as verdict
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relnamespace = 'public'::regnamespace
  and c.relkind = 'r'
group by c.relname, c.relrowsecurity
order by
  (c.relrowsecurity and count(p.polname) = 0) desc,
  c.relname;


-- ---------------------------------------------------------------------
-- 5. AM I AN ADMIN?
-- ---------------------------------------------------------------------
-- Almost every function in 07 and 08 begins with an fg_is_admin()
-- check, and the mentorship read policy grants admins everything. If
-- there is no admin row here, the site will look empty to you even
-- when the data is fine.

select u.email,
       r.role,
       r.full_name,
       r.created_at
from auth.users u
left join public.user_roles r on r.user_id = u.id
order by (r.role = 'admin') desc nulls last, u.created_at;


-- ---------------------------------------------------------------------
-- 6. WHAT ROLES ARE CURRENTLY ALLOWED?
-- ---------------------------------------------------------------------
-- Migration 07 widens this list to include 'mentor'. If 'mentor' is
-- absent, migration 07 did not finish.

select pg_get_constraintdef(oid) as allowed_roles
from pg_constraint
where conname = 'user_roles_role_check';


-- =====================================================================
-- END DIAGNOSTIC - nothing above this line changed anything
-- =====================================================================
