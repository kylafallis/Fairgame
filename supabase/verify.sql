-- =====================================================================
-- FairGame - POST-MIGRATION VERIFICATION
-- =====================================================================
-- HOW TO RUN THIS
--
--   Paste the whole file into the Supabase SQL editor and press Run.
--   You get ONE results table. Read the 'result' column: anything
--   starting with FAIL or ACTION needs you; everything else is fine.
--
--   The Supabase editor only ever displays the LAST statement's output,
--   which is why this is written as a single query rather than a series
--   of them. The extra queries at the bottom are commented out; to use
--   one, highlight just that line and press Run.
--
--   This writes nothing. Every statement is a SELECT.
-- =====================================================================

with

-- ── Does each object exist? ──────────────────────────────────────────
objects as (
  select 'Tables'   as area, t.name as item,
         case when to_regclass('public.' || t.name) is null
              then 'FAIL - missing' else 'ok' end as result
  from (values
    ('guardian_consents'), ('mentor_messages'), ('mentor_attestations'),
    ('messages'), ('community_posts'), ('student_projects'),
    ('school_email_domains'), ('fg_settings'), ('moderation_terms')
  ) t(name)

  union all
  select 'Views', v.name,
         case when to_regclass('public.' || v.name) is null
              then 'FAIL - missing' else 'ok' end
  from (values
    ('fg_message_review_queue'), ('fg_mentorship_readiness'), ('fg_conversation_index')
  ) v(name)

  union all
  select 'Functions', split_part(f.sig, '(', 1),
         case when to_regprocedure('public.' || f.sig) is null
              then 'FAIL - missing' else 'ok' end
  from (values
    ('fg_is_school_email(text)'),
    ('fg_scan_terms(text)'),
    ('fg_mentorship_channel_open(uuid)'),
    ('fg_suggest_mentor_matches(uuid,integer)'),
    ('fg_create_mentorship(uuid,uuid,integer,jsonb,uuid)'),
    ('fg_activate_mentorship(uuid)'),
    ('fg_consent_lookup(uuid)'),
    ('fg_consent_sign(uuid,text,text,text)'),
    ('fg_request_consent(uuid,text,text,text)'),
    ('fg_claim_mentor_role()'),
    ('fg_students_without_request()'),
    ('fg_create_student_request(uuid,text[],text,text,text,text,text)')
  ) f(sig)

  union all
  select 'Columns', 'mentorships.' || c.name,
         case when not exists (
           select 1 from information_schema.columns
           where table_schema='public' and table_name='mentorships' and column_name=c.name
         ) then 'FAIL - missing' else 'ok' end
  from (values
    ('student_user_id'), ('mentor_user_id'), ('consent_id'),
    ('mentor_attested_at'), ('background_check_on_file'), ('updated_at')
  ) c(name)

  union all
  select 'Columns', 'students.' || c.name,
         case when not exists (
           select 1 from information_schema.columns
           where table_schema='public' and table_name='students' and column_name=c.name
         ) then 'FAIL - missing' else 'ok' end
  from (values ('project_title'), ('paperwork_status'), ('ambassador_id'), ('teacher_user_id')) c(name)

  union all
  select 'Columns', 'fairs.teacher_user_id',
         case when not exists (
           select 1 from information_schema.columns
           where table_schema='public' and table_name='fairs' and column_name='teacher_user_id'
         ) then 'FAIL - missing' else 'ok' end
),

-- ── Is student data protected? ───────────────────────────────────────
security as (
  select 'Security' as area,
         c.relname || ' (' || count(p.polname) || ' policies)' as item,
         case
           when not c.relrowsecurity then 'FAIL - no RLS, any signed-in user can read it'
           when count(p.polname) = 0  then 'FAIL - RLS on but no policies, hidden from everyone'
           else 'ok'
         end as result
  from pg_class c
  left join pg_policy p on p.polrelid = c.oid
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    and c.relname in ('students','documents','messages','community_posts',
                      'student_projects','mentorships','mentorship_sessions',
                      'mentor_messages','guardian_consents')
  group by c.relname, c.relrowsecurity
),

-- ── Is there an admin? Everything gates on this. ─────────────────────
admins as (
  select 'Admin' as area,
         coalesce((select string_agg(u.email::text, ', ')
                   from auth.users u join public.user_roles r on r.user_id = u.id
                   where r.role = 'admin'), 'nobody') as item,
         case when exists (select 1 from public.user_roles where role='admin')
              then 'ok'
              else 'ACTION - add one, see the note at the bottom of this file'
         end as result
),

-- ── Does the school email rule actually work? ────────────────────────
emailrule as (
  select 'Email rule' as area, t.addr as item,
         case when public.fg_is_school_email(t.addr) = t.expected
              then 'ok - ' || (case when t.expected then 'accepted' else 'rejected' end)
              else 'FAIL - wrong answer' end as result
  from (values
    ('teacher@osu.edu', true), ('kid@columbus.k12.oh.us', true),
    ('teacher@cps-k12.org', true), ('personal@gmail.com', false)
  ) t(addr, expected)
),

-- ── Does the message scanner work? ───────────────────────────────────
-- The last one matters most: 'class', 'assignment' and 'assess' all
-- contain 'ass' and must NOT be flagged.
scanner as (
  select 'Scanner' as area, s.label as item,
         case when (jsonb_array_length(public.fg_scan_terms(s.body)) > 0) = s.should_flag
              then 'ok - ' || coalesce(nullif(
                     (select string_agg(distinct value ->> 'category', ', ')
                      from jsonb_array_elements(public.fg_scan_terms(s.body))), ''), 'clean')
              else 'FAIL - expected ' || (case when s.should_flag then 'a flag' else 'no flag' end)
         end as result
  from (values
    ('normal mentoring talk',  'Great work, your controls look solid now.', false),
    ('mild swearing',          'That is so damn annoying, I have to redo it.', true),
    ('moving off-platform',    'Just text me at 614 555 0148 and we can sort it faster.', true),
    ('secrecy',                'Do not tell your teacher, it can be our secret.', true),
    ('welfare disclosure',     'Honestly I have been feeling like I want to die lately.', true),
    ('must NOT false-positive','My whole class had the same assignment so I need to assess it.', false)
  ) s(label, body, should_flag)
),

-- ── Who is waiting, and is there anyone to match them with? ──────────
queue as (
  select 'Queue' as area, 'students in the mentor queue' as item,
         count(*)::text || ' waiting' as result
  from public.portal_requests
  where type='student_mentor_request' and status in ('pending','active')

  union all
  select 'Queue', 'registered students never queued',
         count(*)::text || case when count(*) > 0
              then ' - add them in Find a Match' else '' end
  from public.fg_students_without_request()

  union all
  select 'Queue', 'approved mentors available to match',
         count(*)::text || case when count(*) = 0
              then ' - ACTION: approve some, or the matcher finds nobody' else '' end
  from public.portal_requests where type='mentor' and status='active'
),

vocab as (
  select 'Vocabulary' as area,
         count(*)::text || ' terms across ' || count(distinct category) || ' categories' as item,
         case when count(*) = 0 then 'FAIL - migration 11 did not seed' else 'ok' end as result
  from public.moderation_terms where active
),

policy as (
  select 'Email rule' as area, 'current policy' as item,
         coalesce((select value from public.fg_settings where key='school_email_policy'),
                  'FAIL - missing') as result
)

select area, item, result
from (
  select * from objects   union all
  select * from security  union all
  select * from admins    union all
  select * from emailrule union all
  select * from policy    union all
  select * from scanner   union all
  select * from queue     union all
  select * from vocab
) all_checks
-- Anything needing attention floats to the top.
order by case when result like 'FAIL%' then 0
              when result like 'ACTION%' or result like '%ACTION%' then 1
              else 2 end,
         area, item;


-- =====================================================================
-- IF THE ADMIN LINE SAYS 'ACTION'
-- =====================================================================
-- Highlight the three lines below, put your own address in, and Run.
--
--   insert into public.user_roles (user_id, role, full_name)
--   select id, 'admin', 'Kyla Fallis' from auth.users where email = 'you@example.com'
--   on conflict (user_id) do update set role = 'admin';


-- =====================================================================
-- USEFUL ONE-OFFS - highlight a single line and press Run
-- =====================================================================
-- Who registered but never asked for a mentor (Eric should be here):
--   select * from public.fg_students_without_request();
--
-- What is blocking each match from opening:
--   select * from public.fg_mentorship_readiness;
--
-- Every pair and their message counts:
--   select * from public.fg_conversation_index;
--
-- Add a school district so its staff and students can sign up:
--   insert into public.school_email_domains (domain, school_name)
--   values ('cps-k12.org', 'Cincinnati Public Schools');
--
-- Retire a moderation term that turns out too noisy:
--   update public.moderation_terms set active = false where term = 'alcohol';
-- =====================================================================
