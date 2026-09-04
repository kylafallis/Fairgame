-- =====================================================================
-- FairGame - POST-MIGRATION VERIFICATION
-- =====================================================================
-- Run after 07, 08, 09, 10 and 11. Writes NOTHING - every statement is
-- a SELECT, and the two functions it calls are read-only.
--
-- Section 1 is the one that matters: it answers "did all five actually
-- land" in a single result, with a PASS or FAIL on each line.
--
-- Sections 6 and 7 exercise the new code rather than just checking it
-- exists, which is a different and more useful question.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. DID EVERYTHING LAND?
-- ---------------------------------------------------------------------

select 'table   ' || t.name as object,
       case when to_regclass('public.' || t.name) is null then 'FAIL - missing' else 'pass' end as state
from (values
  ('guardian_consents'), ('mentor_messages'), ('mentor_attestations'),
  ('messages'), ('community_posts'), ('student_projects'),
  ('school_email_domains'), ('fg_settings'), ('moderation_terms')
) t(name)

union all
select 'view    ' || v.name,
       case when to_regclass('public.' || v.name) is null then 'FAIL - missing' else 'pass' end
from (values
  ('fg_message_review_queue'), ('fg_mentorship_readiness'), ('fg_conversation_index')
) v(name)

union all
select 'function ' || f.sig,
       case when to_regprocedure('public.' || f.sig) is null then 'FAIL - missing' else 'pass' end
from (values
  ('fg_is_school_email(text)'),
  ('fg_scan_terms(text)'),
  ('fg_scan_contact_info(text)'),
  ('fg_mentorship_channel_open(uuid)'),
  ('fg_suggest_mentor_matches(uuid,integer)'),
  ('fg_create_mentorship(uuid,uuid,integer,jsonb,uuid)'),
  ('fg_activate_mentorship(uuid)'),
  ('fg_consent_lookup(uuid)'),
  ('fg_consent_sign(uuid,text,text,text)'),
  ('fg_consent_revoke(uuid,text)'),
  ('fg_request_consent(uuid,text,text,text)'),
  ('fg_claim_mentor_role()'),
  ('fg_attest_conduct_policy(text)'),
  ('fg_record_background_check(uuid,text,boolean)'),
  ('fg_link_mentorship_accounts(uuid)'),
  ('fg_link_own_mentorships()'),
  ('fg_students_without_request()'),
  ('fg_create_student_request(uuid,text[],text,text,text,text,text)')
) f(sig)

union all
select 'column  mentorships.' || c.name,
       case when not exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='mentorships' and column_name=c.name
       ) then 'FAIL - missing' else 'pass' end
from (values
  ('student_user_id'), ('mentor_user_id'), ('supervising_teacher_id'),
  ('consent_id'), ('mentor_attested_at'), ('background_check_on_file'),
  ('match_score'), ('match_reasons'), ('updated_at')
) c(name)

union all
select 'column  mentor_messages.' || c.name,
       case when not exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='mentor_messages' and column_name=c.name
       ) then 'FAIL - missing' else 'pass' end
from (values ('flag_detail'), ('flag_severity')) c(name)

union all
select 'column  students.' || c.name,
       case when not exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='students' and column_name=c.name
       ) then 'FAIL - missing' else 'pass' end
from (values
  ('project_title'), ('project_field'), ('paperwork_status'),
  ('ambassador_id'), ('teacher_user_id')
) c(name)

union all
select 'column  fairs.teacher_user_id',
       case when not exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='fairs' and column_name='teacher_user_id'
       ) then 'FAIL - missing' else 'pass' end

order by 2 desc, 1;   -- any FAIL sorts to the top


-- ---------------------------------------------------------------------
-- 2. IS ANYTHING LEFT UNPROTECTED?
-- ---------------------------------------------------------------------
-- 'rls on, no policies' hides rows from everyone but the service role.
-- 'NO RLS' on a table holding student data is the one to worry about.

select c.relname as table_name,
       c.relrowsecurity as rls_on,
       count(p.polname) as policies,
       case
         when not c.relrowsecurity then 'NO RLS - readable by any signed-in user'
         when count(p.polname) = 0 then 'rls on, no policies - hidden from everyone'
         else 'ok'
       end as verdict
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  and c.relname in ('students','documents','messages','community_posts',
                    'student_projects','mentorships','mentorship_sessions',
                    'mentor_messages','guardian_consents','mentor_attestations',
                    'moderation_terms','school_email_domains','fg_settings')
group by c.relname, c.relrowsecurity
order by (case when not c.relrowsecurity then 0 when count(p.polname)=0 then 1 else 2 end), c.relname;


-- ---------------------------------------------------------------------
-- 3. IS THERE AN ADMIN?
-- ---------------------------------------------------------------------
-- Nearly every function starts with an fg_is_admin() check, and the
-- views gate on it. Without a row here the portal looks broken.

select u.email, r.role, r.full_name
from auth.users u
join public.user_roles r on r.user_id = u.id
where r.role = 'admin';

-- Nothing above? Run this, with your address:
--   insert into public.user_roles (user_id, role, full_name)
--   select id, 'admin', 'Kyla Fallis' from auth.users
--   where email = 'you@example.com'
--   on conflict (user_id) do update set role = 'admin';


-- ---------------------------------------------------------------------
-- 4. WHO IS WAITING FOR A MENTOR?
-- ---------------------------------------------------------------------
-- Eric should be in one of these two. The first is the matcher's queue;
-- the second is people with accounts who never got into it.

select 'in the queue' as list, name, email, status, created_at
from public.portal_requests
where type = 'student_mentor_request' and status in ('pending','active')

union all

select 'registered, not queued', full_name, email, 'no request', registered_at
from public.fg_students_without_request()
order by 1, 5;


-- ---------------------------------------------------------------------
-- 5. HOW MANY MENTORS CAN ACTUALLY BE MATCHED?
-- ---------------------------------------------------------------------

select status, count(*)
from public.portal_requests where type = 'mentor'
group by status order by 2 desc;
-- Only status = 'active' is offered by the matcher.


-- ---------------------------------------------------------------------
-- 6. DOES THE SCHOOL EMAIL RULE BEHAVE?
-- ---------------------------------------------------------------------
-- Exercises the function rather than trusting that it exists.

select addr,
       public.fg_is_school_email(addr) as accepted,
       expected,
       case when public.fg_is_school_email(addr) = expected then 'pass' else 'FAIL' end as result
from (values
  ('teacher@osu.edu',                 true),
  ('kid@columbus.k12.oh.us',          true),
  ('teacher@cps-k12.org',             true),
  ('someone@school.ac.uk',            true),
  ('personal@gmail.com',              false),
  ('personal@outlook.com',            false),
  ('someone@notaschool.com',          false)
) t(addr, expected)
order by result, addr;

select value as current_policy from public.fg_settings where key = 'school_email_policy';
-- 'school' accepts the K-12 patterns. 'edu_only' is the strict rule.


-- ---------------------------------------------------------------------
-- 7. DOES THE MESSAGE SCANNER BEHAVE?
-- ---------------------------------------------------------------------
-- The important line is the last one: 'class' and 'assignment' contain
-- 'ass', and must NOT be flagged.

select sample,
       public.fg_scan_terms(sample)        as terms_hit,
       public.fg_scan_contact_info(sample) as structural_hit
from (values
  ('Great work, your controls look solid now.'),
  ('That is so damn annoying, I have to redo it.'),
  ('Just text me at 614-555-0148 and we can sort it faster.'),
  ('Do not tell your teacher about this, it can be our secret.'),
  ('Honestly I have been feeling like I want to die lately.'),
  ('My whole class had the same assignment and I need to assess the data.')
) s(sample);

-- Expected, in order:
--   1  nothing           2  profanity (severity 1)
--   3  off_platform + phone_number     4  secrecy
--   5  self_harm (severity 4)
--   6  NOTHING - word boundaries stop 'ass' firing inside those words


-- ---------------------------------------------------------------------
-- 8. THE MODERATION VOCABULARY
-- ---------------------------------------------------------------------

select category, count(*) as terms, min(severity) as low, max(severity) as high
from public.moderation_terms where active
group by category order by max(severity) desc, category;


-- ---------------------------------------------------------------------
-- 9. WHAT IS BLOCKING EACH MATCH
-- ---------------------------------------------------------------------

select * from public.fg_mentorship_readiness;

-- =====================================================================
-- END - nothing above this line changed anything
-- =====================================================================
