-- FairGame resources schema
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
-- After running, import website-upload/upload-manifest.csv into the `resources`
-- table via Table Editor > resources > Insert > Import data from CSV.
--
-- IMPORTANT: templates.html already references a `resource_downloads` table
-- (see the trackDownload() function) against project buzcxrbjutexiofetgvn.
-- Check Table Editor before running this — if resource_downloads already
-- exists, skip that block below or the CREATE TABLE will error.

create table if not exists public.resources (
  id            bigint generated always as identity primary key,
  slug          text unique not null,
  title         text not null,
  description   text,
  category      text not null,      -- students, teachers, classroom, judges,
                                    -- coordinators, ambassadors, volunteers, guides, about, brand
  audience      text[] not null,    -- {student}, {teacher,coordinator}, etc
  file_path     text not null,      -- /files/teachers/fairgame-teacher-handbook.pdf
  file_type     text,               -- pdf, docx, xlsx, pptx
  file_size_kb  integer,
  is_public     boolean default true,
  sort_order    integer default 100,
  created_at    timestamptz default now()
);

alter table public.resources enable row level security;

-- anyone, logged in or not, can read public resources
create policy "public resources are readable by everyone"
  on public.resources for select
  using (is_public = true);

-- signed-in users can additionally see resources marked non-public
create policy "signed-in users see gated resources"
  on public.resources for select
  to authenticated
  using (true);


-- NOTE: this app does NOT use a profiles table for role lookup. login.js
-- reads role straight off Supabase Auth's own user_metadata/app_metadata
-- (see login.js line 33: user.user_metadata?.role || user.app_metadata?.role).
-- The guide's Part 4.2 assumed a separate profiles table, which doesn't
-- match how this codebase actually works — skipping it. Use the corrected
-- portal query at the bottom of this file instead.


-- Download tracking. templates.html already inserts into this table via
-- trackDownload() using the project's anon key, so this table needs to
-- exist before that code path will stop failing silently.
create table if not exists public.resource_downloads (
  id            bigint generated always as identity primary key,
  resource_id   bigint references public.resources(id),
  resource      text,          -- matches trackDownload()'s payload shape
  path          text,
  page          text,
  user_id       uuid references auth.users,   -- null for anonymous
  ts            timestamptz,
  downloaded_at timestamptz default now()
);

alter table public.resource_downloads enable row level security;

create policy "anyone may record a download"
  on public.resource_downloads for insert
  with check (true);

create policy "anyone may read download counts"
  on public.resource_downloads for select
  using (true);


-- Portal query once resources + CSV are loaded. Reads role from the JWT's
-- user_metadata, matching how login.js already determines role client-side
-- (there is no profiles table in this app):
-- select * from resources
-- where audience && array[coalesce(auth.jwt() -> 'user_metadata' ->> 'role', 'student')]
--    or audience && array['public']
-- order by category, sort_order, title;
