-- ---------------------------------------------------------------------
-- MIGRATION 17 - HOMEPAGE NUMBERS
-- ---------------------------------------------------------------------
-- The homepage hero numbers are read from public.stats on every visit
-- (script.js, initCountUp). The figures typed into index.html are only
-- fallbacks, so changing the HTML alone does not change the live site.
--
-- 1,000+ students reached; 116 free resources (every downloadable file
-- under /files except the 17 brand-kit logo files). The other two are
-- unchanged. Later updates can be made in the admin under Site Settings.

insert into public.stats (key, value, updated_at) values
  ('students_reached',  1000, now()),
  ('resources_count',    116, now()),
  ('teachers_network',   100, now()),
  ('schools_supported',    4, now())
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
