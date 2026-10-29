-- ---------------------------------------------------------------------
-- MIGRATION 14 - STRUCTURED JUDGE LOCATIONS FOR A NATIONAL NETWORK
-- ---------------------------------------------------------------------
-- The judge form used to take City and County as free text, which only
-- ever worked because everyone was in Ohio. It now asks for a country,
-- a state or province from a list, and an optional city and postal
-- code, and works out coordinates in the browser from /data/geo before
-- the row is written.
--
-- state_code, postal_code, latitude, longitude and geocode_source already
-- exist (migrations 01 and 04). This adds the two pieces they cannot
-- hold: the country, and a free-text region for countries the picker has
-- no state list for. city now holds just the city name ("Columbus");
-- older rows keep their "Columbus, Franklin County" text and are placed
-- on the admin map from it.
--
-- RUN THIS BEFORE DEPLOYING the new volunteer.html / script.js. The form
-- retries without these two columns if they are missing, so a sign-up is
-- never lost, but the country is only kept once this has run.

alter table public.judges add column if not exists country text not null default 'US';
alter table public.judges add column if not exists region  text;

create index if not exists judges_country_state_idx on public.judges (country, state_code);
create index if not exists judges_status_idx        on public.judges (status);

comment on column public.judges.country is
  'ISO 3166-1 alpha-2 country code. Defaults to US for every row written before migration 14.';
comment on column public.judges.region is
  'State/province/region as typed, only for countries outside the US and Canada. US and Canadian rows use state_code.';
comment on column public.judges.geocode_source is
  'How latitude/longitude were found. fg_zip / fg_city / fg_state are set by the signup form and the admin map; census_zcta* by fg_geocode_judges_from_zip().';


-- ---------------------------------------------------------------------
-- OPTIONAL - FILL us_zip_centroids SO SERVER-SIDE MATCHING HAS DISTANCES
-- ---------------------------------------------------------------------
-- Migration 04 created us_zip_centroids empty. supabase/seed/
-- us_zip_centroids.csv has ~41,000 rows built from the same data as the
-- site's picker. Load it from the Supabase dashboard:
--   Table Editor -> us_zip_centroids -> Insert -> Import data from CSV
-- then run:
--   select public.fg_geocode_judges_from_zip();
-- That fills coordinates for any judge who still has none. The admin
-- Judge Map can also do this from the browser ("Save missing pins").
