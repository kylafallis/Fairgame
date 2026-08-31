-- =====================================================================
-- FairGame Initiative
-- Migration 03: Outreach email templates
-- =====================================================================
--
-- BEFORE THE FIRST SEND
--   CAN-SPAM requires a valid physical postal address in every
--   commercial or promotional message, and a working unsubscribe link.
--   Replace {{org_postal_address}} with FairGame's real mailing address
--   in the campaign composer defaults. Do not send without it.
--
--   SENDING ADDRESS vs REPLY ADDRESS
--   Resend will only send from a domain you have verified by DNS, so the
--   From address is judges@fairgameinitiative.org. Replies are routed to
--   fairgameinitiative@outlook.com through the Reply-To header, and that
--   same address is printed in every signature so a recipient can write
--   back by hand. You do not need a mailbox on the .org domain.
--
--   Merge fields available:
--     {{first_name}} {{last_name}} {{fair_name}} {{fair_date}}
--     {{fair_city}} {{fair_venue}} {{state_name}} {{county}}
--     {{judge_signup_url}} {{fair_website}} {{registration_deadline}}
--     {{sender_name}} {{sender_title}} {{org_postal_address}}
--     {{unsubscribe_url}}
-- =====================================================================

insert into public.email_templates (key, name, audience, subject, body_markdown, merge_fields)
values

-- 1 ------------------------------------------------------------------
('fair_director_intro',
 'Fair director: first contact',
 'fair_director',
 'Judges for {{fair_name}}, from a county-level database',
$MSG$Dear {{first_name}},

My name is {{sender_name}} and I lead FairGame Initiative, a nonprofit that helps rural and low-income schools take part in competitive STEM. We keep a database of volunteer judges sorted by county and by subject area, and we open it to fair directors at no cost.

I am writing because {{fair_name}} serves schools in a region we work in. Judge recruitment eats hours that most fair directors do not have. Our database lets you search by county, filter by field, and send an invitation without building a list from nothing.

Two pieces of information would help us point judges your way:

- Your date and venue for the coming cycle, once they are set
- The name of the person who handles judge recruitment on your side

If it would help, we can also notify judges in your counties when your registration opens. You would read and approve that message before it goes anywhere.

Thank you for the work you put into this fair. Students remember it for years.

{{sender_name}}
{{sender_title}}, FairGame Initiative
fairgameinitiative@outlook.com
fairgameinitiative.org

{{org_postal_address}}
Stop receiving these messages: {{unsubscribe_url}}
$MSG$,
 array['first_name','fair_name','sender_name','sender_title','org_postal_address','unsubscribe_url']),

-- 2 ------------------------------------------------------------------
('district_coordinator_intro',
 'District STEM coordinator: first contact',
 'district_coordinator',
$SUBJ$Science fair support for {{county}} County schools$SUBJ$,
$MSG$Dear {{first_name}},

I lead FairGame Initiative, a nonprofit that helps schools start and run science fairs. We work with buildings that have never held one, and with teachers who want to send students to a regional fair for the first time.

Most schools stall at the same two points. They cannot find judges, and they do not know the deadline calendar for the fair above them. We built free tools for both. Teachers in your district can search our judge database by county and expertise, pull a full planning checklist, and see the dates for {{fair_name}} without hunting through five websites.

There is no cost, no contract, and nothing to install. Teachers request an account and we review it by hand.

If it is useful, I can send a one-page summary you could forward to your building principals or to your science leads. I am also glad to take fifteen minutes by phone.

Thank you for your time.

{{sender_name}}
{{sender_title}}, FairGame Initiative
fairgameinitiative@outlook.com
fairgameinitiative.org

{{org_postal_address}}
Stop receiving these messages: {{unsubscribe_url}}
$MSG$,
 array['first_name','county','fair_name','sender_name','sender_title','org_postal_address','unsubscribe_url']),

-- 3 ------------------------------------------------------------------
('judge_fair_upcoming',
 'Judge: a fair near you needs judges',
 'judge',
$SUBJ${{fair_name}} needs judges on {{fair_date}}$SUBJ$,
$MSG$Hello {{first_name}},

You are on the FairGame judge list for {{county}} County, so I wanted you to know about a fair nearby.

{{fair_name}}
{{fair_date}} at {{fair_venue}}, {{fair_city}}
Sign up: {{judge_signup_url}}
Fair website: {{fair_website}}

Judging usually runs a single morning. You talk with students about their work, score against a rubric the fair provides, and give each one a few sentences of written feedback. No preparation is required beyond reading the rubric, and the fair trains you on site.

For many of these students you are the first working scientist or engineer they have ever spoken with about their own research. That conversation carries further than the score does.

If you cannot make this date, no reply is needed. I will write again when the next fair in your area comes up.

{{sender_name}}
{{sender_title}}, FairGame Initiative
fairgameinitiative@outlook.com
fairgameinitiative.org

{{org_postal_address}}
Stop receiving these messages: {{unsubscribe_url}}
$MSG$,
 array['first_name','county','fair_name','fair_date','fair_venue','fair_city','judge_signup_url','fair_website','sender_name','sender_title','org_postal_address','unsubscribe_url']),

-- 4 ------------------------------------------------------------------
('judge_state_launch',
 'Judge: FairGame is now covering your state',
 'judge',
$SUBJ$FairGame is now working with schools in {{state_name}}$SUBJ$,
$MSG$Hello {{first_name}},

FairGame Initiative has opened judge matching in {{state_name}}. You signed up to judge, and I am writing so you know what happens next.

We map every regional and state fair in {{state_name}} with its date, venue, and registration deadline. When a fair in your county needs judges, you get one email with the date and a signup link. When a school in your county starts its own fair, often for the first time, we ask a small number of judges nearby rather than emailing the whole list.

You will hear from us a few times a year at most. Every message carries an unsubscribe link and we honor it the same day.

If your county, your field, or your willingness to travel has changed since you signed up, reply and I will update your record.

Thank you for volunteering.

{{sender_name}}
{{sender_title}}, FairGame Initiative
fairgameinitiative@outlook.com
fairgameinitiative.org

{{org_postal_address}}
Stop receiving these messages: {{unsubscribe_url}}
$MSG$,
 array['first_name','state_name','sender_name','sender_title','org_postal_address','unsubscribe_url']),

-- 5 ------------------------------------------------------------------
('fair_director_followup',
 'Fair director: second contact after no reply',
 'fair_director',
$SUBJ$Following up on judges for {{fair_name}}$SUBJ$,
$MSG$Dear {{first_name}},

I wrote a few weeks ago about the FairGame judge database and did not want the message to get buried.

The short version: we keep volunteer judges sorted by county and subject area, and fair directors may use the list at no cost. If you tell me your date and how many judges you are short, I will send the request to judges within driving distance of {{fair_city}}.

If someone else at {{fair_name}} handles judging, I would appreciate a name.

If this is not something you need, say so and I will close the file.

{{sender_name}}
{{sender_title}}, FairGame Initiative
fairgameinitiative@outlook.com
fairgameinitiative.org

{{org_postal_address}}
Stop receiving these messages: {{unsubscribe_url}}
$MSG$,
 array['first_name','fair_name','fair_city','sender_name','sender_title','org_postal_address','unsubscribe_url']),

-- 6 ------------------------------------------------------------------
('judge_welcome',
 'Judge: welcome after registration',
 'judge',
$SUBJ$You are on the FairGame judge list for {{county}} County$SUBJ$,
$MSG$Hello {{first_name}},

Thank you for adding yourself to the FairGame judge database. Your record shows {{county}} County and your listed field of work.

Here is what to expect. When a fair in your area needs judges, you get one short email with the date, the venue, and a signup link. You accept or ignore it. Nothing else is asked of you, and we never pass your address to a third party.

Your dashboard shows every fair in your state with its date and deadline, so you can also volunteer directly without waiting to hear from us.

If your county or field changes, update your profile or reply to this message.

{{sender_name}}
{{sender_title}}, FairGame Initiative
fairgameinitiative@outlook.com
fairgameinitiative.org

{{org_postal_address}}
Stop receiving these messages: {{unsubscribe_url}}
$MSG$,
 array['first_name','county','sender_name','sender_title','org_postal_address','unsubscribe_url'])

on conflict (key) do update
set name          = excluded.name,
    audience      = excluded.audience,
    subject       = excluded.subject,
    body_markdown = excluded.body_markdown,
    merge_fields  = excluded.merge_fields,
    updated_at    = now();

-- =====================================================================
-- END MIGRATION 03
-- =====================================================================
