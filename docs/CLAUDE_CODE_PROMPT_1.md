# Build prompt for Claude Code

Paste everything below the line into Claude Code from inside the FairGame
repository. The three SQL files named in it should be in the repo root or in
`/supabase/migrations/` before you start.

---

## Project

You are working in the FairGame Initiative website repository. FairGame is an
Ohio nonprofit that helps rural and low-income schools take part in competitive
science fairs. The site is static HTML with vanilla JavaScript and a Supabase
backend. There is no build step and no framework. Keep it that way.

Existing files you will touch or read first:

- `portal-shared.js` holds the Supabase client, auth helpers, and `getSignedUrl()`
- `portal-router.html` sends a signed-in user to the portal that matches their role
- `login.html`, `script.js`, `judgemap.html`, `volunteer.html`
- `portal-admin.html`, `portal-teacher.html`, `portal-ambassador.html`, `portal-judge.html`
- `supabase-schema.sql` defines the 12 existing tables

## Before writing any code

Read `supabase-schema.sql` and `portal-shared.js` in full. Then report back on
four things, because the rest of this work depends on them:

1. Whether the live `judges` table still matches the shape below. It was read
   from the database on August 31, 2026 and every query in the migrations is
   built on it. Report any difference before running anything.

   | Column | Type | Note |
   |---|---|---|
   | `id` | uuid | |
   | `name` | text | |
   | `email` | text | |
   | `org` | text | not `organization` |
   | `city` | text | the only location field the signup form collects |
   | `expertise` | text[] | a list, not one value |
   | `available_level` | text | free-text answer from the signup form |
   | `status` | text | unverified or active |
   | `notes` | text | |
   | `created_at` | timestamptz | |
   | `county` | text | one value |
   | `travel_range` | text | free-text answer from the signup form |
   | `travel_miles` | integer | the numeric distance field, already present |

   Two of these are free text a person typed, `available_level` and
   `travel_range`. Nothing can measure or compare them, so the migrations leave
   them alone and add `preferred_levels text[]` and use the existing
   `travel_miles` for the structured versions. No second mileage column is
   created.

2. How `portal-router.html` reads a user's role today.
3. Whether `portal-shared.js` already has a query helper, a toast or alert
   pattern, and a table-rendering helper that new pages should reuse.
4. The CSS conventions in the existing portal pages, including class names,
   color variables, and card or panel markup. Every new page must look like it
   was built by the same person on the same day.

## A security problem to fix while you are in here

The current setup stores role in Supabase `user_metadata`, for example
`{ "role": "admin" }`. A signed-in user can rewrite their own `user_metadata`
from the browser with `supabase.auth.updateUser()`. Any policy or page guard
that trusts `user_metadata` can be defeated by the person it is meant to stop.

`01_schema_fair_directory.sql` adds a `user_roles` table that only the service
key can write, plus `fg_role()` and `fg_is_admin()` helpers for row level
security. Do this:

- Run the migration
- Write a short one-time SQL snippet that copies every existing user's role out
  of `user_metadata` into `user_roles`, and give it to me to run
- Change `portal-router.html` and every portal page guard to read the role from
  `user_roles` through a `getRole()` helper in `portal-shared.js`
- Leave `user_metadata` in place for display name only

Do not skip this. Every new table's policies depend on it.

## Migrations to run

Run these in order in the Supabase SQL editor. Do not edit the seed data.

1. `01_schema_fair_directory.sql`
2. `02_seed_fairs.sql`
3. `03_seed_email_templates.sql`
4. `04_judge_matching.sql`

Then confirm the new tables exist and report the row counts from
`select * from public.v_state_fair_counts;`.

---

# Feature 1: Judge information tab

**Goal.** A judge signs in and sees every fair in their state, sorted by what is
happening next, with the contact for each one and a way to say they will judge it.

**New file.** `portal-judge-fairs.html`, reachable as a tab from
`portal-judge.html`. Match the existing portal sidebar pattern.

**Layout, top to bottom.**

1. **Header strip.** The judge's state and county, pulled from their `judges`
   row, with an edit link. If `state_code` is null, show a short prompt asking
   them to set it before anything else loads.

2. **Next up.** The three soonest items from `v_upcoming_fair_deadlines` filtered
   to the judge's state. Each shows the label, the date, days remaining, and the
   fair name. Anything inside 30 days gets a highlighted border.

3. **Fairs near me.** Cards for fairs where `state_code` matches and either
   `county` or an entry in `counties_served` matches the judge's county. Each
   card shows fair name, level badge, date or "date not yet posted", venue and
   city, grade range, and the ISEF affiliate mark when true.

4. **All fairs in my state.** A filterable table. Filters: level, month, county,
   and a checkbox for "needs judges". Columns: fair, level, date, city, counties
   served, deadline, and an action column.

5. **Fair detail panel.** Clicking a row opens a side panel with everything on
   the record plus a **Fair contacts** block. That block lists rows from
   `fair_contacts` with name, title, email as a `mailto:` link, and phone. Under
   it print the source URL and `last_verified_at` as "Confirmed on
   {{date}} from {{host}}". If `verification_status` is `lead` or `stale`, show
   a plain amber line reading "We have not confirmed this listing for the current
   season. Check the fair's own site before you rely on the date."

6. **Advancement path.** When `advances_to_id` is set, draw a simple three-step
   row: this fair, then the fair it advances to, then ISEF when the chain reaches
   an affiliate. Text and arrows only, no diagram library.

**Actions on the panel.**

- **I can judge this** writes a `judge_fair_interests` row with status
  `interested` and flips the button to a confirmed state.
- **Open judge signup** appears only when `judge_signup_url` is present.
- **Email the fair** builds a `mailto:` to the primary contact with a subject of
  "Judge volunteer for {{fair name}}" and a short prefilled body, with
  fairgameinitiative@outlook.com on cc.
- **Report a problem** writes a `fair_scrape_changes` row with `change_type`
  `dead_link`, `review_status` `pending`, and the judge's note in
  `evidence_snippet`. That puts judge corrections into the same review queue the
  scraper feeds. It is the cheapest data quality win in this whole build.

**Public version.** Add the same directory, contacts removed, to a new public
page `fairs.html` linked from the main navigation. Anonymous visitors read
`fair_events` only, which the policies already allow. This is the page that will
earn search traffic from students and teachers looking for their regional fair,
so give every fair a clean anchor at `fairs.html#<slug>`.

---

# Feature 2: Bulk email to judges by state

**Goal.** Kyla picks a state, sees exactly who would receive a message, edits the
message, approves the list, and sends. Nothing leaves without her reading it.

**New file.** `portal-admin-outreach.html`, linked from the `portal-admin.html`
sidebar under a new "Outreach" heading.

**Step 1, build the audience.**

Controls: state, county multi-select, expertise multi-select, level preference,
"active judges only", and an optional linked fair from `fair_events`. Calling
`fg_preview_judge_recipients()` returns the matching judges. Show the count
prominently and the full list in a table with a checkbox per row, all checked by
default. Show a second count for judges excluded by suppression or opt-out, with
the reason, so the difference between "we have 60 judges in Ohio" and "we can
email 51 of them" is visible.

**Step 2, write the message.**

Load a template from `email_templates` into a two-pane editor: markdown on the
left, rendered preview on the right with merge fields filled from the first
selected recipient. Merge fields available are listed at the top of
`03_seed_email_templates.sql`.

Validation that blocks the send button:

- Any merge field in the body that is not resolvable for every recipient
- A missing `{{unsubscribe_url}}`
- A missing `{{org_postal_address}}`
- An empty subject
- More than 400 recipients in one campaign, which needs a second confirmation

**Step 3, review and send.**

A summary screen: recipient count, subject, from address, reply-to, and the
linked fair. A "Send test to myself" button first. Then a confirm dialog that
requires typing the state code.

On confirm, insert the `email_campaigns` row and one
`email_campaign_recipients` row per approved judge with status `queued`, then
call the Edge Function.

**Sending identity.** Resend will only send from a domain verified by DNS, so
the From address is `judges@fairgameinitiative.org`. Every message carries
`Reply-To: fairgameinitiative@outlook.com`, and the same address is printed in
the signature so a recipient can write back by hand. Hard-code neither one in
the Edge Function. Read both from the `email_campaigns` row so they stay
editable.

**Edge Function.** `supabase/functions/send-campaign/index.ts`.

- Takes `{ campaign_id }` and the caller's JWT
- Verifies through `user_roles` that the caller is an admin, and rejects otherwise
- Reads queued recipients in pages of 50
- Renders merge fields per recipient, including a unique
  `{{unsubscribe_url}}` built from `judges.unsubscribe_token`
- Sends through Resend with the API key in `RESEND_API_KEY`
- Writes `provider_message_id`, `sent_at`, and status per row
- Rate limits to stay inside the Resend free tier, and stops on repeated failures
- Updates `sent_count`, `failed_count`, and `status` on the campaign
- Sets `judges.last_emailed_at`

**Second Edge Function.** `supabase/functions/unsubscribe/index.ts`, a public GET
at `/unsubscribe?token=<uuid>` that sets `email_opt_in` to false, inserts an
`email_suppressions` row, and returns a plain confirmation page. Use the service
key inside the function. Never expose the service key to the browser.

**Third Edge Function.** `supabase/functions/resend-webhook/index.ts` that
receives bounce and complaint events from Resend, verifies the signing secret,
and writes `email_suppressions`. A bounced address must never be mailed twice.

**Campaign history.** A table of past campaigns with state, date, counts, and a
drill-down to per-recipient status.

---

# Feature 3: Fair manager dashboard

**Who this is for.** Someone running a fair who is not the classroom teacher. A
PTA parent, a district STEM coordinator, a librarian, a county office staffer, a
university outreach person, a corporate volunteer. They plan the event. They have
no business seeing student records, so the FERPA boundary is the point of making
this a separate role rather than a tab inside the teacher portal.

**New file.** `portal-fairmanager.html`. Add `fair_manager` to the router.

**Sections.**

1. **My fair.** A form backed by `fair_plans`: fair name, organization and type,
   level, state, county, city, venue, target date, expected projects and
   students, grade range, judges needed, and which fair it advances to selected
   from `fair_events` in that state. Saving a new plan calls
   `fg_seed_plan_tasks()` so the checklist appears already dated backward from
   the target date.

2. **Countdown and readiness.** Days to the fair, tasks done over tasks total,
   judges confirmed over judges needed, and budget committed over budget total.
   Four numbers, no gauges.

3. **Checklist.** `fair_plan_tasks` grouped by phase, each with a due date, an
   owner name, and a status control. Overdue rows read in the alert color.
   Where `resource_key` is set, show a download button that pulls that file from
   the `resources` bucket through the existing `getSignedUrl()` helper.

4. **Judges.** A county-filtered view of `judges` in the plan's state showing
   name, expertise, and county, with no email address. An **Invite** button
   writes a `fair_plan_volunteers` row and queues an invitation for Kyla to
   approve in the outreach page. Withholding raw addresses from an outside
   volunteer while still letting them staff their fair is deliberate. State it in
   a one-line note on the page so nobody thinks it is a bug.

5. **Volunteers.** `fair_plan_volunteers` with role, shift note, and status.
   Roles beyond judging matter here: setup, check-in, runners, awards, teardown,
   hospitality, photography, sponsor liaison, safety.

6. **Budget.** `fair_plan_budget_lines` with category, item, quantity, unit cost,
   actual cost, and who funded it. Seed a new plan with these categories so a
   first-time organizer is not staring at an empty table: awards and medals,
   printing and signage, registration fees, display board materials, judge meals
   and refreshments, custodial or venue cost, and student transportation.

7. **Resources.** The same resource library the teacher portal exposes, minus
   anything classroom-specific. A fair manager needs the day-of checklist, the
   judge recruitment email, the judge training manual, the sponsorship letter,
   the budget template, the score cards, and the timeline poster. They do not
   need lesson plans or grading rubrics.

8. **My region.** A read-only copy of the Feature 1 fair directory scoped to the
   plan's state, so the manager can see the deadline for the fair theirs feeds
   into.

**Account creation.** Add "Fair organizer (not a teacher)" to the contact form on
the homepage so these requests land in `portal_requests` with their own type, and
add the matching approve path in `portal-admin.html`.

---

# Feature 4: Monthly scraper on GitHub Actions

**Rule that governs the whole design.** The scraper never writes to
`fair_events` or `fair_contacts`. It writes proposals to `fair_scrape_changes`
and an admin approves them. A bad parse must never quietly overwrite a verified
phone number.

**Files.**

```
scripts/scraper/
  run.py                 entry point, takes --states and --dry-run
  fetch.py               polite HTTP with a real user agent and caching
  parsers/generic.py     dates, deadlines, emails, phones from page text
  parsers/oas_rsd.py     the Ohio Academy of Science regional table and PDF
  parsers/zfairs.py      zFairs-hosted fair pages
  parsers/find_a_fair.py the Society for Science affiliated fair directory
  diff.py                compares parsed values to current rows
  report.py              writes the run summary
  requirements.txt
.github/workflows/scrape-fairs.yml
```

**Behavior.**

- Reads `fair_scrape_sources` where `active` is true and `check_frequency` is due
- Fetches with the user agent
  `FairGameInitiative-FairBot/1.0 (+https://fairgameinitiative.org; fairgameinitiative@outlook.com)`,
  honors `robots.txt`, waits at least two seconds between requests to one host,
  and retries twice with backoff
- Stores a content hash per source and skips parsing when nothing changed
- Extracts dates, registration windows, deadlines, venue, emails, and phone
  numbers
- Compares against the current row and writes one `fair_scrape_changes` row per
  differing field, with `evidence_url`, a short `evidence_snippet`, and a
  confidence score
- Confidence rules: a date parsed from a labeled field near a matching year gets
  0.9, a date found loose in body text gets 0.5, an email matching the fair's own
  domain gets 0.9, a generic address gets 0.6
- Flags a source as `dead_link` after two consecutive non-200 responses
- Writes one `fair_scrape_runs` row per run with the totals
- Never deletes anything

**Credentials.** Uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from GitHub
Actions secrets. The service key bypasses row level security, which is why it
lives only in Actions and never in any file the browser loads. Add a check at the
top of `run.py` that exits if the key looks like an anon key.

**Schedule.** Cron for the first day of each month at 08:00 UTC, plus
`workflow_dispatch` so it can be run by hand. On completion, post the run summary
into the job log and open a GitHub issue when `changes_proposed` is above zero.

**Adding a new state.** Document a single procedure in
`scripts/scraper/README.md`: insert rows into `fair_scrape_sources` for the new
state, run `python run.py --states TX --dry-run`, read the proposals, then run
without the flag. Adding a state must not require a code change.

**Review queue.** A new section in `portal-admin.html` called "Fair data review"
listing pending `fair_scrape_changes` grouped by fair. Each row shows the field,
the old value, the proposed value, the confidence, and the evidence link. Approve
writes the change to `fair_events` or `fair_contacts`, sets
`verification_status` to `verified`, stamps `last_verified_at`, and marks the
proposal applied. Reject marks it rejected. Add an "Approve all above 0.85 for
this fair" button, since most months will be one date change per fair.

---

# Feature 5: Judge profile review and publish

**Goal.** A new judge signs up. Kyla opens their profile from the admin
dashboard, sees which fairs the system matched them to and why, sees a list of
anything it could not work out, fixes or researches those, then presses Publish.
The judge then sees those fairs in their own portal and receives one email
listing them.

This is the human checkpoint between a stranger filling in a web form and that
person appearing in front of students. Nothing reaches a judge until she presses
the button.

**Migration.** Run `04_judge_matching.sql` after the first three. It adds
`judge_fair_matches`, `us_zip_centroids`, profile status columns on `judges`,
and four functions the page calls.

**New entry point.** In `portal-admin.html`, a section called **Judge profiles**
driven by `v_judge_review_queue`. Each row shows name, organization, county,
state, when they signed up, how many fairs are proposed, and two flags the view
already computes: `blocked` and `needs_research`. New profiles sort to the top.
The row's button opens the profile.

**New file.** `portal-admin-judge.html?id=<judge_id>`, laid out in four bands.

**Band 1, who they are.** Every field on the `judges` record, editable in place:
name, `org`, email, expertise, county, city, state, postal code, `travel_miles`,
`preferred_levels`, virtual willingness, and `admin_notes`. Saving any field
re-runs the matcher, because changing the travel distance from 30 to 60 should
change the answer on screen immediately.

Two fields need a translation control rather than an edit box. The signup form
writes free text into `available_level` and `travel_range`, and neither can be
measured. Show what the person actually wrote in quotation marks, then put the
structured control directly beneath it:

- `available_level` reads "Regional and state fairs". Below it, four checkboxes
  for school, district, regional, and state that write `preferred_levels`.
- `travel_range` reads "Up to about an hour". Below it, a number box that writes
  `travel_miles`.

Never overwrite the original answer. It is what the volunteer said, and a
mistranslation should be correctable by reading it again.

**Band 2, fairs they are eligible for.** Call
`fg_match_judge_fairs(judge_id)` and render the result as a table sorted by
score. Columns: a checkbox, fair name, level, date, city, distance in miles,
score, and the reasons. The reasons come back as an array of plain sentences
such as "Serves Franklin County" and "Within 60 miles", so print them as small
text under the fair name rather than inventing your own wording.

Pre-tick every row scoring 60 or above and leave the rest unticked but visible.
Rows carrying a blocker in `blocked_by` get a small amber marker and a tooltip
naming the blocker. A row with `FAIR_NO_DATE` cannot be ticked at all, because
inviting someone to an undated event helps nobody.

Give each row a Dismiss action that sets the match status to `dismissed` with a
reason, so a fair she has ruled out for this judge stops reappearing every time
the matcher runs.

**Band 3, what needs research.** Call `fg_judge_profile_gaps(judge_id)` and
group the result by severity. Blocking items first in the alert color, then
limiting, then polish. Each row prints the label, the subject it concerns, and
the `how_to_fix` sentence. Judge-side gaps get an inline edit control that jumps
to the matching field in Band 1. Fair-side gaps get a link to that fair's record
and its source URL, so a gap turns into one click and a phone call rather than a
hunt.

Print a plain sentence above this band saying what it is: these are the things
the system could not decide on its own, and each one either has to be looked up
or accepted as unknown.

**Band 4, publish.** A summary line reading how many fairs are ticked and whether
an email will go out, then two controls. **Publish and email** calls
`fg_publish_judge_matches(judge_id, selected_fair_ids, true)`. **Publish without
email** passes false. Both are disabled while any blocking gap is unresolved,
with the reason stated next to the button rather than left to guesswork.

The function returns a `campaign_id`. Hand that straight to the existing
`send-campaign` Edge Function from Feature 2, so this single-recipient email goes
through the same suppression, unsubscribe, and bounce path as a bulk send. Do not
write a second sending path.

After publishing, the page shows what happened: which fairs went live, whether
the email was queued, and a link to the campaign record. If the judge was
suppressed or opted out, the function returns a null campaign id, and the page
must say so plainly rather than reporting a send that did not happen.

**Judge side.** In `portal-judge-fairs.html` from Feature 1, add a band at the
top called **Matched for you**, reading published rows from
`judge_fair_matches`. Show the same distance and reasons the admin saw, so the
judge understands why each fair is there. Proposed rows are invisible to them by
policy, so no filtering in the page is needed or trusted.

**Postal code lookup.** Distance matching needs coordinates. Write a one-time
loader at `scripts/load_zip_centroids.py` that reads the United States Census
ZCTA gazetteer file, which is public domain, and fills `us_zip_centroids`. Then
run `select public.fg_geocode_judges_from_zip();` to fill coordinates for judges
who already gave a postal code. Add the same call to the end of the monthly
scraper run so new judges pick up coordinates without anyone thinking about it.

Until that table is loaded, matching still works on county and state and simply
reports `JUDGE_NO_COORDS` as a research item. Do not block the feature on the
loader.

**Fair coordinates.** Most seeded fairs have no latitude and longitude yet. Add
a small admin action on the fair record that accepts a city and postal code and
fills coordinates from `us_zip_centroids`. Ten minutes of clicking removes the
`FAIR_NO_COORDS` flag from most of the directory.

**Acceptance checks for this feature.**

- Create a judge with only a name, an email, and a state. The profile page must
  load, show zero blocking gaps, four limiting gaps and one polish gap, and still
  propose fairs on state match alone. The match reasons must read "Level not
  chosen yet, showing all" rather than claiming the judge asked for that level.
- Create a second judge the way the live signup form does it: city Columbus, no
  postal code, expertise as a two-item list, and free text in `available_level`
  and `travel_range`. The research band must quote both answers back and ask for
  the translation. Distance must still work, because the geocoder falls back to
  city and state.
- Fill in `preferred_levels` and `travel_miles` for that judge. The research band
  must empty out, and the three Columbus fairs must sit at the top with a score
  of 105 and a distance near one mile.
- Confirm a fair with no date cannot be ticked.
- Publish two fairs with email on. Confirm `judge_fair_matches` shows two
  published rows, `judges.profile_status` reads `published`, a campaign exists
  with exactly one recipient, and the recipient's `merge_data` carries a
  `fair_list` with both fairs and their dates.
- Sign in as that judge and confirm they see the two published fairs and none of
  the proposals.
- Attempt the publish call while signed in as a judge. It must fail with
  "Only an admin may publish judge matches."

---

# Copy rules for anything a person reads

Every string that appears on screen or in an email follows these:

- No em-dashes anywhere
- No three-item parallel lists inside a sentence
- Plain teacher-professional voice, the way a department chair writes to staff
- No claim that is not backed by a row in the database or a cited source
- When a date is unconfirmed, say so in words rather than showing a blank cell

Do not use these words in user-facing copy: leverage, streamline, empower,
seamless, robust, comprehensive, delve, foster, navigate as a metaphor,
landscape as a metaphor, unlock, elevate, harness, journey, ensure, facilitate,
crucial, vital, transformative, innovative, cutting-edge.

# Privacy rules

- No student name, grade, project, or document appears on any page in this build
- `fair_contacts` is never readable by anonymous visitors
- A fair manager never sees a judge's email address
- The service role key never appears in browser-loaded code
- Any new form that could collect information about a person under 13 needs the
  age gate and guardian email already described in the Operations Guide

# Order of work

1. Read the existing files and report the four findings requested above
2. Fix the role storage, migrate roles into `user_roles`, update the router
3. Run the three migrations and confirm the counts
4. Feature 1, judge information tab and the public `fairs.html`
5. Feature 3, fair manager, because it needs no new infrastructure
6. Feature 2, outreach, including the three Edge Functions
7. Feature 5, judge profile review and publish, which reuses the send path
8. Feature 4, scraper and the admin review queue

Commit after each numbered step with a message naming what changed. Do not
combine steps.

# Acceptance checks

Run these and paste the output.

**Database**

```sql
select * from public.v_state_fair_counts;
select count(*) from public.fair_contacts where verification_status = 'verified';
select label, due_date from public.v_upcoming_fair_deadlines limit 10;
```

**Row level security.** Using an anonymous client, confirm each of these:

- `select` on `fair_events` returns rows
- `select` on `fair_contacts` returns zero rows
- `select` on `email_campaigns` returns zero rows
- `select` on `fair_plans` returns zero rows
- `insert` into `fair_events` fails

Then sign in as a judge and confirm `fair_contacts` returns rows while
`email_campaigns` still returns none.

**Feature 1.** Sign in as a test judge with `state_code = 'OH'`. The page lists
the eleven Ohio regional science days, State Science Day, and the Buckeye fair.
Clicking Ohio University shows Dr. Natalie Kruse at krusen@ohio.edu with the
Ohio Academy of Science PDF as the source. Set the judge to `CA` and confirm the
Riverside County fair shows Yadira Chavelas and the February 26, 2027 date.

**Feature 2.** Build a Tennessee campaign from the `judge_fair_upcoming`
template. Confirm the send button stays disabled until the unsubscribe field and
the postal address are present. Send one test to yourself and confirm the
unsubscribe link sets `email_opt_in` to false and adds a suppression row.

**Feature 3.** Create a plan with a target date and confirm 20 checklist rows
appear with due dates spread backward from that date. Confirm the judge list
shows names and counties with no email column anywhere in the DOM.

**Feature 4.** Run `python scripts/scraper/run.py --states OH --dry-run` and
confirm it writes no rows. Run it for real against one source and confirm a
proposal lands in `fair_scrape_changes` with `review_status` set to pending.

# What to ask me about rather than decide alone

- Any change to the existing 12 tables beyond the columns added to `judges`
- Adding a JavaScript framework, a bundler, or a package manager to the front end
- Any design that would place a student name in a page a fair manager can open
- Any scraper behavior that writes directly to `fair_events`

---

# Known-good baseline for the migrations

All three SQL files were run against PostgreSQL 16 with a stub of the Supabase
`auth` schema and the `judges` table described in the FairGame Operations Guide,
on August 31, 2026. They applied cleanly and are safe to run twice. Expect these
numbers after step 3:

| Table | Rows |
|---|---|
| `fair_events` | 35 |
| `fair_contacts` | 27 |
| `fair_deadlines` | 18 |
| `fair_scrape_sources` | 20 |
| `email_templates` after migration 03 | 6 |
| `fair_plan_task_templates` | 20 |
| `email_templates` after migration 04 | 7 |

By state: Ohio 15 fairs with 13 verified, California 9 with 6 verified,
Tennessee 5 with 3 verified, Michigan 6 with 2 verified. Tennessee correctly
shows zero state-level fairs, because its regional fairs advance to ISEF without
a state round.

Row level security was tested the same way. An anonymous client saw 25 of the 35
fairs, which is right: leads stay hidden until a person confirms them. It saw
zero contacts, zero campaigns, zero plans, and its insert into `fair_events` was
refused. A signed-in judge saw 25 fairs and all 27 contacts and still saw zero
campaigns. `fg_preview_judge_recipients()` returned rows for an admin and nothing
for a judge, and it correctly skipped a judge whose address was in
`email_suppressions`. `fg_seed_plan_tasks()` produced 20 dated checklist rows
from one target date.

Migration 04 was tested against a database built from the live column list above,
not from an assumed one. A judge in Columbus with a 45 mile radius
and a preference for regional and state fairs matched the three Franklin County
fairs at a score of 105 and 1.1 miles, geocoded from city alone with no postal
code on file. A judge with nothing but a name, an email, and a state produced
five research items and no blocking ones.
Publishing three fairs moved them to published, set `profile_status`, and queued
one campaign whose recipient carried a formatted fair list. A judge calling the
publish function was refused.

If your numbers differ after running the migrations, stop and tell me before
building anything on top of them.
