# State directors and regional coordinators

A **state director** looks after one state. A **regional coordinator** looks
after one region (a group of counties) inside a state. Both use
`/portal-state.html`, which shows the state's fairs, its volunteer judges
(without contact details), its regions, its team, and a list of things that
look wrong.

## Setting it up (once)

1. **Run migration 18** (`supabase/migrations/18_state_directors.sql`) in the
   Supabase SQL editor. It adds the two roles, regions, invitations, and the
   functions the state page calls.
2. **Run migration 19** (`supabase/migrations/19_judge_counties.sql`). It is
   large because it carries the ZIP-to-county list; paste the whole file and
   run it. The last thing it prints is how many judges in each state still
   have no county.
3. **Deploy the invite email function**. It is optional; without it you copy
   each link and send it yourself:
   ```bash
   supabase functions deploy create-invite
   ```
   It uses the `RESEND_API_KEY` the judge emails already use.
4. **Allow the accept page as a sign-in redirect.** In Supabase, go to
   Authentication → URL Configuration → Redirect URLs and make sure
   `https://fairgameinitiative.org/**` (or
   `https://fairgameinitiative.org/accept-invite.html`) is listed. Without it,
   "Continue with Google" lands on the home page. The emailed 6-digit code
   still works either way.

5. **Run migration 20** (`supabase/migrations/20_fair_pages.sql`). It adds
   the public fair pages and fair editing, and **marks every current fair
   "not verified"** (once; running it again does not repeat that). Fairs
   then stay off the public site until a state director checks each one
   and presses "Save and mark verified". The old status is kept, and the
   undo is at the bottom of the file.

Migration `17_homepage_stats.sql` is on the `claude/charming-gates-c3tnmq`
branch and does not interact with 18 or 19, so the order between them does
not matter.

## Checking a state before inviting anyone

Admin portal → **States & Directors** → pick a state → **Open state view**.
This opens `/portal-state.html?state=OH`, which is exactly what the Ohio
director will see. The "View as" menu at the top also shows what one
region's coordinator would see. Changes you make there, such as drawing
regions, are real.

## Sending a state director their link

Admin portal → **States & Directors** → **Invite a state director**. Enter
their name, email and state, then press **Create invitation**.

- The link is shown **once**. Copy it. The database keeps only a fingerprint
  of it, so it cannot be looked up later.
- If email is set up, it is also emailed to them.
- It works once, only for that email address, and expires after 14 days.
- Wrong person, or lost link? Press **Withdraw** in the same section and
  create a new one. Creating a new invitation for the same person withdraws
  the old one automatically.

When they open it, they sign in with Google or an emailed code (an account
is created if they do not have one), and land on their state page. From
there they draw regions and invite coordinators the same way.

## Fair pages

Every fair has a public page at `/fair.html?f=<slug>`, and each state has a
list at `/fair.html?state=OH`. Only verified fairs show to the public. A
signed-in director (or admin) also sees their unverified fairs, marked as a
preview, with a link back to the editor.

Directors manage their fairs from **Fairs** in the state portal: click a
fair to edit dates, venue, registration, judging needs, an "About" paragraph
and links, then **Save** (stays as it is) or **Save and mark verified**
(goes public). **+ Add a fair** creates a new one; **Remove fair** takes one
down without deleting its record. Coordinators can open fairs but not edit.

Every item in **Things to check** is clickable: fair items open that fair's
editor, judge items jump to the judge, region items open the region.

## Regions map

The Regions tab shows the state's real county map (US Census boundaries,
built by `scripts/build_county_shapes.js` into `data/geo/county-shapes/`).
Hovering outlines a county; clicking adds it to the region being edited
(green) or takes it out. Other regions are tinted and cannot be clicked
until the county is taken out of them. "Pick from a list instead" does the
same thing with checkboxes.

## Things to know

- One account holds one role. Accepting an invitation on an account that is
  already a judge, teacher, and so on replaces that role; the accept page
  warns them first. Admins cannot accept; they already see every state.
- Directors and coordinators never see judges' email, phone, notes or
  background checks. To reach a judge they go through the FairGame team.
- Removing someone (Team & Invitations → Remove) sets their account to
  inactive. It does not delete it.
- Judge counties come from the 2000 Census ZIP list. ZIPs created after 2000
  fall back to the nearest known ZIP within 25 miles, which needs
  `us_zip_centroids` loaded (see migration 14). Anything left shows on the
  state page as "has no county".
- Connecticut uses its old eight counties in the region picker.
