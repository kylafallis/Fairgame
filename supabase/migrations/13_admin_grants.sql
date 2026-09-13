-- ---------------------------------------------------------------------
-- MIGRATION 13 - GRANTING ADMIN BEFORE THE ACCOUNT EXISTS
-- ---------------------------------------------------------------------
-- Admin is the one role nothing can deliver on its own. user_roles is
-- writable only by an admin session or the service key (migration 01),
-- fg_self_provision_role refuses anything outside student / ambassador /
-- teacher, and the mentor and judge claims each hard-code their own role.
-- So making someone an admin has meant running an insert by hand against
-- auth.users - which cannot be done until after they have signed in at
-- least once, and leaves them bounced off the router in the meantime.
--
-- This is the admin counterpart to fg_claim_judge_role: the grant is
-- recorded against an email address ahead of time, and the person's first
-- Google sign-in turns it into the user_roles row. The human decision is
-- still the grant; this only delivers its effect.
--
-- The grant is consumed when it is claimed. That matters: a standing row
-- would silently re-promote the account every sign-in, so removing an
-- admin later would not stick. Re-granting means adding a row again.


-- ---------------------------------------------------------------------
-- PART 1 - THE GRANT TABLE
-- ---------------------------------------------------------------------
-- Not readable by ordinary signed-in users, unlike school_email_domains.
-- This one names the people who are about to hold every permission in
-- the system, and no page needs to show it to anyone but an admin.

create table if not exists public.admin_grants (
  email      text primary key,
  full_name  text,
  note       text,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by uuid references auth.users(id) on delete set null
);

alter table public.admin_grants enable row level security;

drop policy if exists "admin_grants_admin" on public.admin_grants;
create policy "admin_grants_admin" on public.admin_grants
  for all to authenticated
  using (public.fg_is_admin()) with check (public.fg_is_admin());

comment on table public.admin_grants is
  'Pending admin grants, keyed by email so a grant can be made before the person has an account. Claimed on their first sign-in by fg_claim_admin_role(), which stamps claimed_at so the grant applies exactly once.';


-- ---------------------------------------------------------------------
-- PART 2 - CLAIMING THE ROLE
-- ---------------------------------------------------------------------
-- Gated on an unclaimed admin_grants row for the caller's own address,
-- which only an existing admin or the service key can have written.
-- Returns null rather than raising when there is no grant: every sign-in
-- calls this, and for everyone else "no grant" is the normal answer, not
-- a fault.
--
-- Unlike the mentor and judge claims this updates on conflict instead of
-- doing nothing. Those two guard against quietly overwriting a role
-- somebody already holds; here the overwrite is the point. Jessie may
-- well have picked teacher or student on the signup form on her way in -
-- the form has no admin option to pick - and an explicit grant has to
-- outrank whatever that form stashed, or the grant looks like it failed.

create or replace function public.fg_claim_admin_role()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_name  text;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return null;
  end if;

  -- The gate. An already-claimed grant is spent and does nothing, so
  -- removing an admin from user_roles later is not undone at next login.
  select full_name into v_name
  from public.admin_grants
  where lower(email) = lower(v_email)
    and claimed_at is null;

  if not found then
    return null;
  end if;

  v_name := coalesce(v_name,
                     auth.jwt() -> 'user_metadata' ->> 'name',
                     split_part(v_email, '@', 1));

  insert into public.user_roles (user_id, role, full_name)
  values (auth.uid(), 'admin', v_name)
  on conflict (user_id) do update
    set role      = 'admin',
        full_name = coalesce(user_roles.full_name, excluded.full_name);

  update public.admin_grants
     set claimed_at = now(),
         claimed_by = auth.uid()
   where lower(email) = lower(v_email)
     and claimed_at is null;

  return 'admin';
end;
$$;

grant execute on function public.fg_claim_admin_role() to authenticated;


-- ---------------------------------------------------------------------
-- PART 3 - THE GRANT
-- ---------------------------------------------------------------------
-- Jessie Rice, jessierice078@gmail.com.
--
-- The address is the one Google hands back, taken from her existing
-- auth.users row rather than guessed - an alias that forwards to the
-- account would not match.
--
-- She signed up through the Google signup form and picked student, so
-- she already holds a student row in user_roles. Part 4 upgrades it
-- when this runs; she needs no more than a page reload afterwards.

insert into public.admin_grants (email, full_name, note)
values (
  lower('jessierice078@gmail.com'),
  'Jessie Rice',
  'Granted in migration 13. Her Google account already exists and came in '
  'as a student, so Part 4 applies this on the spot rather than waiting '
  'for her next sign-in.'
)
on conflict (email) do nothing;


-- ---------------------------------------------------------------------
-- PART 4 - A GRANTEE WHO HAS ALREADY SIGNED IN
-- ---------------------------------------------------------------------
-- If the account already exists when this runs, there is no reason to
-- make them sign in again to trigger the claim. Same effect as Part 2,
-- applied here rather than at login, and it spends the grant the same way.

insert into public.user_roles (user_id, role, full_name)
select u.id, 'admin', coalesce(g.full_name, u.raw_user_meta_data ->> 'name')
from public.admin_grants g
join auth.users u on lower(u.email) = lower(g.email)
where g.claimed_at is null
on conflict (user_id) do update
  set role      = 'admin',
      full_name = coalesce(user_roles.full_name, excluded.full_name);

update public.admin_grants g
   set claimed_at = now(),
       claimed_by = u.id
  from auth.users u
 where lower(u.email) = lower(g.email)
   and g.claimed_at is null;


-- ---------------------------------------------------------------------
-- PART 5 - updated_at ON user_roles
-- ---------------------------------------------------------------------
-- The column has been there since migration 01 but nothing ever
-- maintained it, so every row still reads as first written. That matters
-- now: changing a role by hand in the SQL editor is the documented way
-- to do this, and "when did this account become an admin" is exactly the
-- question you want answerable afterwards.

drop trigger if exists user_roles_touch on public.user_roles;
create trigger user_roles_touch before update on public.user_roles
  for each row execute function public.fg_touch_updated_at();
