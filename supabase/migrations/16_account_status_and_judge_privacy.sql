-- ---------------------------------------------------------------------
-- MIGRATION 16 - ACCOUNT STATUS LOOKUPS AND JUDGE PRIVACY
-- ---------------------------------------------------------------------
-- Run after 15.
--
-- PART 1 fixes "I was approved but it still says under review".
-- The sign-in pages decided whether a teacher or ambassador was approved
-- by reading their own portal_requests row straight from the table:
--
--   .from('portal_requests').eq('email', user.email)
--
-- Two things made that read come back empty for people who WERE
-- approved, and empty was treated as "still pending":
--   - Case. Supabase stores auth emails in lower case; the request row
--     keeps whatever was typed ("Jane.Doe@District.org"). eq() is exact.
--   - Row-level security. A policy that hides the row returns no rows,
--     not an error, so the "if RLS blocked it, let them through" branch
--     never ran.
-- This function answers the one question the pages need, for the
-- caller's own address only, case-insensitively and regardless of RLS.
--
-- PART 2 stops the public judge map from exposing judges' private
-- details. It read judges with select('*') as an anonymous visitor, so
-- anyone could pull every active judge's email, notes, and now their
-- LinkedIn, work email and background-check status. The map now reads a
-- view with only what it shows.


-- ---------------------------------------------------------------------
-- PART 1 - MY REQUEST STATUS
-- ---------------------------------------------------------------------
-- Latest status of the caller's own request of one type: 'pending',
-- 'interest', 'active', 'rejected', or null if there is none.

create or replace function public.fg_my_request_status(p_type text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select pr.status
  from public.portal_requests pr
  join auth.users u on lower(trim(u.email)) = lower(trim(pr.email))
  where u.id = auth.uid()
    and pr.type = p_type
  order by
    -- A decided request outranks a newer duplicate still sitting at
    -- pending, so a second signup click cannot un-approve anyone.
    case pr.status when 'active' then 0 when 'rejected' then 1 else 2 end,
    pr.created_at desc
  limit 1;
$$;

grant execute on function public.fg_my_request_status(text) to authenticated;

-- New request rows are written with the address in lower case from now
-- on (login.js); bring the existing ones in line so the admin's history
-- view and the duplicate check agree with what people sign in with.
update public.portal_requests
set email = lower(trim(email))
where email is not null and email <> lower(trim(email));


-- ---------------------------------------------------------------------
-- PART 2 - PUBLIC JUDGE DIRECTORY
-- ---------------------------------------------------------------------
-- Only what the public map displays. Runs with the owner's rights, so it
-- does not depend on whatever policies judges has.

create or replace view public.judges_public as
select id, name, org, city, state_code, country, region,
       expertise, available_level, travel_miles, travel_range,
       virtual_ok, latitude, longitude, geocode_source, created_at
from public.judges
where status = 'active';

grant select on public.judges_public to anon, authenticated;

comment on view public.judges_public is
  'Active judges, public columns only. The public judge map and impact report read this; nothing anonymous should read public.judges directly.';

-- Anonymous visitors only ever need to INSERT a judge application (the
-- volunteer form, which does not read the row back) and call
-- fg_judge_email_exists. Signed-in teachers, judges and admins keep
-- whatever access they had.
revoke select on public.judges from anon;


-- ---------------------------------------------------------------------
-- PART 3 - MATCH REQUESTS FROM THE PUBLIC MAP
-- ---------------------------------------------------------------------
-- The public map no longer knows judges' addresses, so it writes the
-- request without judge_email and supabase/functions/judge-request-notify
-- emails the judge, stamping notified_at.

alter table public.judge_requests add column if not exists notified_at timestamptz;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'judge_requests'
               and column_name = 'judge_email' and is_nullable = 'NO') then
    alter table public.judge_requests alter column judge_email drop not null;
  end if;
end $$;
