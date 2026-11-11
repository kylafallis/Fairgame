-- FairGame Initiative
-- Migration 20: private teacher onboarding profiles.
-- Apply before deploying the teacher portal onboarding UI.

create table if not exists public.teacher_onboarding_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_onboarding_answers_object check (jsonb_typeof(answers) = 'object')
);

comment on table public.teacher_onboarding_profiles is
  'Private, editable school-level onboarding profile used to personalize the FairGame teacher portal. No student records.';
comment on column public.teacher_onboarding_profiles.answers is
  'Optional school, event, readiness, funding, partner, judge, and support preferences entered by a teacher.';

alter table public.teacher_onboarding_profiles enable row level security;

drop policy if exists "Teachers can read their own onboarding profile" on public.teacher_onboarding_profiles;
create policy "Teachers can read their own onboarding profile"
  on public.teacher_onboarding_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Teachers can create their own onboarding profile" on public.teacher_onboarding_profiles;
create policy "Teachers can create their own onboarding profile"
  on public.teacher_onboarding_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Teachers can update their own onboarding profile" on public.teacher_onboarding_profiles;
create policy "Teachers can update their own onboarding profile"
  on public.teacher_onboarding_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Supabase no longer exposes newly created public-schema tables by default.
grant select, insert, update on table public.teacher_onboarding_profiles to authenticated;
revoke all on table public.teacher_onboarding_profiles from anon;

create index if not exists teacher_onboarding_profiles_completed_idx
  on public.teacher_onboarding_profiles (completed_at);
