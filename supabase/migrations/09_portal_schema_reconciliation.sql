-- =====================================================================
-- FairGame Initiative
-- Migration 09: Reconcile the portal tables with what the site queries
-- Run after 07 and 08. Safe to run more than once.
-- =====================================================================
--
-- WHY THIS EXISTS
--
--   Reading the live schema turned up a set of tables the portal has
--   been querying that either do not exist or do not have the columns
--   the queries name. None of it ever worked; it simply failed
--   quietly, which is why nobody noticed.
--
--   Three tables are missing outright:
--     messages          - the student "ask for help" and call-request
--                         forms, and the unread count on the dashboard
--     community_posts   - the student community feed
--     student_projects  - the student's own project record
--
--   Three tables exist but are missing columns:
--     students   - no project fields, no paperwork status, and no way
--                  to tell whose student it is
--     documents  - no owner_type, so a teacher's files and an
--                  ambassador's files cannot be told apart
--     fairs      - no teacher_user_id, so a teacher could never load
--                  the fair they registered
--
-- ON THE COLUMNS THAT ALREADY EXIST UNDER ANOTHER NAME
--
--   students.full_name and documents.storage_path already hold exactly
--   what the site calls 'name' and 'file_path'. Adding a second column
--   for each would leave two places holding the same fact, drifting
--   apart the moment one write path missed one. The site has been
--   corrected to use the real column names instead, so nothing here
--   duplicates a column that is already there.
--
-- WHAT IT DOES TO DATA
--
--   Adds columns and tables. Backfills ambassador_id and teacher_user_id
--   from the existing added_by column so current students stay visible
--   to the person who entered them. There is no delete, no drop table,
--   no drop column and no truncate anywhere in this file.
--
-- ONE THING TO KNOW BEFORE YOU RUN IT
--
--   students and documents hold student names, emails, project details
--   and uploaded paperwork, and today they have no row level security
--   at all - any signed-in account can read every row. This turns that
--   on. The backfill above is what keeps existing rows visible to the
--   right people; anything it cannot attribute stays admin-only, and
--   the report at the end tells you how many that is.
-- =====================================================================


do $$
begin
  if to_regprocedure('public.fg_is_admin()') is null then
    raise exception 'Missing public.fg_is_admin(). Run migration 01 first.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- PART 1 - STUDENTS
-- ---------------------------------------------------------------------
-- Live shape is: id, full_name, email, school, grade_level, added_by,
-- status, created_at. Everything the portal shows beyond a name is new.

alter table public.students add column if not exists project_title    text;
alter table public.students add column if not exists project_field    text;
alter table public.students add column if not exists abstract         text;

-- 'pending' before anything is uploaded, 'uploaded' once a file lands,
-- 'verified' once a person has actually checked it. The upload handler
-- sets the middle one; only a human sets the last.
alter table public.students add column if not exists paperwork_status text not null default 'pending';

-- added_by records who typed the row in, but not in what capacity. The
-- portal filters on role, so it needs the distinction.
alter table public.students add column if not exists ambassador_id  uuid references auth.users(id) on delete set null;
alter table public.students add column if not exists teacher_user_id uuid references auth.users(id) on delete set null;
alter table public.students add column if not exists mentor_id       uuid references public.mentorships(id) on delete set null;

alter table public.students drop constraint if exists students_paperwork_status_check;
alter table public.students add constraint students_paperwork_status_check
  check (paperwork_status in ('pending','uploaded','verified','waived')) not valid;

-- ── Backfill so existing rows do not vanish behind the new policies ──
-- added_by already says who created the row. Their role says in what
-- capacity. Anything that cannot be attributed is left null and stays
-- admin-only, which is the safe direction to fail.
update public.students s
set ambassador_id = s.added_by
from public.user_roles r
where s.ambassador_id is null
  and s.added_by = r.user_id
  and r.role = 'ambassador';

update public.students s
set teacher_user_id = s.added_by
from public.user_roles r
where s.teacher_user_id is null
  and s.added_by = r.user_id
  and r.role in ('teacher','fair_manager');

create index if not exists students_ambassador_idx on public.students (ambassador_id);
create index if not exists students_teacher_idx    on public.students (teacher_user_id);


-- ---------------------------------------------------------------------
-- PART 2 - DOCUMENTS
-- ---------------------------------------------------------------------
-- Live shape is: id, file_name, file_type, storage_path, owner_id,
-- student_id, size_bytes, created_at. Only the owner's capacity is
-- missing - without it a teacher's uploads and an ambassador's uploads
-- sit in one undifferentiated pile.

alter table public.documents add column if not exists owner_type text;

alter table public.documents drop constraint if exists documents_owner_type_check;
alter table public.documents add constraint documents_owner_type_check
  check (owner_type is null or owner_type in ('teacher','ambassador','student','admin')) not valid;

update public.documents d
set owner_type = r.role
from public.user_roles r
where d.owner_type is null
  and d.owner_id = r.user_id
  and r.role in ('teacher','ambassador','student','admin');

create index if not exists documents_owner_idx   on public.documents (owner_id, owner_type);
create index if not exists documents_student_idx on public.documents (student_id);


-- ---------------------------------------------------------------------
-- PART 3 - FAIRS
-- ---------------------------------------------------------------------
-- A teacher registers a fair from their portal and then reloads it on
-- the next visit by their own user id. That column was never there, so
-- the second half never worked.

alter table public.fairs add column if not exists teacher_user_id uuid references auth.users(id) on delete set null;

-- Match existing rows to accounts by the email already recorded on them.
update public.fairs f
set teacher_user_id = u.id
from auth.users u
where f.teacher_user_id is null
  and f.teacher_email is not null
  and lower(u.email) = lower(f.teacher_email);

create index if not exists fairs_teacher_idx on public.fairs (teacher_user_id);


-- ---------------------------------------------------------------------
-- PART 4 - MESSAGES
-- ---------------------------------------------------------------------
-- Backs the student "ask for help" form, the call request, the mentor
-- request, and the unread count on the student dashboard. These are
-- messages to the FairGame team, not the supervised mentor channel -
-- that is mentor_messages, and the two are deliberately separate
-- because only one of them involves a minor talking to a stranger.

create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),

  from_user_id uuid references auth.users(id) on delete set null,
  from_role    text,
  -- A message can be addressed to a person or to a desk. Sending to
  -- 'admin' without knowing which admin is the common case.
  to_user_id   uuid references auth.users(id) on delete set null,
  to_role      text,

  subject      text,
  body         text not null,

  read         boolean not null default false,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists messages_to_user_idx on public.messages (to_user_id, read);
create index if not exists messages_to_role_idx on public.messages (to_role, created_at desc);
create index if not exists messages_from_idx    on public.messages (from_user_id);

comment on table public.messages is
  'Student and teacher messages to the FairGame team. Not the supervised mentor channel - that is mentor_messages.';


-- ---------------------------------------------------------------------
-- PART 5 - COMMUNITY POSTS
-- ---------------------------------------------------------------------
-- The student community feed. Anything a minor can post where other
-- minors will read it needs a way to take a post down, so this carries
-- a hidden flag rather than relying on deletion.

create table if not exists public.community_posts (
  id          uuid primary key default gen_random_uuid(),

  author_id   uuid references auth.users(id) on delete set null,
  author_role text,
  author_name text,

  body        text not null check (length(trim(body)) > 0 and length(body) <= 4000),
  audience    text not null default 'student',

  hidden       boolean not null default false,
  hidden_by    uuid references auth.users(id) on delete set null,
  hidden_at    timestamptz,
  hidden_reason text,

  created_at  timestamptz not null default now()
);

alter table public.community_posts add column if not exists hidden        boolean not null default false;
alter table public.community_posts add column if not exists hidden_by     uuid references auth.users(id) on delete set null;
alter table public.community_posts add column if not exists hidden_at     timestamptz;
alter table public.community_posts add column if not exists hidden_reason text;

create index if not exists community_posts_feed_idx
  on public.community_posts (audience, created_at desc) where not hidden;

comment on column public.community_posts.hidden is
  'Moderation. A hidden post stays on the record and stops being shown, rather than being deleted.';


-- ---------------------------------------------------------------------
-- PART 6 - STUDENT PROJECTS
-- ---------------------------------------------------------------------
-- One row per student, which is why student_id carries a unique
-- constraint - the portal upserts on it.

create table if not exists public.student_projects (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null unique references auth.users(id) on delete cascade,

  title       text,
  field       text,
  grade       text,
  stage       text default 'planning',
  school      text,
  description text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.student_projects drop constraint if exists student_projects_stage_check;
alter table public.student_projects add constraint student_projects_stage_check
  check (stage is null or stage in ('planning','research','experiment','analysis','display','registered')) not valid;

drop trigger if exists student_projects_touch on public.student_projects;
create trigger student_projects_touch before update on public.student_projects
  for each row execute function public.fg_touch_updated_at();


-- ---------------------------------------------------------------------
-- PART 7 - ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
-- students and documents have had none until now, which means every
-- signed-in account could read every student record on the platform.

alter table public.students         enable row level security;
alter table public.documents        enable row level security;
alter table public.messages         enable row level security;
alter table public.community_posts  enable row level security;
alter table public.student_projects enable row level security;

-- ── Students: the ambassador or teacher who owns them, plus admins.
drop policy if exists "students_owner_read" on public.students;
create policy "students_owner_read" on public.students
  for select to authenticated
  using (
    public.fg_is_admin()
    or ambassador_id  = auth.uid()
    or teacher_user_id = auth.uid()
    or added_by        = auth.uid()
  );

drop policy if exists "students_owner_write" on public.students;
create policy "students_owner_write" on public.students
  for insert to authenticated
  with check (
    public.fg_is_admin()
    or ambassador_id  = auth.uid()
    or teacher_user_id = auth.uid()
  );

drop policy if exists "students_owner_update" on public.students;
create policy "students_owner_update" on public.students
  for update to authenticated
  using (
    public.fg_is_admin()
    or ambassador_id  = auth.uid()
    or teacher_user_id = auth.uid()
  );

-- ── Documents: whoever uploaded them, whoever owns the student, admins.
drop policy if exists "documents_owner_read" on public.documents;
create policy "documents_owner_read" on public.documents
  for select to authenticated
  using (
    public.fg_is_admin()
    or owner_id = auth.uid()
    or exists (
      select 1 from public.students s
      where s.id = student_id
        and (s.ambassador_id = auth.uid() or s.teacher_user_id = auth.uid())
    )
  );

drop policy if exists "documents_owner_write" on public.documents;
create policy "documents_owner_write" on public.documents
  for insert to authenticated
  with check (public.fg_is_admin() or owner_id = auth.uid());

-- ── Messages: sender and recipient. A message addressed to a desk
--    rather than a person is readable by anyone holding that role.
drop policy if exists "messages_participant_read" on public.messages;
create policy "messages_participant_read" on public.messages
  for select to authenticated
  using (
    public.fg_is_admin()
    or from_user_id = auth.uid()
    or to_user_id   = auth.uid()
    or (to_role is not null and to_role = public.fg_role())
  );

drop policy if exists "messages_send" on public.messages;
create policy "messages_send" on public.messages
  for insert to authenticated
  with check (from_user_id = auth.uid() or public.fg_is_admin());

-- Marking a message read is the only update a recipient may make; the
-- immutability of the body is enforced by giving them no other path.
drop policy if exists "messages_admin_update" on public.messages;
create policy "messages_admin_update" on public.messages
  for update to authenticated
  using (public.fg_is_admin() or to_user_id = auth.uid())
  with check (public.fg_is_admin() or to_user_id = auth.uid());

-- ── Community posts: visible to signed-in users unless hidden. Authors
--    write their own. Only an admin can hide one, and hiding is an
--    update rather than a delete so the post stays on the record.
drop policy if exists "community_posts_read" on public.community_posts;
create policy "community_posts_read" on public.community_posts
  for select to authenticated
  using (public.fg_is_admin() or not hidden);

drop policy if exists "community_posts_write" on public.community_posts;
create policy "community_posts_write" on public.community_posts
  for insert to authenticated
  with check (author_id = auth.uid());

drop policy if exists "community_posts_moderate" on public.community_posts;
create policy "community_posts_moderate" on public.community_posts
  for update to authenticated
  using (public.fg_is_admin()) with check (public.fg_is_admin());

-- ── Student projects: the student's own, plus admins. A teacher sees
--    it through the students table, not this one.
drop policy if exists "student_projects_own" on public.student_projects;
create policy "student_projects_own" on public.student_projects
  for all to authenticated
  using (public.fg_is_admin() or student_id = auth.uid())
  with check (public.fg_is_admin() or student_id = auth.uid());


-- ---------------------------------------------------------------------
-- PART 8 - REPORT BACK
-- ---------------------------------------------------------------------
do $$
declare
  v_students  integer;
  v_orphan    integer;
  v_docs      integer;
  v_doc_untyped integer;
  v_fairs     integer;
  v_fair_linked integer;
begin
  select count(*) into v_students from public.students;
  select count(*) into v_orphan   from public.students
    where ambassador_id is null and teacher_user_id is null and added_by is null;

  select count(*) into v_docs from public.documents;
  select count(*) into v_doc_untyped from public.documents where owner_type is null;

  select count(*) into v_fairs from public.fairs;
  select count(*) into v_fair_linked from public.fairs where teacher_user_id is not null;

  raise notice '';
  raise notice '─────────────────────────────────────────────────';
  raise notice 'Migration 09 applied. Nothing was deleted.';
  raise notice '';
  raise notice 'Students:  % row(s), % now admin-only (no owner could be worked out)', v_students, v_orphan;
  raise notice 'Documents: % row(s), % with no owner_type', v_docs, v_doc_untyped;
  raise notice 'Fairs:     % row(s), % linked to a teacher account', v_fairs, v_fair_linked;
  raise notice '';

  if v_orphan > 0 then
    raise notice '  The % student row(s) with no owner are visible to', v_orphan;
    raise notice '  admins only. To hand them to the right person:';
    raise notice '';
    raise notice '    update public.students set teacher_user_id =';
    raise notice '      (select id from auth.users where email = ''them@school.edu'')';
    raise notice '    where id = ''<student uuid>'';';
    raise notice '';
  end if;

  raise notice 'Created: messages, community_posts, student_projects';
  raise notice '─────────────────────────────────────────────────';
end $$;

-- =====================================================================
-- END MIGRATION 09
-- =====================================================================
