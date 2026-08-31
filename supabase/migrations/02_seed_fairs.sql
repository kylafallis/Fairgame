-- =====================================================================
-- FairGame Initiative
-- Migration 02: Seed the fair directory
-- Research date: August 31, 2026. Every row carries its source URL.
-- =====================================================================
--
-- HOW TO READ verification_status
--   verified  Confirmed on the fair's own site or an official PDF on
--             August 31, 2026. Dates are for the cycle named in
--             cycle_year. Treat as good until the scraper says otherwise.
--   lead      The fair exists and is named by a credible source, but the
--             page did not load, the dates were missing, or the contact
--             was not published. Needs a human or the scraper to finish.
--   stale     Verified once, but the newest published date has already
--             passed and no newer cycle is posted yet.
--
-- A NOTE ON SCHOOL-LEVEL FAIRS
--   Individual school science fairs are not published in any public
--   directory anywhere in these four states. No scraper can find them.
--   They enter this table one of two ways: a teacher registers one
--   through the teacher portal, or a fair manager creates a plan and
--   marks it public. That gap is the reason FairGame is worth building.
-- =====================================================================

-- ---------------------------------------------------------------------
-- OHIO
-- ---------------------------------------------------------------------

insert into public.fair_events
 (slug, name, short_name, level, state_code, host_org, venue_name, venue_address, city,
  grade_min, grade_max, event_start_date, judging_date, judging_start_time, judging_end_time,
  awards_date, schedule_note, registration_deadline, payment_deadline, fee_note,
  isef_affiliate, registration_platform, website_url, source_url,
  verification_status, last_verified_at, cycle_year, notes)
values
 ('oh-state-science-day-2026',
  'Ohio State Science Day', 'State Science Day', 'state', 'OH',
  'The Ohio Academy of Science', 'Covelli Center',
  'The Ohio State University', 'Columbus',
  5, 12, '2026-05-16', '2026-05-16', '09:00', '12:30', '2026-05-16',
  'Student check-in opens 7:40 am. Judging 9:00 am to 12:30 pm. Awards 2:45 pm. Event ends 4:45 pm.',
  null, null, null,
  false, 'ProjectBoard',
  'https://ssd.ohiosci.org/',
  'https://ssd.ohiosci.org/2026-state-science-day/',
  'verified', now(), 2026,
  'Qualification runs through Regional Science Day. The 2027 date was not posted as of August 31, 2026.'),

 ('oh-buckeye-sef-2026',
  'Buckeye Science and Engineering Fair', 'BSEF', 'state', 'OH',
  'The Ohio Academy of Science', 'CAS',
  '2540 Olentangy River Road', 'Columbus',
  9, 12, '2026-03-07', '2026-03-07', null, null, null,
  'Advances six projects to the Regeneron International Science and Engineering Fair.',
  '2026-02-04', null, '$50.00 per student, nonrefundable',
  true, 'ProjectBoard',
  'https://www.ohiosci.org/bsef/',
  'https://www.ohiosci.org/bsef/',
  'verified', now(), 2026,
  'Project submissions closed 5:00 pm on February 4, 2026. ProjectBoard portal opened December 8, 2025.')
on conflict (slug) do nothing;

-- Ohio Regional Science Days, 2026 cycle.
-- Source: The Ohio Academy of Science 2026 RSD payment information PDF.
insert into public.fair_events
 (slug, name, level, state_code, host_org, city, event_start_date, judging_date,
  payment_deadline, fee_note, registration_platform, source_url,
  verification_status, last_verified_at, cycle_year, notes)
values
 ('oh-rsd-ashland-2026','Regional Science Day at Ashland University','regional','OH',
  'Ashland University','Ashland','2026-03-21','2026-03-21','2026-03-03',
  '$30.00 per student','ProjectBoard',
  'https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf',
  'verified', now(), 2026,
  'Also published locally as Mohican District Science Day, 64th annual in 2026.'),

 ('oh-rsd-belmont-2026','Regional Science Day at Belmont College','regional','OH',
  'Belmont College','St. Clairsville','2026-03-21','2026-03-21','2026-03-03',
  '$30.00 per student','ProjectBoard',
  'https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf',
  'verified', now(), 2026, null),

 ('oh-rsd-columbus-state-2026','Regional Science Day at Columbus State Community College','regional','OH',
  'Columbus State Community College','Columbus','2026-03-21','2026-03-21','2026-03-03',
  '$30.00 per student','ProjectBoard',
  'https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf',
  'verified', now(), 2026, null),

 ('oh-rsd-edison-state-2026','Regional Science Day at Edison State Community College','regional','OH',
  'Edison State Community College','Piqua','2026-03-14','2026-03-14','2026-03-03',
  '$30.00 per student','ProjectBoard',
  'https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf',
  'verified', now(), 2026, 'Listed contact email routes to the Upper Miami Valley Science District.'),

 ('oh-rsd-kent-state-2026','Regional Science Day at Kent State University','regional','OH',
  'Kent State University','Kent','2026-03-21','2026-03-21','2026-03-03',
  '$30.00 per student','ProjectBoard',
  'https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf',
  'verified', now(), 2026, null),

 ('oh-rsd-miami-valley-ctc-2026','Regional Science Day at Miami Valley Career Technology Center','regional','OH',
  'Miami Valley CTC','Clayton','2026-03-14','2026-03-14','2026-03-03',
  '$30.00 per student','ProjectBoard',
  'https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf',
  'verified', now(), 2026, null),

 ('oh-rsd-ohio-northern-2026','Regional Science Day at Ohio Northern University','regional','OH',
  'Ohio Northern University','Ada','2026-03-28','2026-03-28','2026-03-03',
  '$30.00 per student','ProjectBoard',
  'https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf',
  'verified', now(), 2026, null),

 ('oh-rsd-ohio-university-2026','Regional Science Day at Ohio University','regional','OH',
  'Ohio University','Athens','2026-03-21','2026-03-21','2026-03-03',
  '$30.00 per student','ProjectBoard',
  'https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf',
  'verified', now(), 2026,
  'Run through the Voinovich School. The AEP Ohio Foundation sponsors environmental science awards here.'),

 ('oh-rsd-cincinnati-2026','Regional Science Day at the University of Cincinnati','regional','OH',
  'University of Cincinnati','Cincinnati','2026-03-14','2026-03-14','2026-03-03',
  '$30.00 per student','ProjectBoard',
  'https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf',
  'verified', now(), 2026,
  'Also published as the Southwest Ohio Science and Engineering Expo through the College of Education.'),

 ('oh-rsd-rio-grande-2026','Regional Science Day at the University of Rio Grande','regional','OH',
  'University of Rio Grande','Rio Grande','2026-03-28','2026-03-28','2026-03-03',
  '$30.00 per student','ProjectBoard',
  'https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf',
  'verified', now(), 2026, null),

 ('oh-rsd-toledo-2026','Regional Science Day at the University of Toledo','regional','OH',
  'University of Toledo','Toledo','2026-03-14','2026-03-14','2026-03-03',
  '$30.00 per student','ProjectBoard',
  'https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf',
  'verified', now(), 2026, 'Hosted by the College of Natural Sciences and Mathematics.')
on conflict (slug) do nothing;

-- Ohio leads
insert into public.fair_events
 (slug, name, level, state_code, host_org, venue_name, city, counties_served,
  website_url, source_url, verification_status, last_verified_at, cycle_year, notes)
values
 ('oh-district-17-science-day','District 17 Science Day','district','OH',
  'Wilmington College and Southern State Community College',
  'Southern State Community College Central Campus','Hillsboro',
  array['Adams','Brown','Clinton','Fayette','Highland'],
  'https://www.wilmington.edu/science-day','https://www.wilmington.edu/science-day',
  'lead', now(), 2026,
  'Held in March. Coordinator name and email are not published on the page. Call Wilmington College to confirm before the 2027 cycle.'),

 ('oh-north-central-district-3','North Central District Science Fair (District 3)','district','OH',
  'The Ohio Academy of Science District 3',null,'Marion',null,
  'https://ssd.ohiosci.org/','https://osumarion.osu.edu/outreach/educational-partnerships/science-fair',
  'lead', now(), 2026,
  'The Ohio State University at Marion stopped hosting after the 2023-24 year. Confirm the current host with the Ohio Academy of Science.')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- TENNESSEE
-- ---------------------------------------------------------------------

insert into public.fair_events
 (slug, name, short_name, level, state_code, host_org, venue_name, venue_address, city,
  grade_min, grade_max, divisions, event_start_date, judging_date, awards_date,
  registration_opens, registration_deadline, isef_affiliate, registration_platform,
  website_url, judge_signup_url, source_url, verification_status, last_verified_at,
  cycle_year, notes)
values
 ('tn-sasef-2027',
  'Southern Appalachian Science and Engineering Fair','SASEF','regional','TN',
  'The University of Tennessee, Knoxville',
  'Agriculture and Natural Resources Building','2431 Joe Johnson Dr','Knoxville',
  6, 12, array['Junior (grades 6-8)','Senior (grades 9-12)'],
  '2027-03-23','2027-03-23','2027-03-30',
  '2026-09-01', null, true, null,
  'https://sasef.utk.edu/','https://sasef.utk.edu/information-for-judges/',
  'https://sasef.utk.edu/','verified', now(), 2027,
  'Serves a 23-county region. Awards ceremony begins 6:00 pm on March 30, 2027. Registration for teachers and students opened September 1, 2026.'),

 ('tn-mtsef-2027',
  'Middle Tennessee Science and Engineering Fair','MTSEF','regional','TN',
  'Middle Tennessee Science and Engineering Fair, Inc.',
  'Featheringill Hall','Vanderbilt University','Nashville',
  6, 12, null, '2027-04-03','2027-04-03', null,
  '2026-08-15','2026-12-04', true, 'MySciFair',
  'https://www.mtsef.org/', null,
  'https://www.mtsef.org/','verified', now(), 2027,
  'MySciFair registration code USTN06. Judges apply through a Google Form linked from the site. 501(c)(3), EIN 81-0790680.'),

 ('tn-cumberland-plateau-2026',
  'Cumberland Plateau Regional Science and Engineering Fair','CPRSEF','regional','TN',
  'Tennessee Tech University, Millard Oakley STEM Center',
  'Academic Wellness Center','1150 McGee Blvd','Cookeville',
  5, 12, array['Junior (grades 5-8)','Senior (grades 9-12)'],
  '2026-05-01','2026-05-01', null,
  null,'2026-04-19', true, null,
  'https://www.tntech.edu/education/stem/scifair.php', null,
  'https://www.tntech.edu/education/stem/scifair.php','verified', now(), 2026,
  '68th annual in 2026. Check-in 7:30 to 9:00 am. Morning judging 9:30 am to noon, afternoon judging 1:30 to 3:00 pm, both closed to the public. 2025 participants came from Putnam, DeKalb, White, Bledsoe, Fentress, Macon, and Smith counties.')
on conflict (slug) do nothing;

insert into public.fair_events
 (slug, name, short_name, level, state_code, host_org, venue_name, city,
  event_start_date, event_end_date, isef_affiliate, website_url, source_url,
  verification_status, last_verified_at, cycle_year, notes)
values
 ('tn-chattanooga-crsef',
  'Chattanooga Regional Science and Engineering Fair','CRSEF','regional','TN',
  'The University of Tennessee at Chattanooga, STEM Education Department',
  'Maclellan Gymnasium','Chattanooga',
  '2025-03-04','2025-03-06', true,
  'https://sites.google.com/view/chattanooga-science-fair-2018/home',
  'https://www.utc.edu/health-education-and-professional-studies/stem-education/science-fair',
  'stale', now(), 2025,
  'Newest dates published are March 4 to 6, 2025. Department office is Hunter Hall 107A, Dept 4154, 651 McCallie Ave. Confirm the 2027 cycle by phone.'),

 ('tn-memphis-shelby',
  'Memphis and Shelby County Science and Engineering Fair', null,'regional','TN',
  'Memphis-Shelby County Schools', null,'Memphis',
  null, null, true, null,
  'https://sasef.utk.edu/related-links',
  'lead', now(), null,
  'Named as a Tennessee ISEF affiliate on the SASEF related links page. No current public site, dates, or named contact located on August 31, 2026.')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- MICHIGAN
-- ---------------------------------------------------------------------

insert into public.fair_events
 (slug, name, short_name, level, state_code, host_org, venue_name, city,
  counties_served, grade_min, grade_max, divisions,
  event_start_date, event_end_date, judging_date, judging_start_time, judging_end_time,
  registration_deadline, fee_note, isef_affiliate, registration_platform,
  website_url, source_url, verification_status, last_verified_at, cycle_year, notes)
values
 ('mi-sefmd-2026',
  'Science and Engineering Fair of Metropolitan Detroit','SEFMD','regional','MI',
  'Science and Engineering Fair of Metropolitan Detroit, Inc.',
  'Huntington Place','Detroit',
  array['Lenawee','Livingston','Macomb','Monroe','Oakland','Washtenaw','Wayne'],
  3, 12, array['Elementary (grades 3-5)','Junior (grades 6-8)','Senior (grades 9-12)'],
  '2026-03-17','2026-03-20','2026-03-18','08:00','17:00',
  '2026-02-20',
  'School affiliation $75, reduced to $25 if paid by December 1 with a volunteer commitment. Project entry $25, billed to the school.',
  true, null,
  'https://www.sefmd.org/',
  'https://www.sefmd.org/Forms/2026-Forms/2025-2026%20Newsletter-Rev%20B.pdf',
  'verified', now(), 2026,
  'Setup Tuesday March 17, 9 am to 7 pm. Judging Wednesday March 18. Public viewing March 19 and 20, 9 am to 7 pm. School affiliation and SRC deadline was December 1, 2025.'),

 ('mi-smsef-2026',
  'Southwest Michigan Science and Engineering Fair','SMSEF','regional','MI',
  'Kalamazoo Area Mathematics and Science Center',
  'Western Michigan University College of Engineering and Applied Sciences','Kalamazoo',
  null, 9, 12, null,
  '2026-03-20', null,'2026-03-20','09:00','15:00',
  null, null, false, null,
  'https://sites.google.com/KAMSC.org/SMSEF',
  'https://sites.google.com/KAMSC.org/SMSEF',
  'verified', now(), 2026,
  'Up to ten projects advance to the Michigan Science and Engineering Fair. Grand award winners are invited to Regeneron ISEF. No contact name or email published on the site.')
on conflict (slug) do nothing;

insert into public.fair_events
 (slug, name, short_name, level, state_code, host_org, city,
  registration_platform, website_url, source_url,
  verification_status, last_verified_at, cycle_year, notes)
values
 ('mi-misef-state',
  'Michigan Science and Engineering Fair','MISEF','state','MI',
  'Michigan Science and Engineering Fair', null,
  'zFairs','https://misef.zfairs.com/',
  'https://misef.zfairs.com/?siteid=contactUs&f=43c649b1-8c01-412a-93b2-2f28ccf699be',
  'lead', now(), null,
  'Confirmed to exist and to run on zFairs. Regional fairs including SMSEF advance up to ten projects here. The contact page would not load on August 31, 2026, so dates and staff names are unconfirmed.'),

 ('mi-flint-regional',
  'Flint Regional Science and Engineering Fair', null,'regional','MI',
  'Flint Regional Science and Engineering Fair','Flint',
  null, null, 'https://10times.com/flint-regional-science-fair',
  'lead', now(), null,
  'Listed by an event aggregator as running in March 2026. Needs a primary source before any outreach.'),

 ('mi-western-up',
  'Western Upper Peninsula Science Fair and STEM Festival', null,'regional','MI',
  'Michigan Technological University','Houghton',
  null, null,
  'https://www.uppermichiganssource.com/content/news/Michigan-Technological-University-hosts-21st-Annual-Western-Upper-Peninsula-Science-Fair-and-STEM-Festival-507380051.html',
  'lead', now(), null,
  'Annual event hosted by Michigan Technological University. Confirm the current cycle with the university before outreach.'),

 ('mi-eastern-up',
  'Eastern Upper Peninsula Regional Science and Engineering Fair', null,'regional','MI',
  'Eastern Upper Peninsula Intermediate School District','Sault Ste. Marie',
  null,'https://www.eupschools.org/page/sci-eng-fair','https://www.eupschools.org/page/sci-eng-fair',
  'lead', now(), null,
  'Run by the intermediate school district. Page located but not yet read for dates or contacts.')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- CALIFORNIA
-- ---------------------------------------------------------------------

insert into public.fair_events
 (slug, name, short_name, level, state_code, host_org, venue_name, city,
  website_url, source_url, verification_status, last_verified_at, cycle_year, notes)
values
 ('ca-csef-state',
  'California Science and Engineering Fair','CSEF','state','CA',
  'California Science and Engineering Fair','California Lutheran University','Thousand Oaks',
  'https://csef.usc.edu/','https://en.wikipedia.org/wiki/California_Science_and_Engineering_Fair',
  'lead', now(), 2026,
  'Named the official state science fair in 1990. Moved to California Lutheran University after years at the California Science Center. Roughly 900 students across 18 categories. The csef.usc.edu Current page still showed 2024 content on August 31, 2026, so treat published dates there with caution. General email CSEF@usc.edu.')
on conflict (slug) do nothing;

insert into public.fair_events
 (slug, name, short_name, level, state_code, host_org, venue_name, city,
  counties_served, grade_min, grade_max, event_start_date, event_end_date,
  judging_date, judging_start_time, judging_end_time, awards_date,
  registration_opens, registration_deadline, payment_deadline,
  isef_affiliate, registration_platform, website_url, judge_signup_url, source_url,
  verification_status, last_verified_at, cycle_year, notes)
values
 ('ca-lacsef-2026',
  'Los Angeles County Science and Engineering Fair','LACSEF','regional','CA',
  'Los Angeles County Science and Engineering Fair','Shrine Expo Hall','Los Angeles',
  array['Los Angeles'], null, null, '2026-03-08','2026-03-09',
  null, null, null, null, null, null, null,
  true, null, 'https://www.lacsef.org/', null, 'https://lascifair.org/',
  'verified', now(), 2026,
  '76th annual in 2026. Founded 1950. More than 1,000 students from over 150 schools across 41 categories. The organization moved from lascifair.org to lacsef.org. Site coordinator, judge, and volunteer signup paths all exist on the new site.'),

 ('ca-gsdsef-2026',
  'Greater San Diego Science and Engineering Fair','GSDSEF','regional','CA',
  'Greater San Diego Science and Engineering Fair','Balboa Park Activity Center','San Diego',
  array['San Diego','Imperial'], 6, 12, '2026-03-18', null,
  '2026-03-18', null, null, null,
  '2026-01-02', null, '2026-03-12',
  true, 'zFairs', 'https://www.gsdsef.org/',
  'https://www.gsdsef.org/information/judging-info', 'https://gsdsef.org/',
  'verified', now(), 2026,
  '72nd annual in 2026, established 1955. Mailing address P.O. Box 15547, San Diego, CA 92175. Category judge resources at gsdsef.org/information/judging-resources.'),

 ('ca-synopsys-scvsefa-2027',
  'Synopsys Silicon Valley Science and Technology Championship','Synopsys Championship','regional','CA',
  'Santa Clara Valley Science and Engineering Fair Association', null,'San Jose',
  array['Santa Clara'], null, null, '2027-03-03','2027-03-04',
  '2027-03-03', null, null, null,
  '2026-09-28','2027-01-08', null,
  true, null, 'https://science-fair.org/', null, 'https://science-fair.org/',
  'verified', now(), 2027,
  'Applications open September 28, 2026. New participant deadline January 8, 2027. SRC and IRB pre-approval November 13, 2026. Abstract upload closes February 20, 2027 at 8 pm. Category judge registration opens December 1, 2026. Mailing address P.O. Box 307, Los Altos, CA 94023.'),

 ('ca-acsef-2027',
  'Alameda County Science and Engineering Fair','ACSEF','regional','CA',
  'Alameda County Science and Engineering Fair','Chabot College','Hayward',
  array['Alameda'], null, null, '2027-03-12','2027-03-13',
  '2027-03-13','09:00','16:00','2027-03-27',
  null, null, null,
  true, null, 'https://www.acsef.org/','https://www.acsef.org/judges','https://www.acsef.org/',
  'verified', now(), 2027,
  'Setup Friday March 12, 2027, 3 to 8 pm. Judging Saturday March 13, 9 am to 4 pm. Awards Saturday March 27, 1 to 5 pm in the Performing Arts Complex. Affiliated with the Thermo Fisher Scientific Junior Innovators Challenge, CSEF, and Regeneron ISEF.'),

 ('ca-riverside-2027',
  'Riverside County Science and Engineering Fair','RCSEF','regional','CA',
  'Riverside County Office of Education','Riverside Convention Center','Riverside',
  array['Riverside'], 4, 12, '2027-02-26','2027-02-27',
  '2027-02-26','07:00','17:00','2027-02-27',
  '2026-08-17','2027-02-01', null,
  false, 'zFairs',
  'https://www.rcoe.us/about-us/superintendent/office-of-the-superintendent/community-engagement-and-partnerships/student-events/science-and-engineering-fair/',
  null,
  'https://www.rcoe.us/about-us/superintendent/office-of-the-superintendent/community-engagement-and-partnerships/student-events/science-and-engineering-fair/',
  'verified', now(), 2027,
  'Venue is 3637 Fifth St., Riverside. Public viewing and awards Saturday February 27, 9 am to 2 pm with awards at noon. Intent to Participate form was due September 2, 2026. Projects due in zFairs February 8, 2027.'),

 ('ca-sacramento-stem-fair-2027',
  'Sacramento Regional STEM Fair', null,'regional','CA',
  'Sacramento Regional STEM Fair', null,'Sacramento',
  array['Amador','Butte','El Dorado','Placer','Plumas','Sacramento','San Joaquin',
        'Shasta','Solano','Sutter','Yolo','Yuba'],
  5, 12, null, null, null, null, null, null, null, null, null,
  true, null, 'https://sacstemfair.org/','https://sacstemfair.org/judges-volunteers/',
  'https://sacstemfair.org/stem-fair/',
  'verified', now(), 2027,
  'Competitive divisions are grades 6 to 12. Students must be under 20 on May 1, 2027. Only students from Amador, Butte, El Dorado, Placer, Plumas, Sacramento, Shasta, Sutter, Yolo, and Yuba counties may qualify for the state fair. EIN 91-2169205. Event dates were not posted on August 31, 2026.')
on conflict (slug) do nothing;

insert into public.fair_events
 (slug, name, short_name, level, state_code, host_org, city, counties_served,
  website_url, source_url, verification_status, last_verified_at, notes)
values
 ('ca-ocsef',
  'Orange County Science and Engineering Fair','OCSEF','regional','CA',
  'Orange County Science and Engineering Fair, Inc.','Irvine', array['Orange'],
  'https://www.ocsef.org/','https://www.ocsef.org/',
  'lead', now(),
  'Organization confirmed as an Irvine-based nonprofit. The website did not render content on August 31, 2026. Dates and contacts unconfirmed.'),

 ('ca-santa-cruz-sef',
  'Santa Cruz County Science and Engineering Fair', null,'regional','CA',
  'Santa Cruz County Science and Engineering Fair','Santa Cruz', array['Santa Cruz'],
  null,'https://en.wikipedia.org/wiki/Santa_Cruz_County_Science_and_Engineering_Fair',
  'lead', now(),
  'Fair exists in public reference sources. Needs a primary site check before outreach.')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- CONTACTS
-- ---------------------------------------------------------------------

insert into public.fair_contacts
 (fair_id, full_name, title, contact_role, email, phone, mailing_address,
  is_primary, source_url, verification_status, last_verified_at, notes)
select f.id, v.full_name, v.title, v.contact_role, v.email::citext, v.phone,
       v.mailing_address, v.is_primary, v.source_url, v.verification_status, now(), v.notes
from (values
 -- Ohio Academy of Science central office covers State Science Day and BSEF
 ('oh-state-science-day-2026', null, 'Ohio Academy of Science main office','general',
  'info@ohiosci.org','614-389-2182','5910 Wilcox Pl., Suite G, Dublin, OH 43016', true,
  'https://www.ohiosci.org/bsef/','verified', null),
 ('oh-buckeye-sef-2026', null, 'Ohio Academy of Science main office','general',
  'info@ohiosci.org','614-389-2182','5910 Wilcox Pl., Suite G, Dublin, OH 43016', true,
  'https://www.ohiosci.org/bsef/','verified', null),

 -- Ohio Regional Science Day coordinators
 ('oh-rsd-ashland-2026','Dr. Jeffrey Weidenhamer', null,'coordinator',
  'jweiden@ashland.edu', null, null, true,
  'https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf','verified', null),
 ('oh-rsd-belmont-2026','Chris Clantz', null,'coordinator',
  'cclantz@belmontcollege.edu', null, null, true,
  'https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf','verified', null),
 ('oh-rsd-columbus-state-2026','Dr. Matthew Saelzer', null,'coordinator',
  'msaelzle@cscc.edu', null, null, true,
  'https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf','verified',
  'The published name and the published email do not match in spelling. Confirm before sending.'),
 ('oh-rsd-edison-state-2026','Dr. Martin E. English', null,'coordinator',
  'info@ohioumvsd.com', null, null, true,
  'https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf','verified', null),
 ('oh-rsd-kent-state-2026','Ann Gosky', null,'coordinator',
  'agosky@kent.edu', null, null, true,
  'https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf','verified', null),
 ('oh-rsd-miami-valley-ctc-2026','Charles Brads', null,'coordinator',
  'cbrads@mvctc.com', null, null, true,
  'https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf','verified', null),
 ('oh-rsd-ohio-northern-2026','Dr. Jamie Siders', null,'coordinator',
  'j-siders@onu.edu', null, null, true,
  'https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf','verified', null),
 ('oh-rsd-ohio-university-2026','Dr. Natalie Kruse', null,'coordinator',
  'krusen@ohio.edu', null, null, true,
  'https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf','verified', null),
 ('oh-rsd-cincinnati-2026','Dr. Ted Fowler', null,'coordinator',
  'ucscifar@ucmail.uc.edu', null, null, true,
  'https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf','verified', null),
 ('oh-rsd-rio-grande-2026','Dr. John Means', null,'coordinator',
  'jmeans@rio.edu', null, null, true,
  'https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf','verified', null),
 ('oh-rsd-toledo-2026','Rita Yunker', null,'coordinator',
  'NSM@utoledo.edu', null, null, true,
  'https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf','verified', null),

 -- Tennessee
 ('tn-sasef-2027', null,'SASEF office','general',
  null,'865-974-9493','209 Student Services Building, Knoxville, TN 37996', true,
  'https://sasef.utk.edu/','verified',
  'The site publishes its address behind an email obfuscator. Retrieve the address from the live page before the first send.'),
 ('tn-mtsef-2027', null,'MTSEF general inquiries','general',
  'info@mtsef.org','615-460-6221', null, true,
  'https://www.mtsef.org/','verified', null),
 ('tn-cumberland-plateau-2026','Christina Hatley', null,'coordinator',
  'chatley@tntech.edu','931-372-6531',
  'Tennessee Tech University, 1150 McGee Blvd, Cookeville, TN 38505', true,
  'https://www.tntech.edu/education/stem/scifair.php','verified', null),
 ('tn-chattanooga-crsef', null,'UTC STEM Education Department','general',
  null,'423-425-2164','Hunter Hall 107A, Dept 4154, 651 McCallie Ave, Chattanooga, TN 37403', true,
  'https://www.utc.edu/health-education-and-professional-studies/stem-education/science-fair','verified', null),

 -- Michigan
 ('mi-sefmd-2026','Kathy Kitzmann','Fair Co-Director','director',
  'SF2026@sefmd.org','248-471-9900', null, true,
  'https://www.sefmd.org/Forms/2026-Forms/2025-2026%20Newsletter-Rev%20B.pdf','verified',
  'Shared fair inbox. The address is cycle-numbered and will likely change for 2027.'),
 ('mi-sefmd-2026','Tim Fino','Fair Co-Director','director',
  'SF2026@sefmd.org','248-471-9900', null, false,
  'https://www.sefmd.org/Forms/2026-Forms/2025-2026%20Newsletter-Rev%20B.pdf','verified', null),

 -- California
 ('ca-csef-state', null,'CSEF general inquiries','general',
  'CSEF@usc.edu', null, null, true,
  'https://csef.usc.edu/','lead',
  'Address published on a site that has not been refreshed since the 2024 cycle. Confirm it still routes before a campaign.'),
 ('ca-gsdsef-2026', null,'GSDSEF mailing address','general',
  null, null,'P.O. Box 15547, San Diego, CA 92175', true,
  'https://gsdsef.org/','verified',
  'The fair takes inquiries through a web form rather than a published address.'),
 ('ca-synopsys-scvsefa-2027', null,'SCVSEFA mailing address','general',
  null, null,'P.O. Box 307, Los Altos, CA 94023', true,
  'https://science-fair.org/','verified',
  'Contact form at science-fair.org/scvsefa/contact2/.'),
 ('ca-sacramento-stem-fair-2027', null,'Sacramento Regional STEM Fair office','general',
  'sacstemfair@sacstemfair.org','916-441-3150', null, true,
  'https://sacstemfair.org/stem-fair/','verified', null),
 ('ca-riverside-2027','Yadira Chavelas','Administrator','coordinator',
  'ychavelas@rcoe.us','951-826-6570', null, true,
  'https://www.rcoe.us/about-us/superintendent/office-of-the-superintendent/community-engagement-and-partnerships/student-events/science-and-engineering-fair/','verified', null),
 ('ca-riverside-2027','Jonathan Moreno','Digital Marketing Communications Manager','media',
  'jmoreno@rcoe.us','951-826-6667', null, false,
  'https://www.rcoe.us/about-us/superintendent/office-of-the-superintendent/community-engagement-and-partnerships/student-events/science-and-engineering-fair/','verified', null),
 ('ca-riverside-2027','Alyssa Juarez','Events Technician','events',
  'ajuarez@rcoe.us','951-826-6613', null, false,
  'https://www.rcoe.us/about-us/superintendent/office-of-the-superintendent/community-engagement-and-partnerships/student-events/science-and-engineering-fair/','verified', null),
 ('ca-riverside-2027','Madelynn Knust','Events Technician','events',
  'mknust@rcoe.us','951-826-6376', null, false,
  'https://www.rcoe.us/about-us/superintendent/office-of-the-superintendent/community-engagement-and-partnerships/student-events/science-and-engineering-fair/','verified', null)
) as v(slug, full_name, title, contact_role, email, phone, mailing_address,
       is_primary, source_url, verification_status, notes)
join public.fair_events f on f.slug = v.slug
where not exists (
  select 1 from public.fair_contacts c
  where c.fair_id = f.id and coalesce(c.email::text,'') = coalesce(v.email,'')
    and coalesce(c.full_name,'') = coalesce(v.full_name,'')
);

-- ---------------------------------------------------------------------
-- DEADLINES
-- ---------------------------------------------------------------------

insert into public.fair_deadlines (fair_id, label, due_date, due_time, audience, source_url)
select f.id, v.label, v.due_date::date, v.due_time::time, v.audience, v.source_url
from (values
 ('oh-buckeye-sef-2026','Project submissions close','2026-02-04','17:00','student','https://www.ohiosci.org/bsef/'),
 ('oh-rsd-ashland-2026','Regional Science Day payment deadline','2026-03-03','17:00','school','https://www.ohiosci.org/wp-content/uploads/sites/2/2025/10/2026-RSD-Payment-information-details.pdf'),
 ('tn-sasef-2027','Teacher and student registration opens','2026-09-01', null,'teacher','https://sasef.utk.edu/'),
 ('tn-mtsef-2027','Registration opens','2026-08-15', null,'student','https://www.mtsef.org/'),
 ('tn-mtsef-2027','Registration closes','2026-12-04', null,'student','https://www.mtsef.org/'),
 ('tn-cumberland-plateau-2026','Online registration deadline','2026-04-19','23:59','student','https://www.tntech.edu/education/stem/scifair.php'),
 ('mi-sefmd-2026','All entries due online','2026-02-20', null,'school','https://www.sefmd.org/Forms/2026-Forms/2025-2026%20Newsletter-Rev%20B.pdf'),
 ('ca-riverside-2027','Program launch','2026-08-17', null,'teacher','https://www.rcoe.us/about-us/superintendent/office-of-the-superintendent/community-engagement-and-partnerships/student-events/science-and-engineering-fair/'),
 ('ca-riverside-2027','Intent to Participate form due','2026-09-02', null,'school','https://www.rcoe.us/about-us/superintendent/office-of-the-superintendent/community-engagement-and-partnerships/student-events/science-and-engineering-fair/'),
 ('ca-riverside-2027','Registration materials due','2027-02-01', null,'student','https://www.rcoe.us/about-us/superintendent/office-of-the-superintendent/community-engagement-and-partnerships/student-events/science-and-engineering-fair/'),
 ('ca-riverside-2027','Projects due in zFairs','2027-02-08', null,'student','https://www.rcoe.us/about-us/superintendent/office-of-the-superintendent/community-engagement-and-partnerships/student-events/science-and-engineering-fair/'),
 ('ca-synopsys-scvsefa-2027','Application opens','2026-09-28', null,'student','https://science-fair.org/'),
 ('ca-synopsys-scvsefa-2027','SRC and IRB pre-approval deadline','2026-11-13', null,'student','https://science-fair.org/'),
 ('ca-synopsys-scvsefa-2027','Category judge registration opens','2026-12-01', null,'judge','https://science-fair.org/'),
 ('ca-synopsys-scvsefa-2027','Final application deadline for new participants','2027-01-08', null,'student','https://science-fair.org/'),
 ('ca-synopsys-scvsefa-2027','Abstract upload deadline','2027-02-20','20:00','student','https://science-fair.org/'),
 ('ca-gsdsef-2026','Student registration opens','2026-01-02', null,'student','https://gsdsef.org/'),
 ('ca-gsdsef-2026','Application payments due','2026-03-12', null,'school','https://gsdsef.org/')
) as v(slug, label, due_date, due_time, audience, source_url)
join public.fair_events f on f.slug = v.slug
where not exists (
  select 1 from public.fair_deadlines d
  where d.fair_id = f.id and d.label = v.label and d.due_date = v.due_date::date
);

-- ---------------------------------------------------------------------
-- ADVANCEMENT LINKS
-- ---------------------------------------------------------------------

update public.fair_events r
set advances_to_id = s.id
from public.fair_events s
where s.slug = 'oh-state-science-day-2026' and r.slug like 'oh-rsd-%';

update public.fair_events r
set advances_to_id = s.id
from public.fair_events s
where s.slug = 'mi-misef-state' and r.slug = 'mi-smsef-2026';

update public.fair_events r
set advances_to_id = s.id
from public.fair_events s
where s.slug = 'ca-csef-state'
  and r.slug in ('ca-lacsef-2026','ca-gsdsef-2026','ca-synopsys-scvsefa-2027',
                 'ca-acsef-2027','ca-sacramento-stem-fair-2027');

-- ---------------------------------------------------------------------
-- SCRAPER SOURCES
-- ---------------------------------------------------------------------

insert into public.fair_scrape_sources (label, url, state_code, fair_id, source_kind, parser_key)
select v.label, v.url, v.state_code, f.id, v.source_kind, v.parser_key
from (values
 ('Ohio Academy of Science regional science days','https://ssd.ohiosci.org/rsd/','OH','directory','oas_rsd'),
 ('Ohio State Science Day','https://ssd.ohiosci.org/','OH','fair_page','generic'),
 ('Buckeye Science and Engineering Fair','https://www.ohiosci.org/bsef/','OH','fair_page','generic'),
 ('SASEF Knoxville','https://sasef.utk.edu/','TN','fair_page','generic'),
 ('Middle Tennessee SEF','https://www.mtsef.org/','TN','fair_page','generic'),
 ('Cumberland Plateau RSEF','https://www.tntech.edu/education/stem/scifair.php','TN','fair_page','generic'),
 ('UTC Chattanooga science fair','https://www.utc.edu/health-education-and-professional-studies/stem-education/science-fair','TN','fair_page','generic'),
 ('SEFMD','https://www.sefmd.org/','MI','fair_page','generic'),
 ('Southwest Michigan SEF','https://sites.google.com/KAMSC.org/SMSEF','MI','fair_page','generic'),
 ('Michigan SEF on zFairs','https://misef.zfairs.com/','MI','fair_page','zfairs'),
 ('Eastern UP ISD science fair','https://www.eupschools.org/page/sci-eng-fair','MI','fair_page','generic'),
 ('California SEF','https://csef.usc.edu/','CA','fair_page','generic'),
 ('LACSEF','https://www.lacsef.org/','CA','fair_page','generic'),
 ('Greater San Diego SEF','https://www.gsdsef.org/','CA','fair_page','generic'),
 ('Synopsys Championship','https://science-fair.org/','CA','fair_page','generic'),
 ('Alameda County SEF','https://www.acsef.org/','CA','fair_page','generic'),
 ('Riverside County SEF','https://www.rcoe.us/about-us/superintendent/office-of-the-superintendent/community-engagement-and-partnerships/student-events/science-and-engineering-fair/','CA','fair_page','generic'),
 ('Sacramento Regional STEM Fair','https://sacstemfair.org/stem-fair/','CA','fair_page','generic'),
 ('Orange County SEF','https://www.ocsef.org/','CA','fair_page','generic'),
 ('Society for Science Find a Fair','https://findafair.societyforscience.org/',null,'directory','find_a_fair')
) as v(label, url, state_code, source_kind, parser_key)
left join lateral (
  select fe.id from public.fair_events fe
  where fe.website_url = v.url
  order by fe.created_at, fe.slug
  limit 1
) f on true
where not exists (select 1 from public.fair_scrape_sources s where s.url = v.url);

-- ---------------------------------------------------------------------
-- FAIR PLAN TASK TEMPLATE (school-level fair)
-- ---------------------------------------------------------------------

insert into public.fair_plan_task_templates (level, phase, title, description, months_before, resource_key, sort_order)
select 'school', v.phase, v.title, v.description, v.months_before, v.resource_key, v.sort_order
from (values
 ('Approval','Get written approval from the principal','Bring the one-page proposal with cost range, time commitment, and the pathway to the regional fair.',9,'administrator-proposal-template.docx',10),
 ('Approval','Reserve the space and the date','Gym, cafeteria, or library. Check the athletic and testing calendars first. Pick a date at least six weeks before your regional fair deadline.',9,null,20),
 ('Approval','Set the budget','Trophies, printing, registration fees, refreshments, board materials, judge thank-you gifts.',8,'budget-template.xlsx',30),
 ('Recruitment','Name a teacher liaison','A fair manager who is not a teacher needs one staff member inside the building for room access, announcements, and student communication.',8,null,40),
 ('Recruitment','Send the parent introduction letter','Explain the timeline, what students do, and how parents help without doing the work.',7,'parent-introduction-letter.docx',50),
 ('Recruitment','Open student sign-ups',null,6,null,60),
 ('Judging','Request judges through FairGame','Filter the judge database by county and expertise. Plan on one judge for every four to six projects.',5,null,70),
 ('Judging','Contact local employers and colleges','Hospitals, utilities, engineering firms, community colleges, and university departments.',5,'judge-recruitment-email-template.docx',80),
 ('Judging','Confirm the judge count against the project count','Recount once student registrations close and fill the gap.',2,null,90),
 ('Sponsorship','Send sponsorship letters','Local businesses, the parent teacher organization, and service clubs.',5,'sponsorship-outreach-letter.docx',100),
 ('Student support','Collect project proposals','Title, hypothesis, variables, control, safety review, materials.',4,'project-proposal-form.pdf',110),
 ('Student support','Run the safety and ethics review','Anything with human subjects, vertebrate animals, or hazardous material needs sign-off before experimentation begins.',4,null,120),
 ('Student support','Collect permission and photo release slips',null,3,'parent-permission-slip.docx',130),
 ('Logistics','Order awards and printing','Certificates, medals, ribbons, signage, and the program.',2,null,140),
 ('Logistics','Build the floor plan and table map','Number every project space. Group by category so judges walk a short route.',1,null,150),
 ('Logistics','Send judges their packet','Score cards, category assignments, arrival time, parking, and a campus map.',1,'judge-training-manual.pdf',160),
 ('Event','Run the day-of checklist','Setup, judge check-in, student registration, judging rounds, tabulation, awards, cleanup.',0,'day-of-event-checklist.pdf',170),
 ('Follow-up','Send judge thank-you letters','Include volunteer hours so judges can log them with their employer.',0,'judge-thank-you-letter.docx',180),
 ('Follow-up','Register advancing students for the regional fair','Check the regional deadline the week the school fair ends.',0,null,190),
 ('Follow-up','Run the post-event survey','Students and staff. Feeds next year and any grant report.',0,'post-event-survey-template.docx',200)
) as v(phase, title, description, months_before, resource_key, sort_order)
where not exists (
  select 1 from public.fair_plan_task_templates t
  where t.level = 'school' and t.title = v.title
);

-- =====================================================================
-- END MIGRATION 02
-- =====================================================================
