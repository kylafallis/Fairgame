-- =====================================================================
-- FairGame Initiative
-- Migration 06: Self-provisioning for the three low-privilege roles
-- Run after 01-05. Safe to run more than once.
-- =====================================================================
--
-- WHY THIS EXISTS
--   user_roles can only be written by an admin session or the service
--   key, which is the point of migration 01's security fix. But
--   student, ambassador, and teacher accounts are still created by a
--   person picking their own role on the signup form, and nothing
--   wrote that choice into user_roles for a brand new account. Without
--   this, every signup after the migration would have no role
--   anywhere the app trusts and would be stuck at the router.
--
--   This function is the one narrow exception. It lets a signed-in
--   user claim a row in user_roles for themselves, but only once - it
--   does nothing on conflict, so an existing role can never be
--   overwritten this way - and only into the three roles the signup
--   form already lets a person pick without review: student,
--   ambassador, teacher. Admin, judge, fair_manager, and parent can
--   never be claimed through this path. Teacher and ambassador still
--   need admin approval in portal_requests before either role reaches
--   a portal, unchanged from before.
-- =====================================================================

create or replace function public.fg_self_provision_role(p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_name text;
begin
  if p_role not in ('student', 'ambassador', 'teacher') then
    raise exception 'Role % cannot be self-provisioned', p_role;
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

-- =====================================================================
-- END MIGRATION 06
-- =====================================================================
