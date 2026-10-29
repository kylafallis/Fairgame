/* ── Demo data ── */
const DEMO = {
  approvals: [
    { id:'a1', name:'Ms. Williams', email:'mwilliams@bath.edu', school:'Bath High School', type:'teacher',    status:'pending',  created_at:'2026-03-10T10:00:00Z',
      data:{ district_website:'https://www.bathschools.org', source:'signup_form' } },
    { id:'a2', name:'Priya Sharma', email:'priya@walnut.edu',  school:'Walnut Hills HS',  type:'ambassador', status:'interest', created_at:'2026-03-12T14:30:00Z',
      data:{ source:'signup_form' } },
    { id:'a3', name:'Mr. Davis',    email:'tdavis@lima.edu',   school:'Lima Senior HS',   type:'teacher',    status:'active',   created_at:'2026-03-01T09:00:00Z',
      data:{ district_website:'https://www.limacityschools.org', source:'signup_form' } },
    { id:'a4', name:'Jordan Lee',   email:'jordan@school.edu', school:'Sacramento High School', type:'student_mentor_request', status:'pending', created_at:'2026-03-14T16:00:00Z',
      data:{ grade:'11th', state:'Sacramento, CA', format:'Virtual only', title:'Low-cost water quality biosensor',
             desc:'I want to build a nitrate sensor cheap enough for a school to hand out, and test it against the creek behind our campus.',
             help:'Experimental design', topics:['Environmental Science','Chemistry / Biochemistry'], source:'mentor_request_form' } },
    { id:'a5', name:'Dr. Sarah Chen', email:'schen@example.com', school:'Ohio State University', type:'mentor',      status:'active',   created_at:'2026-02-18T11:00:00Z',
      data:{ role:'Research Scientist', field:'Environmental Engineering', linkedin:'https://www.linkedin.com/in/sarahchen',
             hours:'3 to 4 hours', format:'Either works',
             bio:'Fifteen years in water quality monitoring. I mentored two ISEF finalists at my last post and would like to keep doing it.',
             source:'volunteer_form' } },
    { id:'a6', name:'Alex Rivera',   email:'alex@school.edu',   school:'Bath High School',  type:'student_mentor_request', status:'active', created_at:'2026-02-20T13:00:00Z',
      data:{ grade:'10th', state:'Columbus, OH', format:'Either works', title:'Soil pH and crop yield',
             desc:'Testing whether lime treatment changes radish yield in three plots at the school garden.',
             help:'Data analysis', topics:['Biology / Life Sciences'], source:'mentor_request_form' } },
  ],
  schools: [
    { school_name:'Bath High School',    teacher_name:'Ms. Williams', program_type:'School fair only', fair_date:'2026-03-14', student_count:35, county:'Allen County',    status:'planning' },
    { school_name:'Lima Senior HS',      teacher_name:'Mr. Davis',    program_type:'OAS District fair', fair_date:'2026-03-21', student_count:55, county:'Allen County',    status:'active'   },
    { school_name:'Linden-McKinley STEM',teacher_name:'Mr. Jones',    program_type:'Club Launch',       fair_date:null,        student_count:20, county:'Franklin County', status:'planning' },
  ],
  judges: [
    { id:'j1', virtual_ok:true, preferred_grade_bands:['middle','high'], available_months:['Feb','Mar'], heard_about:'My university', conduct_agreed_at:'2026-02-02T10:00:00Z', background_check_status:'cleared', background_check_date:'2026-02-10', code:'EN-163-7X', name:'Dr. Robert Davis', email:'rdavis@example.com', org:'Ohio Northern University', expertise:['Environmental Science'], city:'Lima', state_code:'OH', postal_code:'45801', latitude:40.7426, longitude:-84.1052, geocode_source:'fg_zip', travel_miles:40, available_level:'Any level', status:'active', created_at:'2026-02-02T10:00:00Z' },
    { id:'j2', code:'BI-163-K2', name:'Dr. Laura Chen', email:'lchen@example.com', org:'Allen County Health', expertise:['Biology / Life Sciences'], city:'Lima, Allen County', state_code:'OH', travel_miles:20, available_level:'School fair', status:'unverified', notes:'Weekends only.', created_at:'2026-10-27T14:00:00Z' },
    { id:'j3', code:'CH-489-Q5', name:'Mark Thompson', email:'mthompson@example.com', org:'Procter & Gamble', expertise:['Chemistry / Biochemistry'], city:'Columbus, Franklin County', state_code:'OH', travel_miles:30, available_level:'District fair', status:'active', created_at:'2026-01-15T09:00:00Z' },
    { id:'j4', referred_by:'EN-163-7X', signup_source:'GA-ACS', heard_about:'A friend or colleague', preferred_grade_bands:['high'], virtual_ok:true, linkedin:'https://www.linkedin.com/in/aaliyahbrooks', conduct_agreed_at:'2026-10-28T16:20:00Z', confirmation_sent_at:'2026-10-28T16:21:00Z', name:'Dr. Aaliyah Brooks', email:'abrooks@example.com', org:'Georgia Tech', expertise:['Physics / Engineering','Computer Science / Math'], city:'Atlanta', state_code:'GA', postal_code:'30332', latitude:33.7756, longitude:-84.3963, geocode_source:'fg_zip', travel_miles:60, available_level:'Any level', status:'unverified', notes:'Happy to judge virtually too.', created_at:'2026-10-28T16:20:00Z' },
    { id:'j5', name:'Carlos Mendoza', email:'cmendoza@example.com', org:'Intel', expertise:['Computer Science / Math'], city:'Phoenix', state_code:'AZ', latitude:33.4484, longitude:-112.074, geocode_source:'fg_city', travel_miles:100, available_level:'State fair', status:'active', created_at:'2026-09-30T11:00:00Z' },
    { id:'j6', signup_source:'MN-MAYO', heard_about:'My employer or professional society', preferred_grade_bands:['elementary','middle','high'], available_months:['Jan','Feb','Mar','Apr'], work_email:'olsen.hannah@mayo.edu', conduct_agreed_at:'2026-10-29T08:05:00Z', name:'Dr. Hannah Olsen', email:'holsen@example.com', org:'Mayo Clinic', expertise:['Medicine / Health Sciences','Biology / Life Sciences'], city:'Rochester', state_code:'MN', postal_code:'55905', latitude:44.0225, longitude:-92.4668, geocode_source:'fg_zip', travel_miles:9999, travel_range:'statewide', available_level:'Any level', status:'unverified', created_at:'2026-10-29T08:05:00Z' },
    { id:'j7', referred_by:'EN-163-7X', signup_source:'MT-RTA', heard_about:'A teacher or school', virtual_ok:true, name:'James Whitfield', email:'jwhitfield@example.com', org:'Retired teacher', expertise:['Environmental Science'], city:null, state_code:'MT', latitude:46.6, longitude:-110.0, geocode_source:'fg_state', travel_miles:100, available_level:'School fair', status:'unverified', created_at:'2026-10-26T19:40:00Z' },
    { id:'j8', name:'Priya Natarajan', email:'pnatarajan@example.com', org:'UC Berkeley', expertise:['Chemistry / Biochemistry'], city:'Berkeley', state_code:'CA', postal_code:'94720', latitude:37.8719, longitude:-122.2585, geocode_source:'fg_zip', travel_miles:40, available_level:'District fair', status:'active', created_at:'2026-08-12T13:00:00Z' },
    { id:'j9', name:'Samuel Okafor', email:'sokafor@example.com', org:'Texas Instruments', expertise:['Physics / Engineering'], city:'Dallas', state_code:'TX', latitude:32.7767, longitude:-96.797, geocode_source:'fg_city', travel_miles:60, available_level:'Any level', status:'inactive', created_at:'2026-05-03T10:00:00Z' },
    { id:'j11', name:'Dr. Hannah Olsen', email:'HOlsen@example.com ', org:'Mayo Clinic', expertise:['Medicine / Health Sciences'], city:'Rochester', state_code:'MN', travel_miles:40, available_level:'Any level', status:'unverified', created_at:'2026-10-29T08:01:00Z' },
    { id:'j10', name:'Dr. Emily Tran', email:'etran@example.com', org:'University of Toronto', expertise:['Biology / Life Sciences'], country:'CA', city:'Toronto', state_code:'ON', postal_code:'M5S', latitude:43.6629, longitude:-79.3957, geocode_source:'fg_zip', travel_miles:30, available_level:'Any level', status:'unverified', created_at:'2026-10-25T12:00:00Z' },
  ],
  mentors: [
    { student_name:'Rishi Pampati',  mentor_name:'Kyla Fallis',    school:'Walnut Hills HS',      topic:'Biosensors', total_hours:6.5, session_count:4, status:'active' },
    { student_name:'Aisha Williams', mentor_name:'Dr. Sarah Chen', school:'Linden-McKinley STEM', topic:'ML in water quality', total_hours:3.0, session_count:2, status:'active' },
  ],
};

let allApprovals = [], approvalFilter = 'pending', allJudgesForMatch = [];
const PENDING_STATUSES = ['pending', 'interest'];

/* ── Welcome emails sent on approval ──────────────────────────────
   No mail server behind this page, so approving opens a pre-filled message
   in whatever mail client this machine uses. Edit the copy here. */
const PORTAL_URL = 'https://fairgameinitiative.org/login.html';
const APPROVAL_SIGNOFF = 'Kyla Fallis\nFairGame Initiative\nfairgameinitiative@outlook.com';

function firstName(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'there';
  // Teachers usually sign up as "Ms. Williams" - keep the title with the surname.
  if (/^(mr|mrs|ms|miss|mx|dr|prof|professor)\.?$/i.test(parts[0])) {
    return parts.length === 1 ? 'there' : parts[0] + ' ' + parts[parts.length - 1];
  }
  return parts[0];
}

function approvalEmailFor(type, name, extra = {}) {
  const hi = 'Hi ' + firstName(name) + ',\n\n';

  if (type === 'teacher') {
    return {
      subject: 'Your FairGame Teacher Portal access is approved',
      body: hi +
        'Your teacher account is approved. You can sign in now at\n' + PORTAL_URL + '\n\n' +
        'Inside the Teacher Portal you will find the student worksheet pack, the four grading rubrics, the grade-band timelines, the standards alignment map, and the judge request form. All of it is ready to use as it is.\n\n' +
        'If your email address is not confirmed yet, click the link in the confirmation message from FairGame first, then sign in.\n\n' +
        'Send me your fair date and a rough student count and I will help you work backward from the OAS registration deadline.\n\n' +
        'Glad to have you in this.\n\n' + APPROVAL_SIGNOFF
    };
  }

  if (type === 'ambassador') {
    return {
      subject: 'Your FairGame Ambassador Portal access is approved',
      body: hi +
        'Your Student Ambassador account is approved. Sign in at\n' + PORTAL_URL + '\n\n' +
        'The Ambassador Portal has the club launch kit, the pitch deck for your principal, and your hour log. Start with the launch kit - it walks through your first three meetings.\n\n' +
        'Tell me which school you are starting at and I will connect you with a mentor.\n\n' + APPROVAL_SIGNOFF
    };
  }

  if (type === 'mentor') {
    return {
      subject: 'Your FairGame mentor application is approved',
      body: hi +
        'Great news - your FairGame mentor application has been approved.\n\n' +
        'Here is what happens next. Being approved means you are cleared to be matched; it does not connect you to a student yet. When we find a student whose project fits your background, we will introduce you by email and open a mentoring channel for the two of you inside the FairGame portal.\n\n' +
        'Two things to know before that first message:\n' +
        '  - All mentoring conversation happens inside the portal, never over personal email, phone, or social media. This protects you as much as it protects the student.\n' +
        '  - Every message is visible to FairGame staff and to the student\u2019s teacher. Nothing you send is private, and nothing you receive is either.\n\n' +
        'Sign in any time at\n' + PORTAL_URL + '\n\n' +
        'Thank you for giving back. We are so glad to have you.\n\n' + APPROVAL_SIGNOFF
    };
  }

  if (type === 'judge') {
    return {
      subject: 'You are approved as a FairGame judge',
      body: hi +
        'Your judge application is approved - thank you for volunteering. Sign in at\n' + PORTAL_URL + '\n' +
        'with this email address and the password you chose when you applied. If it does not come to mind, use "Email me a sign-in code" on that page instead.\n\n' +
        'In the Judge Portal you can keep your profile and travel distance up to date, and accept or decline requests from fairs near you.\n\n' +
        'Before your first fair, the welcome guide and code of conduct are worth ten minutes:\n' +
        'https://fairgameinitiative.org/files/judges/fairgame-judge-welcome-guide.pdf\n' +
        'https://fairgameinitiative.org/files/judges/fairgame-judge-code-of-conduct.pdf\n\n' +
        'Know someone who would make a good judge? Send them your own link - everyone who applies through it is credited to you:\n' +
        (extra.code ? 'https://fairgameinitiative.org/volunteer.html?ref=' + encodeURIComponent(extra.code) + '#judge'
                    : 'https://fairgameinitiative.org/volunteer.html (your personal link is on your portal profile page)') + '\n\n' +
        APPROVAL_SIGNOFF
    };
  }

  if (type === 'judge_update') {
    return {
      subject: 'A note from FairGame for our judges',
      body: hi + '\n\n' + APPROVAL_SIGNOFF
    };
  }

  if (type === 'student_mentor_request') {
    return {
      subject: 'FairGame: your mentor request has been reviewed',
      body: hi +
        "We've reviewed your mentor request and are matching you with a mentor whose background fits your project. " +
        "You'll hear from us directly with an introduction shortly.\n\n" +
        'In the meantime, feel free to keep working - the Research Guide has tips on experimental design and building your display board:\n' +
        'https://fairgameinitiative.org/researchguide.html\n\n' + APPROVAL_SIGNOFF
    };
  }

  return {
    subject: 'Your FairGame portal access is approved',
    body: hi + 'Your FairGame account is approved. You can sign in at\n' + PORTAL_URL + '\n\n' + APPROVAL_SIGNOFF
  };
}

function buildMailto(email, type, name, extra) {
  const m = approvalEmailFor(type, name, extra);
  return 'mailto:' + encodeURIComponent(email) +
         '?subject=' + encodeURIComponent(m.subject) +
         '&body='    + encodeURIComponent(m.body);
}

function openMailto(url) {
  try {
    const a = document.createElement('a');
    a.href = url; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    return true;
  } catch (_) { return false; }
}

/* Results go to a toast in the corner rather than the strip at the top
   of the section, which was out of sight after approving row 40. */
function approvalMsg(html, type) {
  fgToast(html, type || 'ok');
}

/* Escapes user-submitted text before it goes into the admin tables. */
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

requireAuth('admin', () => {
  loadAllData();
  onSectionLoad('activity',  loadActivity);
  onSectionLoad('approvals', loadApprovals);
  onSectionLoad('schools',   loadSchools);
  onSectionLoad('judges',    loadJudges);
  onSectionLoad('judgemap',  loadJudgeMap);
  onSectionLoad('mentors',   loadMentors);
  onSectionLoad('review',    loadReviewQueue);
  onSectionLoad('convos',    loadConvos);
  refreshReviewBadge();
  onSectionLoad('settings',  loadStats);
});

async function loadAllData() {
  if (!sb) {
    document.getElementById('kSchools').textContent    = DEMO.schools.filter(s=>s.status==='active').length;
    document.getElementById('kPending').textContent    = DEMO.approvals.filter(a=>a.status==='pending').length;
    document.getElementById('kJudges').textContent     = DEMO.judges.filter(j=>j.status==='active').length;
    document.getElementById('kJudgesPending').textContent = DEMO.judges.filter(j=>j.status==='unverified').length;
    const jp = DEMO.judges.filter(j=>j.status==='unverified').length, jb = document.getElementById('judgeBadge');
    if (jb) { jb.textContent = jp; jb.style.display = jp ? 'inline-block' : 'none'; }
    document.getElementById('kMentors').textContent    = DEMO.mentors.length;
    document.getElementById('kDownloads').textContent  = '425';
    document.getElementById('kSubscribers').textContent= '94';
    document.getElementById('kPortal').textContent     = '72';
    document.getElementById('kJudgeReqs').textContent  = '23';
    const p = DEMO.approvals.filter(a=>a.status==='pending').length;
    if (p > 0) setAlert(`${p} pending approval${p>1?'s':''} need your review.`, 'approvals');
  } else {
    const [{ count:schools },{ count:pending },{ count:judges },{ count:mentors },{ count:downloads },{ count:subscribers },{ count:portal },{ count:judgeReqs }] = await Promise.all([
      sb.from('fairs').select('id',{count:'exact',head:true}).eq('status','active'),
      sb.from('portal_requests').select('id',{count:'exact',head:true}).eq('status','pending'),
      sb.from('judges').select('id',{count:'exact',head:true}).eq('status','active'),
      sb.from('mentorships').select('id',{count:'exact',head:true}).eq('status','active'),
      sb.from('resource_downloads').select('id',{count:'exact',head:true}),
      sb.from('email_subscribers').select('id',{count:'exact',head:true}),
      sb.from('portal_requests').select('id',{count:'exact',head:true}).eq('status','active'),
      sb.from('judge_requests').select('id',{count:'exact',head:true}),
    ]);
    document.getElementById('kSchools').textContent    = schools||0;
    document.getElementById('kPending').textContent    = pending||0;
    document.getElementById('kJudges').textContent     = judges||0;
    document.getElementById('kMentors').textContent    = mentors||0;
    document.getElementById('kDownloads').textContent  = downloads||0;
    document.getElementById('kSubscribers').textContent= subscribers||0;
    document.getElementById('kPortal').textContent     = portal||0;
    document.getElementById('kJudgeReqs').textContent  = judgeReqs||0;
    refreshJudgeBadge();
    const p = pending||0;
    const badge = document.getElementById('approvalBadge');
    if (p > 0) { badge.textContent = p; badge.style.display = 'inline-block'; setAlert(`${p} pending approval${p>1?'s':''}.`, 'approvals'); }
  }
}

async function refreshJudgeBadge() {
  if (!sb) return;
  const { count, error } = await sb.from('judges').select('id', { count: 'exact', head: true }).eq('status', 'unverified');
  const badge = document.getElementById('judgeBadge');
  if (error || !badge) return;
  badge.textContent = count || 0;
  badge.style.display = count ? 'inline-block' : 'none';
  const k = document.getElementById('kJudgesPending');
  if (k) k.textContent = count || 0;
}

function setAlert(text, section) {
  document.getElementById('alertArea').innerHTML = `<div class="alert-banner"><span>${text}</span><button class="btn-xs" onclick="showSection('${section}',document.querySelector('[data-section=${section}]'))">Review →</button></div>`;
}

async function loadActivity() {
  if (!sb) { fgEmpty('activityFeed', 'Connect Supabase to see live activity.'); return; }
  return fgLoad('activityFeed',
    async () => fgRows(await sb.from('events').select('*').order('ts',{ascending:false}).limit(40)),
    renderActivity,
    { empty: 'No activity yet - check back later.' });
}

function renderActivity(data) {
  const feed = document.getElementById('activityFeed');
  const COLORS = { page_view:'var(--gray-100)', quiz_complete:'var(--g100)', judge_request:'#e0f2fe', portal_request:'#fef3c7', contact_form:'var(--g50)' };
  feed.innerHTML = data.map(e => `
    <div class="activity-item">
      <div class="act-date">${new Date(e.ts).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</div>
      <div class="act-body">${e.event}${e.data?.page?' · '+e.data.page:''}${e.data?.role?' · '+e.data.role:''}</div>
      <span style="font-size:.62rem;font-weight:600;padding:2px 7px;background:${COLORS[e.event]||'var(--gray-100)'};color:var(--gray-700);white-space:nowrap;">${e.event.replace(/_/g,' ')}</span>
    </div>`).join('');
}

async function loadApprovals() {
  if (sb) {
    const [reqs, judges] = await Promise.all([
      sb.from('portal_requests').select('*').order('created_at',{ascending:false}),
      sb.from('judges').select('name,email,expertise,status'),
    ]);
    // A failed read must not read as "no requests" - that would hide a
    // pending student behind an empty table.
    try {
      allApprovals      = fgRows(reqs);
      allJudgesForMatch = fgRows(judges).filter(j => j.status !== 'inactive');
    } catch (e) {
      console.warn('[Admin] approvals read failed:', e.message);
      fgError('approvalsTbody', loadApprovals);
      return;
    }
  } else {
    allApprovals = DEMO.approvals;
    allJudgesForMatch = DEMO.judges;
  }
  renderApprovals();
}

/* Suggests mentors/judges whose expertise or STEM field overlaps a student's requested topics. */
function matchMentorsForTopics(topics) {
  if (!topics?.length) return [];
  const wanted = topics.map(t => t.toLowerCase());
  const overlaps = (text) => wanted.some(t => text.toLowerCase().includes(t.split(' / ')[0].toLowerCase()));

  const fromJudges = allJudgesForMatch
    .filter(j => (j.expertise || []).some(e => wanted.includes(e)))
    .map(j => ({ name: j.name, email: j.email, source: 'judge' }));

  const fromMentors = allApprovals
    .filter(a => a.type === 'mentor' && a.status === 'active' && overlaps(a.data?.field || ''))
    .map(a => ({ name: a.name, email: a.email, source: 'mentor' }));

  const seen = new Set();
  return [...fromJudges, ...fromMentors].filter(m => {
    const key = (m.email || m.name).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function filterApp(type, btn) {
  approvalFilter = type;
  document.querySelectorAll('[onclick^="filterApp"]').forEach(b => b.style.fontWeight = '400');
  btn.style.fontWeight = '700';
  renderApprovals();
}
window.filterApp = filterApp;
function renderApprovals() {
  const f = approvalFilter === 'pending'
    ? allApprovals.filter(a => PENDING_STATUSES.includes(a.status))
    : allApprovals.filter(a => a.type === approvalFilter && !PENDING_STATUSES.includes(a.status));
  const emptyMsg = approvalFilter === 'pending'
    ? 'No pending requests right now - check back later.'
    : 'No history yet for this type - check back later.';
  document.getElementById('approvalsTbody').innerHTML = !f.length
    ? `<tr><td colspan="7"><div class="empty-state"><p>${emptyMsg}</p></div></td></tr>`
    : f.map(a => {
        const row = `<tr class="row-click" title="Open the full application" onclick="openPortfolio('${esc(a.id)}')">
        <td class="col-name">${esc(a.name)}</td>
        <td class="col-sm">${esc(a.email)}</td>
        <td class="col-sm">${a.school ? esc(a.school) : '<span style="color:var(--red);font-style:italic;">Not given</span>'}</td>
        <td><span class="chip chip-interest">${esc(a.type)}</span></td>
        <td class="col-sm">${new Date(a.created_at).toLocaleDateString()}</td>
        <td><span class="chip chip-${esc(a.status)}">${esc(a.status)}</span></td>
        <td style="white-space:nowrap;display:flex;gap:6px;" onclick="event.stopPropagation();">
          ${a.status==='pending'||a.status==='interest' ? `<button class="btn-xs approve" onclick="approveUser('${esc(a.id)}')">Approve</button>` : ''}
          <button class="btn-xs danger" onclick="rejectUser('${esc(a.id)}')">Reject</button>
        </td>
      </tr>`;
        if (a.type !== 'student_mentor_request') return row;

        const topics  = a.data?.topics || [];
        const matches = matchMentorsForTopics(topics);
        const pairUrl = `/mentorlog.html?student=${encodeURIComponent(a.name||'')}&email=${encodeURIComponent(a.email||'')}&school=${encodeURIComponent(a.school||'')}&topic=${encodeURIComponent(a.data?.title || topics.join(', '))}`;
        const detail = `<tr class="row-detail row-click" onclick="openPortfolio('${esc(a.id)}')">
        <td colspan="7" style="background:var(--g50,#f7faf7);padding:10px 16px;font-size:.8rem;color:var(--gray-600);">
          <strong>Topics:</strong> ${topics.map(esc).join(', ') || '–'}
          &nbsp;&middot;&nbsp;
          <strong>Suggested mentors:</strong> ${matches.length ? matches.map(m => esc(m.name) + (m.email ? ' ('+esc(m.email)+')' : '')).join(', ') : 'No overlap found yet - check the mentor list manually.'}
          &nbsp;&middot;&nbsp;
          <a href="${pairUrl}" class="btn-xs" style="text-decoration:none;" onclick="event.stopPropagation();">Create Pair in Mentor Log →</a>
        </td>
      </tr>`;
        return row + detail;
      }).join('');
}

/* -- The portfolio sheet ------------------------------------------
   The table has room for six columns; an application carries far more
   than that, and approving someone off a name and an email is how bad
   matches happen. Clicking a row opens everything that person actually
   submitted, with their LinkedIn and district site as live links so the
   check can be made before the Approve button is pressed. */

const PF_LABELS = {
  field: 'STEM field',         role: 'Role / title',      hours: 'Hours per month',
  format: 'Format preference', bio: 'Bio / background',   linkedin: 'LinkedIn profile',
  district_website: 'School district website',            school: 'School',
  grade: 'Grade',              state: 'City / State',     title: 'Project title',
  desc: 'Project description', help: 'Help needed most',  topics: 'Topics of interest',
  message: 'Message',          source: 'Submitted through',
};

/* Where the row came from, in words rather than a form id. */
const PF_SOURCES = {
  volunteer_form:      'Volunteer page - mentor application',
  mentor_request_form: 'Mentor request form',
  student_portal:      'Student portal',
  admin_on_behalf:     'Added by an admin',
  contact_form:        'Homepage contact form',
  signup_form:         'Account signup',
  google_signup:       'Account signup (Google)',
};

/* Read top to bottom the way the application was filled in. Anything not
   listed here still shows, alphabetically, after these - a field added to
   a form later must never go missing from the review. */
const PF_ORDER = ['role','field','linkedin','district_website','grade','state','format',
                  'hours','topics','title','desc','help','bio','message','source'];

/* Long-form answers read better stacked under their label. */
const PF_BLOCK = ['bio','desc','message','title'];

/* What each kind of application is supposed to carry. Listed fields are
   printed even when empty, so a gap shows up as a gap rather than simply
   not being there. */
const PF_EXPECTED = {
  mentor:                 ['role','field','linkedin','hours','format','bio'],
  teacher:                ['district_website'],
  student_mentor_request: ['grade','state','format','topics','title','desc','help'],
};

function pfLabel(key) {
  return PF_LABELS[key] || key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

function pfMissing(text) {
  return `<span class="pf-missing">${esc(text || 'Not provided')}</span>`;
}

/* Addresses become links - being able to open the LinkedIn or the
   district site from here is the whole reason for collecting them. */
function pfValueHTML(key, value) {
  if (Array.isArray(value)) return value.length ? value.map(esc).join(' &middot; ') : pfMissing();
  if (value == null || value === '') return pfMissing();
  if (typeof value === 'object') return esc(JSON.stringify(value));
  const str = String(value).trim();
  if (!str) return pfMissing();
  if (key === 'source') return esc(PF_SOURCES[str] || str);
  if (/^https?:\/\//i.test(str)) {
    return `<a href="${esc(str)}" target="_blank" rel="noopener noreferrer">${esc(str)}</a>`;
  }
  return esc(str);
}

function pfRow(key, value) {
  const block = PF_BLOCK.includes(key) || (typeof value === 'string' && value.length > 90);
  return `<div class="pf-row${block ? ' pf-row-block' : ''}">
    <div class="pf-key">${esc(pfLabel(key))}</div>
    <div class="pf-val${block ? ' pf-text' : ''}">${pfValueHTML(key, value)}</div>
  </div>`;
}

function pfPlainRow(label, valueHTML) {
  return `<div class="pf-row"><div class="pf-key">${esc(label)}</div><div class="pf-val">${valueHTML}</div></div>`;
}

function openPortfolio(id) {
  const a = allApprovals.find(r => String(r.id) === String(id));
  if (!a) return;
  const data = (a.data && typeof a.data === 'object') ? a.data : {};

  // The school has its own column on the row; printing data.school again
  // under Application would just be the same answer twice.
  const keys = new Set(Object.keys(data).filter(k => k !== 'school'));
  (PF_EXPECTED[a.type] || []).forEach(k => keys.add(k));

  const ordered = [...keys].sort((x, y) => {
    const ix = PF_ORDER.indexOf(x), iy = PF_ORDER.indexOf(y);
    return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy) || x.localeCompare(y);
  });

  const submitted = new Date(a.created_at);
  const waited    = Math.floor((Date.now() - submitted) / 86400000);
  const age       = waited <= 0 ? 'today' : waited + ' day' + (waited === 1 ? '' : 's') + ' ago';

  const parts = [`
    <div class="pf-head">
      <h3 style="margin:0;">${esc(a.name || 'No name given')}</h3>
      <div class="pf-chips">
        <span class="chip chip-interest">${esc(a.type)}</span>
        <span class="chip chip-${esc(a.status)}">${esc(a.status)}</span>
      </div>
    </div>
    <div class="pf-group">
      <div class="pf-group-title">Request</div>
      ${pfPlainRow('Email', a.email ? `<a href="mailto:${esc(a.email)}">${esc(a.email)}</a>` : pfMissing())}
      ${pfPlainRow('School', a.school ? esc(a.school) : pfMissing('Not given - ask before approving'))}
      ${pfPlainRow('Submitted', esc(submitted.toLocaleDateString() + ' - ' + age))}
    </div>
    <div class="pf-group">
      <div class="pf-group-title">Application</div>
      ${ordered.length ? ordered.map(k => pfRow(k, data[k])).join('')
                       : '<p class="pf-empty">Nothing else was submitted with this request.</p>'}
    </div>`];

  // A student request is only half a decision without the mentors it
  // could be filled by, so the matching work stays on the same sheet.
  if (a.type === 'student_mentor_request') {
    const matches = matchMentorsForTopics(data.topics || []);
    const pairUrl = `/mentorlog.html?student=${encodeURIComponent(a.name || '')}&email=${encodeURIComponent(a.email || '')}&school=${encodeURIComponent(a.school || '')}&topic=${encodeURIComponent(data.title || (data.topics || []).join(', '))}`;
    parts.push(`
    <div class="pf-group">
      <div class="pf-group-title">Matching</div>
      ${pfPlainRow('Suggested mentors', matches.length
          ? matches.map(m => esc(m.name) + (m.email ? ' (' + esc(m.email) + ')' : '')).join('<br/>')
          : '<span class="pf-empty">No overlap found yet - check the mentor list by hand.</span>')}
      <div style="margin-top:10px;">
        <a href="${pairUrl}" class="btn-xs" style="text-decoration:none;">Create Pair in Mentor Log &rarr;</a>
      </div>
    </div>`);
  }

  document.getElementById('portfolioBody').innerHTML = parts.join('');
  document.getElementById('portfolioActions').innerHTML = `
    <button class="btn-ghost" onclick="closeModal('portfolioModal')">Close</button>
    <button class="btn-xs danger" onclick="rejectUser('${esc(a.id)}')">Reject</button>
    ${PENDING_STATUSES.includes(a.status)
      ? `<button class="btn-primary" style="font-size:.8rem;padding:8px 14px;" onclick="approveUser('${esc(a.id)}')">Approve &rarr;</button>`
      : ''}`;
  openModal('portfolioModal');
}
window.openPortfolio = openPortfolio;

// Escape closes the sheet, the same as clicking outside it.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal('portfolioModal');
});

async function approveUser(id) {
  const rec = allApprovals.find(a => String(a.id) === String(id));
  if (!rec) return;
  const { email, type, name } = rec;
  const confirmMsg = type === 'student_mentor_request'
    ? `Mark ${email}'s mentor request as matched? This sends them a confirmation email.`
    : `Approve ${email} as ${type}? They will be able to sign in immediately.`;
  if (!confirm(confirmMsg)) return;
  closeModal('portfolioModal');

  if (sb) {
    const { error } = await sb.from('portal_requests').update({ status:'active' }).eq('id', id);
    if (error) {
      approvalMsg('Could not approve ' + esc(email) + ' - ' + esc(error.message), 'err');
      return;
    }
  }

  // Every approved role gets a welcome email.
  const mailto = buildMailto(email, type, name);
  openMailto(mailto);
  approvalMsg(
    'Approved <strong>' + esc(email) + '</strong>. A welcome email is open in your mail app - ' +
    'if nothing happened, <a href="' + mailto + '">open it here</a>.',
    'ok'
  );

  // Update the one record and redraw from memory - no re-fetch, so the
  // table does not blank out and the page stays where it was.
  rec.status = 'active';
  keepScroll(renderApprovals);
  loadAllData();
}

/* Runs a re-render without letting the page move. */
function keepScroll(fn) {
  const y = window.scrollY;
  fn();
  if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
}
async function rejectUser(id) {
  if (!confirm('Reject this request?')) return;
  closeModal('portfolioModal');
  if (sb) {
    const { error } = await sb.from('portal_requests').update({ status:'rejected' }).eq('id', id);
    if (error) { approvalMsg('Could not reject - ' + esc(error.message), 'err'); return; }
  }
  approvalMsg('Request rejected. No email was sent.', 'ok');
  const rec = allApprovals.find(a => String(a.id) === String(id));
  if (rec) rec.status = 'rejected';
  keepScroll(renderApprovals);
  loadAllData();
}
window.approveUser = approveUser; window.rejectUser = rejectUser;

async function loadSchools() {
  return fgLoad('schoolsTbody',
    async () => sb ? fgRows(await sb.from('fairs').select('*').order('created_at',{ascending:false})) : DEMO.schools,
    renderSchools,
    { empty: 'No schools registered yet - check back later.' });
}

function renderSchools(data) {
  document.getElementById('schoolsTbody').innerHTML = data.map(s => `<tr>
        <td class="col-name">${s.school_name}</td>
        <td class="col-sm">${s.teacher_name}</td>
        <td class="col-sm">${s.program_type||'–'}</td>
        <td class="col-sm">${s.fair_date||'TBD'}</td>
        <td class="col-sm">${s.student_count||'–'}</td>
        <td class="col-sm">${s.county||'–'}</td>
        <td><span class="chip chip-${s.status||'planning'}">${s.status||'planning'}</span></td>
      </tr>`).join('');
}

/* ══════════════════════════════════════════════════════════════════
   JUDGE NETWORK

   Built for hundreds of applications arriving at once from outreach in
   every state, not the dozen the old table was drawn for. Three rules:

   - Nothing an admin clicks moves the page. A status change rewrites
     that one row where it sits; the list is only re-filtered when the
     admin changes a filter. The old Verify button re-fetched the whole
     table behind a spinner, which is what kept snapping back to the top.
   - The queue opens on "Needs review", because that is the work.
   - Anything done to one judge can be done to a selection: activate,
     deactivate, or a BCC email.
   ══════════════════════════════════════════════════════════════════ */

const JUDGE_FIELDS = ['Biology / Life Sciences','Chemistry / Biochemistry','Physics / Engineering',
                      'Environmental Science','Computer Science / Math','Medicine / Health Sciences'];
const JUDGE_STATUS_LABEL = { unverified: 'Needs review', active: 'Active', inactive: 'Inactive' };
const JUDGE_PAGE = 50;
const MAILTO_BATCH = 40;   // Outlook and Gmail start truncating long mailto: links past this

let allJudges = [];
const jn = { status: 'unverified', q: '', state: '', field: '', extra: '', sort: 'new', shown: JUDGE_PAGE, selected: new Set() };
let judgeEmailCounts = new Map();   // lower(email) -> rows with that address

function jStatusOf(j) { return j.status || 'unverified'; }
function findJudge(id)  { return allJudges.find(j => String(j.id) === String(id)); }

async function fetchJudges() {
  if (!sb) return DEMO.judges.map(j => ({ ...j }));
  return fgRows(await sb.from('judges').select('*').order('created_at', { ascending: false }));
}

async function loadJudges() {
  return fgLoad('judgesTbody',
    async () => {
      allJudges = await fetchJudges();
      fillJudgeStateFilter();
      return allJudges;
    },
    renderJudges,
    { empty: 'No judges yet - share the volunteer page and they will show up here.' });
}
window.loadJudges = loadJudges;

/* -- Filtering ---------------------------------------------------- */

function judgeMatches(j) {
  if (jn.status !== 'all' && jStatusOf(j) !== jn.status) return false;
  if (jn.state === '__intl') { if ((j.country || 'US') === 'US') return false; }
  else if (jn.state && (j.state_code || '') !== jn.state) return false;
  if (jn.field && !(j.expertise || []).some(e => e.split('/')[0].trim() === jn.field.split('/')[0].trim())) return false;
  if (jn.extra === 'virtual'    && !j.virtual_ok) return false;
  if (jn.extra === 'duplicate'  && !isDuplicateJudge(j)) return false;
  if (jn.extra === 'referred'   && !j.referred_by) return false;
  if (jn.extra === 'bg_cleared' && j.background_check_status !== 'cleared') return false;
  if (jn.extra === 'bg_needed'  && !['requested','expired'].includes(j.background_check_status)) return false;
  if (jn.q) {
    const hay = [j.name, j.email, j.work_email, j.org, j.city, j.state_code, j.postal_code, j.region, j.code, j.notes,
                 j.signup_source, j.heard_about, j.referred_by,
                 (j.expertise || []).join(' ')].join(' ').toLowerCase();
    if (!jn.q.split(/\s+/).every(w => hay.includes(w))) return false;
  }
  return true;
}

function sortJudges(list) {
  const t = j => Date.parse(j.created_at || 0) || 0;
  const by = {
    new:   (a, b) => t(b) - t(a),
    old:   (a, b) => t(a) - t(b),
    name:  (a, b) => (a.name || '').localeCompare(b.name || ''),
    state: (a, b) => (a.state_code || 'ZZ').localeCompare(b.state_code || 'ZZ') || (a.name || '').localeCompare(b.name || ''),
  };
  return list.sort(by[jn.sort] || by.new);
}

function filteredJudges() { return sortJudges(allJudges.filter(judgeMatches)); }

function emailKey(j) { return (j.email || '').trim().toLowerCase(); }
function isDuplicateJudge(j) { return emailKey(j) && (judgeEmailCounts.get(emailKey(j)) || 0) > 1; }
function countJudgeEmails() {
  judgeEmailCounts = new Map();
  allJudges.forEach(j => { const k = emailKey(j); if (k) judgeEmailCounts.set(k, (judgeEmailCounts.get(k) || 0) + 1); });
}

function setJudgeTab(status) {
  jn.status = status; jn.shown = JUDGE_PAGE;
  document.querySelectorAll('#jnTabs .jn-tab').forEach(b => b.classList.toggle('active', b.dataset.status === status));
  renderJudges();
}
function setJudgeFilter() {
  jn.q     = (document.getElementById('jnSearch')?.value || '').trim().toLowerCase();
  jn.state = document.getElementById('jnState')?.value || '';
  jn.field = document.getElementById('jnField')?.value || '';
  jn.extra = document.getElementById('jnExtra')?.value || '';
  jn.sort  = document.getElementById('jnSort')?.value || 'new';
  jn.shown = JUDGE_PAGE;
  renderJudges();
}
function showMoreJudges() { jn.shown += JUDGE_PAGE; renderJudges(); }
Object.assign(window, { setJudgeTab, setJudgeFilter, showMoreJudges });

/* Only the states that actually have judges, with counts, so the
   dropdown doubles as a quick read of where people are. */
function fillJudgeStateFilter() {
  const sel = document.getElementById('jnState');
  if (!sel) return;
  const counts = {};
  let intl = 0;
  allJudges.forEach(j => {
    if ((j.country || 'US') !== 'US') { intl++; return; }
    const st = j.state_code || '';
    if (st) counts[st] = (counts[st] || 0) + 1;
  });
  const keep = sel.value;
  sel.innerHTML = '<option value="">All states</option>' +
    Object.keys(counts).sort().map(st => `<option value="${esc(st)}">${esc(st)} (${counts[st]})</option>`).join('') +
    (intl ? `<option value="__intl">Outside the US (${intl})</option>` : '');
  sel.value = keep;
}

function updateJudgeCounts() {
  const n = { unverified: 0, active: 0, inactive: 0, all: allJudges.length };
  allJudges.forEach(j => { const s = jStatusOf(j); if (s in n) n[s]++; });
  Object.entries(n).forEach(([k, v]) => { const el = document.getElementById('jnN-' + k); if (el) el.textContent = v; });
  const badge = document.getElementById('judgeBadge');
  if (badge) { badge.textContent = n.unverified; badge.style.display = n.unverified ? 'inline-block' : 'none'; }
}

/* -- Rendering ---------------------------------------------------- */

function travelLabel(j) {
  const m = j.travel_miles;
  if (j.travel_range === 'statewide' || m >= 9999) return 'Anywhere in state';
  return m ? 'Up to ' + m + ' mi' : (j.travel_range ? esc(j.travel_range) : '–');
}

function shortFields(j) {
  return (j.expertise || []).map(e => esc(e.split('/')[0].trim())).join(', ') || '–';
}

const BG_LABEL = { not_required: 'Not required', requested: 'Requested', cleared: 'Cleared', expired: 'Expired' };

/* Small flags beside the name: what an admin needs to notice at a glance. */
function judgeBadgesHTML(j) {
  const b = [];
  if (isDuplicateJudge(j)) b.push('<span class="jn-flag jn-flag-dup" title="Another application uses this email">Duplicate</span>');
  if (j.virtual_ok)        b.push('<span class="jn-flag" title="Can judge virtually">Virtual</span>');
  if (j.background_check_status === 'cleared') b.push('<span class="jn-flag jn-flag-ok" title="Background check cleared">BG ✓</span>');
  if (['requested','expired'].includes(j.background_check_status)) b.push(`<span class="jn-flag jn-flag-warn" title="Background check ${esc(j.background_check_status)}">BG ${esc(j.background_check_status)}</span>`);
  if (j.referred_by)       b.push('<span class="jn-flag" title="Joined through another judge\'s link">Referred</span>');
  return b.length ? ' ' + b.join(' ') : '';
}

function judgeActionsHTML(j) {
  const id = esc(j.id), s = jStatusOf(j);
  if (s === 'active')   return `<button class="btn-xs danger" onclick="deactivateJudge('${id}')">Deactivate</button>`;
  if (s === 'inactive') return `<button class="btn-xs" onclick="activateJudge('${id}')">Reactivate</button>`;
  return `<button class="btn-xs approve" onclick="activateJudge('${id}')">Activate</button>
          <button class="btn-xs danger" onclick="deactivateJudge('${id}')">Decline</button>`;
}

function judgeRowHTML(j) {
  const id = esc(j.id), s = jStatusOf(j);
  const applied = j.created_at ? new Date(j.created_at).toLocaleDateString() : '–';
  return `<tr id="jrow-${id}" class="row-click" title="Open the full profile" onclick="openJudge('${id}')">
    <td class="jn-check" onclick="event.stopPropagation();"><input type="checkbox" aria-label="Select ${esc(j.name)}" ${jn.selected.has(String(j.id)) ? 'checked' : ''} onchange="toggleJudgeSelect('${id}', this.checked)"/></td>
    <td class="col-name">${esc(j.name || 'No name')}${judgeBadgesHTML(j)}<div class="text-xs text-muted">${esc(j.org || '')}</div></td>
    <td class="col-sm">${shortFields(j)}</td>
    <td class="col-sm">${esc(FG_GEO.label(j))}${j.postal_code ? ' <span class="text-muted">' + esc(j.postal_code) + '</span>' : ''}</td>
    <td class="col-sm">${travelLabel(j)}</td>
    <td class="col-sm">${applied}</td>
    <td><span class="chip chip-${esc(s)}">${esc(JUDGE_STATUS_LABEL[s] || s)}</span></td>
    <td style="white-space:nowrap;" onclick="event.stopPropagation();">${judgeActionsHTML(j)}</td>
  </tr>`;
}

function renderJudges() {
  const tbody = document.getElementById('judgesTbody');
  const more  = document.getElementById('jnMore');
  if (!tbody) return;
  countJudgeEmails();
  updateJudgeCounts();
  renderJudgeSources();
  const list = filteredJudges();
  const all  = document.getElementById('jnAll');
  if (all) all.checked = false;

  if (!list.length) {
    const tab = JUDGE_STATUS_LABEL[jn.status];
    fgEmpty(tbody, jn.q || jn.state || jn.field || jn.extra ? 'No judges match these filters.'
      : jn.status === 'unverified' ? 'Nobody is waiting for review. Nice work.'
      : `No ${tab ? tab.toLowerCase() + ' ' : ''}judges yet.`);
    if (more) more.innerHTML = '';
    syncJudgeBulkBar();
    return;
  }
  tbody.innerHTML = list.slice(0, jn.shown).map(judgeRowHTML).join('');
  if (more) {
    more.innerHTML = list.length > jn.shown
      ? `<span class="text-xs text-muted" style="align-self:center;margin-right:10px;">Showing ${jn.shown} of ${list.length}</span>
         <button class="btn-xs" onclick="showMoreJudges()">Show ${Math.min(JUDGE_PAGE, list.length - jn.shown)} more</button>`
      : `<span class="text-xs text-muted">${list.length} judge${list.length === 1 ? '' : 's'}</span>`;
  }
  syncJudgeBulkBar();
}

/* Rewrites one row in place after its status changes. The row stays put
   even if it no longer fits the tab, so the rows under it do not jump;
   it drops out the next time a filter changes. */
function refreshJudgeRow(id) {
  const tr = document.getElementById('jrow-' + id);
  const j  = findJudge(id);
  if (!tr || !j) return;
  const tmp = document.createElement('tbody');
  tmp.innerHTML = judgeRowHTML(j);
  const row = tmp.firstElementChild;
  row.classList.add('jn-done');
  tr.replaceWith(row);
}

/* -- Selection ---------------------------------------------------- */

function toggleJudgeSelect(id, on) {
  if (on) jn.selected.add(String(id)); else jn.selected.delete(String(id));
  syncJudgeBulkBar();
}
function toggleAllJudges(on) {
  filteredJudges().slice(0, jn.shown).forEach(j => on ? jn.selected.add(String(j.id)) : jn.selected.delete(String(j.id)));
  document.querySelectorAll('#judgesTbody .jn-check input').forEach(cb => { cb.checked = on; });
  syncJudgeBulkBar();
}
function clearJudgeSelection() {
  jn.selected.clear();
  document.querySelectorAll('#judgesTbody .jn-check input, #jnAll').forEach(cb => { cb.checked = false; });
  syncJudgeBulkBar();
}
function syncJudgeBulkBar() {
  const bar = document.getElementById('jnBulk');
  if (!bar) return;
  const n = jn.selected.size;
  bar.classList.toggle('show', n > 0);
  const label = document.getElementById('jnBulkN');
  if (label) label.textContent = n + ' selected';
}
Object.assign(window, { toggleJudgeSelect, toggleAllJudges, clearJudgeSelection });

/* -- Status changes ----------------------------------------------- */

async function setJudgeStatus(ids, status) {
  ids = ids.map(String);
  if (sb) {
    const { error } = await sb.from('judges').update({ status }).in('id', ids);
    if (error) { fgToast('Could not update - ' + esc(error.message), 'err'); return false; }
  }
  ids.forEach(id => { const j = findJudge(id); if (j) j.status = status; refreshJudgeRow(id); });
  updateJudgeCounts();
  if (jmMap) renderJudgeMap();
  return true;
}

/* One mailto per batch, the judges in BCC and FairGame in To, so nobody
   sees anyone else's address. */
function judgeBccLinks(people, type) {
  const withEmail = people.filter(p => p.email);
  const m = approvalEmailFor(type, '');
  const links = [];
  for (let i = 0; i < withEmail.length; i += MAILTO_BATCH) {
    const batch = withEmail.slice(i, i + MAILTO_BATCH);
    links.push({
      label: withEmail.length > MAILTO_BATCH ? `${i + 1}–${i + batch.length}` : '',
      url: 'mailto:fairgameinitiative@outlook.com?bcc=' + encodeURIComponent(batch.map(p => p.email).join(',')) +
           '&subject=' + encodeURIComponent(m.subject) + '&body=' + encodeURIComponent(m.body),
    });
  }
  return links;
}

async function activateJudge(id) {
  const j = findJudge(id);
  if (!j) return;
  const prev = jStatusOf(j);
  if (!await setJudgeStatus([id], 'active')) return;
  closeModal('portfolioModal');
  const mailto = j.email ? buildMailto(j.email, 'judge', j.name, { code: j.code }) : '';
  if (mailto) openMailto(mailto);
  fgToast(`Activated <strong>${esc(j.name)}</strong>. ` +
    (mailto ? `A welcome email is open in your mail app - <a href="${mailto}">open it again</a>. ` : 'No email on file, so no welcome email. ') +
    `<a href="#" onclick="undoJudge('${esc(id)}','${esc(prev)}');this.closest('.fg-toast').remove();return false;">Undo</a>`);
}

async function deactivateJudge(id) {
  const j = findJudge(id);
  if (!j) return;
  const declining = jStatusOf(j) === 'unverified';
  if (!confirm(declining
      ? `Decline ${j.name}'s application? They will see "paused" if they sign in. You can reactivate them later.`
      : `Deactivate ${j.name}? Their portal closes and teachers stop seeing them. You can reactivate them later.`)) return;
  const prev = jStatusOf(j);
  if (!await setJudgeStatus([id], 'inactive')) return;
  closeModal('portfolioModal');
  fgToast(`${declining ? 'Declined' : 'Deactivated'} <strong>${esc(j.name)}</strong>. No email was sent. ` +
    `<a href="#" onclick="undoJudge('${esc(id)}','${esc(prev)}');this.closest('.fg-toast').remove();return false;">Undo</a>`);
}

async function undoJudge(id, status) {
  if (await setJudgeStatus([id], status)) fgToast('Undone.');
}

async function bulkJudges(action) {
  const people = [...jn.selected].map(findJudge).filter(Boolean);
  if (!people.length) return;
  const n = people.length, s = n === 1 ? '' : 's';

  if (action === 'email') {
    const links = judgeBccLinks(people, 'judge_update');
    fgToast(`Email ${n} judge${s}: ` + links.map(l => `<a href="${l.url}">${l.label || 'open draft'}</a>`).join(' · '), 'ok', 0);
    return;
  }
  if (action === 'activate') {
    if (!confirm(`Activate ${n} judge${s}? Their portals open right away.`)) return;
    if (!await setJudgeStatus(people.map(p => p.id), 'active')) return;
    const links = judgeBccLinks(people, 'judge');
    fgToast(`Activated ${n} judge${s}. Send the welcome email: ` +
      links.map(l => `<a href="${l.url}">${l.label || 'open draft'}</a>`).join(' · '), 'ok', 0);
  }
  if (action === 'deactivate') {
    if (!confirm(`Deactivate ${n} judge${s}? No email is sent.`)) return;
    if (!await setJudgeStatus(people.map(p => p.id), 'inactive')) return;
    fgToast(`Deactivated ${n} judge${s}.`);
  }
  clearJudgeSelection();
}
Object.assign(window, { activateJudge, deactivateJudge, undoJudge, bulkJudges });

/* -- Export ------------------------------------------------------- */

function exportJudgesCsv() {
  const list = filteredJudges();
  if (!list.length) { fgToast('Nothing to export with these filters.'); return; }
  const cols = [
    ['Name', j => j.name], ['Email', j => j.email], ['Organization', j => j.org], ['Status', j => jStatusOf(j)],
    ['Country', j => j.country || 'US'], ['State', j => j.state_code || j.region], ['City', j => j.city],
    ['ZIP', j => j.postal_code], ['Latitude', j => j.latitude], ['Longitude', j => j.longitude],
    ['Expertise', j => (j.expertise || []).join('; ')], ['Level', j => j.available_level],
    ['Travel', j => j.travel_miles >= 9999 ? 'statewide' : j.travel_miles], ['Notes', j => j.notes],
    ['Grade levels', j => (j.preferred_grade_bands || []).join('; ')], ['Virtual', j => j.virtual_ok ? 'yes' : ''],
    ['Months', j => (j.available_months || []).join('; ')], ['LinkedIn', j => j.linkedin], ['Work email', j => j.work_email],
    ['Heard about', j => j.heard_about], ['Source', j => j.signup_source], ['Referred by', j => j.referred_by],
    ['Referrals', j => referralsOf(j).length], ['Code of conduct', j => j.conduct_agreed_at ? j.conduct_agreed_at.slice(0, 10) : ''],
    ['Background check', j => j.background_check_status], ['Background check date', j => j.background_check_date],
    ['Duplicate email', j => isDuplicateJudge(j) ? 'yes' : ''],
    ['Code', j => j.code], ['Applied', j => j.created_at ? j.created_at.slice(0, 10) : ''],
  ];
  const cell = v => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const csv = [cols.map(c => c[0]).join(','), ...list.map(j => cols.map(c => cell(c[1](j))).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `fairgame-judges-${jn.status}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
window.exportJudgesCsv = exportJudgesCsv;

/* -- Profile sheet ------------------------------------------------ */

const PIN_SOURCE = {
  fg_zip: 'From their ZIP code', fg_city: 'From their city', fg_state: 'State only - approximate',
  census_zcta: 'From their ZIP code', census_zcta_city: 'From their city', saved: 'Saved',
  zip: 'From their ZIP code', city: 'From their city', state: 'State only - approximate (not saved yet)',
};

async function openJudge(id) {
  const j = findJudge(id);
  if (!j) return;
  const s = jStatusOf(j);
  // The map tab fills jmPoints; until it has been opened, work this
  // one out here.
  let pt = jmPoints.get(String(j.id));
  if (!pt) {
    pt = await FG_GEO.resolveJudge(j).catch(() => null);
    if (pt) jmPoints.set(String(j.id), pt);
  }
  const applied = j.created_at ? new Date(j.created_at) : null;
  const waited = applied ? Math.floor((Date.now() - applied) / 86400000) : null;

  document.getElementById('portfolioBody').innerHTML = `
    <div class="pf-head">
      <h3 style="margin:0;">${esc(j.name || 'No name given')}</h3>
      <div class="pf-chips">
        <span class="chip chip-interest">judge</span>
        <span class="chip chip-${esc(s)}">${esc(JUDGE_STATUS_LABEL[s] || s)}</span>
        ${j.code ? `<span class="chip chip-declined">${esc(j.code)}</span>` : ''}
      </div>
    </div>
    <div class="pf-group">
      <div class="pf-group-title">Contact</div>
      ${pfPlainRow('Email', j.email ? `<a href="mailto:${esc(j.email)}">${esc(j.email)}</a>` : pfMissing())}
      ${pfPlainRow('Organization', j.org ? esc(j.org) : pfMissing())}
      ${pfPlainRow('Applied', applied ? esc(applied.toLocaleDateString() + (waited != null ? ' - ' + (waited <= 0 ? 'today' : waited + ' day' + (waited === 1 ? '' : 's') + ' ago') : '')) : pfMissing())}
    </div>
    <div class="pf-group">
      <div class="pf-group-title">Location</div>
      ${pfPlainRow('Where', esc(FG_GEO.label(j)))}
      ${pfPlainRow('Country', esc(FG_GEO.countryName(j.country || 'US')))}
      ${pfPlainRow('ZIP / postal code', j.postal_code ? esc(j.postal_code) : pfMissing('Not given'))}
      ${pfPlainRow('Map pin', pt ? esc(PIN_SOURCE[pt.source] || pt.source) : pfMissing('Cannot be placed - no state on file'))}
      ${pfPlainRow('Will travel', travelLabel(j))}
    </div>
    <div class="pf-group">
      <div class="pf-group-title">Judging</div>
      ${pfRow('expertise', j.expertise || [])}
      ${pfPlainRow('Grade levels', (j.preferred_grade_bands || []).length ? (j.preferred_grade_bands).map(g => esc(GRADE_LABEL[g] || g)).join(' &middot; ') : pfMissing('Not given'))}
      ${pfPlainRow('Fair level', j.available_level ? esc(j.available_level) : pfMissing())}
      ${pfPlainRow('Virtual judging', j.virtual_ok ? 'Yes' : 'No')}
      ${pfPlainRow('Months free', (j.available_months || []).length ? esc(j.available_months.join(', ')) : pfMissing('Not given'))}
      ${pfRow('notes', j.notes)}
    </div>
    <div class="pf-group">
      <div class="pf-group-title">Checks</div>
      ${isDuplicateJudge(j) ? pfPlainRow('Duplicate', `<span class="pf-missing">${judgeEmailCounts.get(emailKey(j))} applications use this email</span> - <a href="#" onclick="closeModal('portfolioModal');showDuplicatesOf('${esc(emailKey(j))}');return false;">show them</a>`) : ''}
      ${pfPlainRow('LinkedIn', j.linkedin ? `<a href="${esc(j.linkedin)}" target="_blank" rel="noopener noreferrer">${esc(j.linkedin)}</a>` : pfMissing('Not given'))}
      ${pfPlainRow('Work email', j.work_email ? `<a href="mailto:${esc(j.work_email)}">${esc(j.work_email)}</a>` : pfMissing('Not given'))}
      ${pfPlainRow('Code of conduct', j.conduct_agreed_at ? 'Agreed ' + esc(new Date(j.conduct_agreed_at).toLocaleDateString()) : pfMissing('Not on file - applied before it was asked'))}
      ${pfPlainRow('Confirmation email', j.confirmation_sent_at ? 'Sent ' + esc(new Date(j.confirmation_sent_at).toLocaleString()) : '<span class="text-muted">Not sent</span>')}
      <div class="pf-row"><div class="pf-key">Background check</div><div class="pf-val" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        <select id="pfBgStatus" style="width:auto;padding:5px 8px;font-size:.8rem;">
          <option value="">Not recorded</option>
          ${Object.entries(BG_LABEL).map(([k, v]) => `<option value="${k}" ${j.background_check_status === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <input type="date" id="pfBgDate" value="${esc(j.background_check_date || '')}" style="width:auto;padding:4px 8px;font-size:.8rem;"/>
        <button class="btn-xs" onclick="saveBackgroundCheck('${esc(j.id)}')">Save</button>
      </div></div>
    </div>
    <div class="pf-group">
      <div class="pf-group-title">How they found us</div>
      ${pfPlainRow('Heard about us', j.heard_about ? esc(j.heard_about) : pfMissing('Not given'))}
      ${pfPlainRow('Link tag', j.signup_source ? esc(j.signup_source) : '<span class="text-muted">None</span>')}
      ${pfPlainRow('Referred by', referrerHTML(j))}
      ${pfPlainRow('Their referrals', referralsHTML(j))}
      ${j.code ? pfPlainRow('Referral link', `<a href="https://fairgameinitiative.org/volunteer.html?ref=${encodeURIComponent(j.code)}#judge" target="_blank" rel="noopener">volunteer.html?ref=${esc(j.code)}</a>`) : ''}
    </div>`;
  document.getElementById('portfolioActions').innerHTML = `
    <button class="btn-ghost" onclick="closeModal('portfolioModal')">Close</button>
    ${pt ? `<button class="btn-xs" onclick="closeModal('portfolioModal');focusJudgeOnMap('${esc(j.id)}')">Show on map</button>` : ''}
    ${s !== 'inactive' ? `<button class="btn-xs danger" onclick="deactivateJudge('${esc(j.id)}')">${s === 'unverified' ? 'Decline' : 'Deactivate'}</button>` : ''}
    ${s !== 'active' ? `<button class="btn-primary" style="font-size:.8rem;padding:8px 14px;" onclick="activateJudge('${esc(j.id)}')">${s === 'inactive' ? 'Reactivate' : 'Activate'} &rarr;</button>` : ''}`;
  openModal('portfolioModal');
}
window.openJudge = openJudge;

const GRADE_LABEL = { elementary: 'Elementary (K–5)', middle: 'Middle (6–8)', high: 'High (9–12)' };

function referralsOf(j) {
  return j.code ? allJudges.filter(r => r.referred_by && r.referred_by === j.code) : [];
}
function judgeLink(j) {
  return `<a href="#" onclick="openJudge('${esc(j.id)}');return false;">${esc(j.name || j.email || 'Unnamed')}</a>`;
}
function referrerHTML(j) {
  if (!j.referred_by) return '<span class="text-muted">Nobody</span>';
  const r = allJudges.find(x => x.code === j.referred_by);
  return r ? judgeLink(r) + ` <span class="text-muted">(${esc(j.referred_by)})</span>` : esc(j.referred_by) + ' <span class="text-muted">- no judge has this code</span>';
}
function referralsHTML(j) {
  const rs = referralsOf(j);
  return rs.length ? rs.map(judgeLink).join(', ') : '<span class="text-muted">None yet</span>';
}

async function saveBackgroundCheck(id) {
  const j = findJudge(id);
  if (!j) return;
  const upd = {
    background_check_status: document.getElementById('pfBgStatus')?.value || null,
    background_check_date:   document.getElementById('pfBgDate')?.value || null,
  };
  if (sb) {
    const { error } = await sb.from('judges').update(upd).eq('id', id);
    if (error) { fgToast('Could not save the background check - ' + esc(error.message), 'err'); return; }
  }
  Object.assign(j, upd);
  refreshJudgeRow(id);
  fgToast('Background check saved for <strong>' + esc(j.name) + '</strong>.');
}
window.saveBackgroundCheck = saveBackgroundCheck;

/* Duplicates are found by email, so the quickest way to compare them is
   to search for that email across every status. */
function showDuplicatesOf(email) {
  const search = document.getElementById('jnSearch');
  if (search) search.value = email;
  const extra = document.getElementById('jnExtra');
  if (extra) extra.value = '';
  setJudgeTab('all');
  setJudgeFilter();
}
window.showDuplicatesOf = showDuplicatesOf;

/* -- Where judges come from ---------------------------------------
   The outreach scoreboard: which ?src= tags, which "heard about us"
   answers, and which judges' referral links are bringing people in. */
function renderJudgeSources() {
  const box = document.getElementById('jnSources');
  if (!box) return;
  const tally = (fn) => {
    const m = new Map();
    allJudges.forEach(j => { const k = fn(j); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  };
  const byCode = new Map(allJudges.filter(j => j.code).map(j => [j.code, j]));
  const col = (title, rows, label = k => esc(k), empty) => `<div class="jn-src-col">
      <div class="pf-group-title">${title}</div>
      ${rows.length ? rows.map(([k, n]) => `<div class="jn-src-row"><span>${label(k)}</span><strong>${n}</strong></div>`).join('')
                    : `<div class="text-xs text-muted">${empty}</div>`}
    </div>`;
  box.innerHTML =
    col('Link tags (?src=)', tally(j => j.signup_source), undefined, 'None yet. Add ?src=TX-ACS (or similar) to each outreach link.') +
    col('Heard about us', tally(j => j.heard_about), undefined, 'No answers yet.') +
    col('Top referrers', tally(j => j.referred_by), k => byCode.get(k) ? judgeLink(byCode.get(k)) : esc(k), 'No referrals yet.');
}


/* ══════════════════════════════════════════════════════════════════
   JUDGE MAP

   Every judge as a pin, clustered so a few thousand stay readable, with
   an optional 100-mile ring around each one - the practical reach of a
   volunteer driving to a fair. Two outreach tools sit beside it:

   - Judges near a place: pick a state/city/ZIP or click the map, and
     see who is within N miles, nearest first.
   - Coverage by state: all 50 states and DC, with the ones that have no
     active judge in red. That is the outreach list.

   Pins come from the latitude/longitude saved at sign-up. Older rows
   that have none are placed from their ZIP, city, or state in the
   browser; "Save missing pins" writes those back so it only happens once.
   ══════════════════════════════════════════════════════════════════ */

const JM_COLORS = { active: '#357a38', unverified: '#d97706', inactive: '#9ca3af' };
const JM_RING_MILES = 100;
const METERS_PER_MILE = 1609.344;
const US_51 = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
               'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD',
               'TN','TX','UT','VT','VA','WA','WV','WI','WY'];

let jmMap = null, jmCluster = null, jmRings = null, jmSearch = null, jmPicker = null;
const jmPoints  = new Map();   // judge id -> { lat, lng, source }
const jmMarkers = new Map();   // judge id -> marker
let jmLastSearch = null;

async function ensureJudgePoints() {
  await Promise.all(allJudges.map(async j => {
    const key = String(j.id);
    if (jmPoints.has(key)) return;
    try { const pt = await FG_GEO.resolveJudge(j); if (pt) jmPoints.set(key, pt); }
    catch (_) { /* a missing state file just leaves this one unmapped */ }
  }));
}

function initJudgeMap() {
  if (jmMap) return true;
  if (!window.L) {
    fgEmpty(document.getElementById('adminJudgeMap'), 'The map library did not load - check your connection and refresh.');
    return false;
  }
  jmMap = L.map('adminJudgeMap', { preferCanvas: true, worldCopyJump: true }).setView([39.5, -98.35], 4);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO', maxZoom: 18,
  }).addTo(jmMap);
  jmRings   = L.layerGroup().addTo(jmMap);
  jmCluster = (L.markerClusterGroup
    ? L.markerClusterGroup({ maxClusterRadius: 45, showCoverageOnHover: false, spiderfyOnMaxZoom: true })
    : L.layerGroup()).addTo(jmMap);
  jmSearch  = L.layerGroup().addTo(jmMap);
  jmMap.on('click', e => searchNearPoint({ lat: e.latlng.lat, lng: e.latlng.lng }, 'the point you clicked'));

  const locEl = document.getElementById('jmLocation');
  if (locEl) jmPicker = FG_GEO.mountPicker(locEl, { prefix: 'jm', labelClass: 'form-label' });
  return true;
}

async function loadJudgeMap() {
  if (!initJudgeMap()) return;
  // The section was hidden when Leaflet measured it.
  setTimeout(() => jmMap.invalidateSize(), 0);
  try {
    allJudges = await fetchJudges();
  } catch (e) {
    fgToast('Could not load judges for the map - ' + esc(e.message), 'err');
    return;
  }
  await ensureJudgePoints();
  renderJudgeMap();
  if (!jmMap._fgFitted) { fitJudgeMap(); jmMap._fgFitted = true; }
}

function jmVisible(j) {
  const s = jStatusOf(j);
  if (!document.getElementById(s === 'active' ? 'jmShowActive' : s === 'inactive' ? 'jmShowInactive' : 'jmShowPending')?.checked) return false;
  if (document.getElementById('jmVirtualOnly')?.checked && !j.virtual_ok) return false;
  const field = document.getElementById('jmField')?.value;
  if (field && !(j.expertise || []).some(e => e.split('/')[0].trim() === field.split('/')[0].trim())) return false;
  return true;
}

function jmPopupHTML(j, pt) {
  const s = jStatusOf(j);
  return `<div class="jm-popup">
    <strong>${esc(j.name)}</strong><br/>
    <span class="chip chip-${esc(s)}">${esc(JUDGE_STATUS_LABEL[s] || s)}</span>
    <div>${esc(j.org || '')}</div>
    <div class="text-muted">${esc(FG_GEO.label(j))} · travels ${travelLabel(j).toLowerCase()}${j.virtual_ok ? ' · virtual OK' : ''}</div>
    <div>${shortFields(j)}</div>
    ${/state/.test(pt.source) ? '<div class="jn-pin-src">Pin is approximate - state only</div>' : ''}
    <div class="jm-popup-actions">
      <button class="btn-xs" onclick="openJudge('${esc(j.id)}')">Profile</button>
      ${s !== 'active' ? `<button class="btn-xs approve" onclick="activateJudge('${esc(j.id)}')">Activate</button>` : ''}
    </div>
  </div>`;
}

function renderJudgeMap() {
  if (!jmMap) return;
  jmCluster.clearLayers(); jmRings.clearLayers(); jmMarkers.clear();
  const rings = document.getElementById('jmRings')?.checked;
  let shown = 0, unmapped = 0, unsaved = 0;

  allJudges.forEach(j => {
    const pt = jmPoints.get(String(j.id));
    if (j.latitude == null && pt) unsaved++;
    if (!jmVisible(j)) return;
    if (!pt) { unmapped++; return; }
    const color = JM_COLORS[jStatusOf(j)] || JM_COLORS.unverified;
    const approx = /state/.test(pt.source);
    const m = L.circleMarker([pt.lat, pt.lng], {
      radius: 7, color: '#1c3a1c', weight: 1.5, fillColor: color, fillOpacity: approx ? 0.3 : 0.95,
    }).bindPopup(() => jmPopupHTML(j, pt));
    jmCluster.addLayer(m);
    jmMarkers.set(String(j.id), m);
    if (rings) {
      jmRings.addLayer(L.circle([pt.lat, pt.lng], {
        radius: JM_RING_MILES * METERS_PER_MILE, color, weight: 1, opacity: 0.35, fillOpacity: 0.05, interactive: false,
      }));
    }
    shown++;
  });

  const sum = document.getElementById('jmSummary');
  if (sum) sum.textContent = `${shown} on the map` + (unmapped ? ` · ${unmapped} cannot be placed (no state, or outside the US and Canada)` : '');
  const save = document.getElementById('jmSaveBtn');
  if (save) {
    save.style.display = unsaved && sb ? '' : 'none';
    save.textContent = `Save ${unsaved} missing pin${unsaved === 1 ? '' : 's'}`;
  }
  renderCoverage();
  if (jmLastSearch) searchNearPoint(jmLastSearch.pt, jmLastSearch.label, true);
}
window.renderJudgeMap = renderJudgeMap;

function fitJudgeMap() {
  if (!jmMap) return;
  const pts = allJudges.filter(jmVisible).map(j => jmPoints.get(String(j.id))).filter(Boolean);
  if (pts.length) jmMap.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lng])).pad(0.15), { maxZoom: 8 });
  else jmMap.setView([39.5, -98.35], 4);
}
window.fitJudgeMap = fitJudgeMap;

/* -- Coverage by state -------------------------------------------- */

async function renderCoverage() {
  const box = document.getElementById('jmStates');
  if (!box) return;
  const rows = {};
  const bump = (key, s) => { rows[key] = rows[key] || { active: 0, unverified: 0 }; if (s in rows[key]) rows[key][s]++; };
  allJudges.forEach(j => {
    const s = jStatusOf(j);
    if (s === 'inactive') return;
    const c = j.country || 'US';
    if (c === 'US' && j.state_code) bump(j.state_code, s);
    else if (c === 'CA' && j.state_code) bump('CA:' + j.state_code, s);
    else bump('INTL:' + c, s);
  });
  const usNames = Object.fromEntries((await FG_GEO.regions('US').catch(() => [])).map(r => [r.code, r.name]));
  const caNames = Object.fromEntries((await FG_GEO.regions('CA').catch(() => [])).map(r => [r.code, r.name]));
  const keys = [...US_51, ...Object.keys(rows).filter(k => !US_51.includes(k)).sort()];
  const covered = US_51.filter(st => rows[st]?.active).length;

  const sum = document.getElementById('jmCoverageSummary');
  if (sum) sum.textContent = `${covered} of 51 have an active judge`;

  const sortBy = document.getElementById('jmCoverageSort')?.value || 'name';
  const total = k => (rows[k]?.active || 0) + (rows[k]?.unverified || 0);
  if (sortBy === 'fewest') keys.sort((a, b) => total(a) - total(b));
  if (sortBy === 'most')   keys.sort((a, b) => total(b) - total(a));

  const name = k => k.startsWith('CA:') ? (caNames[k.slice(3)] || k.slice(3)) + ', Canada'
                  : k.startsWith('INTL:') ? FG_GEO.countryName(k.slice(5)) || 'Unknown country'
                  : usNames[k] || k;
  box.innerHTML = `<table>
    <thead><tr><th>State</th><th>Active</th><th>Review</th></tr></thead>
    <tbody>${keys.map(k => {
      const r = rows[k] || { active: 0, unverified: 0 };
      return `<tr class="${r.active ? '' : 'jm-zero'}" onclick="zoomToState('${esc(k)}')">
        <td>${esc(name(k))}</td><td>${r.active}</td><td>${r.unverified || ''}</td></tr>`;
    }).join('')}</tbody></table>`;
}
window.renderCoverage = renderCoverage;

async function zoomToState(key) {
  if (!jmMap) return;
  const inState = j => key.startsWith('INTL:') ? (j.country || 'US') === key.slice(5)
                     : key.startsWith('CA:') ? j.country === 'CA' && j.state_code === key.slice(3)
                     : (j.country || 'US') === 'US' && j.state_code === key;
  const pts = allJudges.filter(inState).map(j => jmPoints.get(String(j.id))).filter(Boolean);
  if (pts.length) { jmMap.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lng])).pad(0.3), { maxZoom: 9 }); }
  else {
    const r = await FG_GEO.region(key.startsWith('CA:') ? 'CA' : 'US', key.replace(/^CA:/, ''));
    if (r) jmMap.setView([r.lat, r.lng], 6);
  }
  document.getElementById('adminJudgeMap')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
window.zoomToState = zoomToState;

/* -- Judges near a place ------------------------------------------ */

async function searchNearPlace() {
  if (!jmPicker) return;
  const loc = await jmPicker.read();
  if (!loc.ok) { fgToast(esc(loc.error), 'err'); return; }
  const v = loc.value;
  if (v.latitude == null) { fgToast('Pick a US state or Canadian province to search near.', 'err'); return; }
  searchNearPoint({ lat: v.latitude, lng: v.longitude }, FG_GEO.label(v) + (v.postal_code ? ' ' + v.postal_code : ''));
}
window.searchNearPlace = searchNearPlace;

function searchNearPoint(pt, label, quiet) {
  if (!jmMap) return;
  const miles = parseInt(document.getElementById('jmRadiusMi')?.value || JM_RING_MILES, 10);
  jmLastSearch = { pt, label };
  jmSearch.clearLayers();
  const ring = L.circle([pt.lat, pt.lng], { radius: miles * METERS_PER_MILE, color: '#1d4ed8', weight: 2, dashArray: '6 6', fillOpacity: 0.04, interactive: false });
  jmSearch.addLayer(ring);
  jmSearch.addLayer(L.circleMarker([pt.lat, pt.lng], { radius: 6, color: '#1d4ed8', weight: 2, fillColor: '#fff', fillOpacity: 1 }));
  if (!quiet) jmMap.fitBounds(ring.getBounds(), { padding: [20, 20] });

  const near = allJudges.filter(jmVisible).map(j => {
    const p = jmPoints.get(String(j.id));
    return p ? { j, p, d: FG_GEO.milesBetween(pt, p) } : null;
  }).filter(x => x && x.d <= miles).sort((a, b) => a.d - b.d);

  const active = near.filter(x => jStatusOf(x.j) === 'active').length;
  // Rural gaps are where virtual judges matter: count the ones outside
  // the ring who could still take this fair online.
  const nearIds = new Set(near.map(x => String(x.j.id)));
  const virtualElsewhere = allJudges.filter(j => j.virtual_ok && jStatusOf(j) === 'active' && !nearIds.has(String(j.id))).length;
  const box = document.getElementById('jmResults');
  if (!box) return;
  box.innerHTML = `<div class="jm-result" style="cursor:default;background:var(--gray-50);">
      <strong>${near.length}</strong> judge${near.length === 1 ? '' : 's'} within ${miles} mi of ${esc(label)}${near.length ? ` · ${active} active` : ''}
      <a href="#" style="float:right;" onclick="clearNearSearch();return false;">Clear</a>
    </div>` +
    (near.length ? near.map(({ j, p, d }) => {
      const reach = j.travel_miles >= 9999 || (j.travel_miles && j.travel_miles >= d);
      return `<div class="jm-result" onclick="focusJudgeOnMap('${esc(j.id)}')">
        <span class="jm-mi">${Math.round(d)} mi</span>
        <span class="jm-dot" style="background:${JM_COLORS[jStatusOf(j)] || JM_COLORS.unverified}"></span>${esc(j.name)}
        <div class="text-xs text-muted">${esc(FG_GEO.label(j))} · ${shortFields(j)}${/state/.test(p.source) ? ' · approx. pin' : ''}</div>
        <div class="text-xs" style="color:${reach ? 'var(--g600)' : 'var(--gray-400)'};">${reach ? 'Willing to travel this far' : 'Travels ' + travelLabel(j).toLowerCase()}</div>
      </div>`;
    }).join('') : '<div class="jm-result" style="cursor:default;">No judges in range yet - this is a gap to recruit for.</div>') +
    (virtualElsewhere ? `<div class="jm-result" style="cursor:pointer;color:var(--g700);" onclick="document.getElementById('jmVirtualOnly').checked=true;renderJudgeMap();fitJudgeMap();">
      + ${virtualElsewhere} active judge${virtualElsewhere === 1 ? '' : 's'} outside this range can judge virtually - show them</div>` : '');
}

function clearNearSearch() {
  jmLastSearch = null;
  jmSearch?.clearLayers();
  const box = document.getElementById('jmResults');
  if (box) box.innerHTML = '';
}
window.clearNearSearch = clearNearSearch;

async function focusJudgeOnMap(id) {
  const link = document.querySelector('.pnav-link[data-section="judgemap"]');
  if (!document.getElementById('sec-judgemap')?.classList.contains('active')) {
    showSection('judgemap', link);
    await loadJudgeMap();
  }
  const m = jmMarkers.get(String(id));
  if (!m) { fgToast('That judge is hidden by the map filters, or has no location.'); return; }
  const open = () => { jmMap.setView(m.getLatLng(), Math.max(jmMap.getZoom(), 9)); m.openPopup(); };
  if (jmCluster.zoomToShowLayer) jmCluster.zoomToShowLayer(m, open); else open();
  document.getElementById('adminJudgeMap')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
window.focusJudgeOnMap = focusJudgeOnMap;

/* Writes the browser-worked-out pins for older judges back to the table,
   so the server-side matcher and every later visit can use them. */
async function saveMissingPins() {
  if (!sb) return;
  const todo = allJudges.filter(j => j.latitude == null && jmPoints.has(String(j.id)));
  if (!todo.length) return;
  if (!confirm(`Save map locations for ${todo.length} judge${todo.length === 1 ? '' : 's'}? Pins placed from the state alone stay marked as approximate.`)) return;
  const btn = document.getElementById('jmSaveBtn');
  if (btn) btn.disabled = true;
  let done = 0, failed = 0;
  for (const j of todo) {
    const pt = jmPoints.get(String(j.id));
    const upd = { latitude: pt.lat, longitude: pt.lng, geocode_source: 'fg_' + pt.source, geocoded_at: new Date().toISOString() };
    const { error } = await sb.from('judges').update(upd).eq('id', j.id);
    if (error) failed++;
    else { Object.assign(j, upd); jmPoints.set(String(j.id), { ...pt, source: upd.geocode_source }); done++; }
    if (btn) btn.textContent = `Saving… ${done + failed}/${todo.length}`;
  }
  if (btn) btn.disabled = false;
  renderJudgeMap();
  fgToast(`Saved ${done} pin${done === 1 ? '' : 's'}.` + (failed ? ` ${failed} could not be saved.` : ''), failed ? 'err' : 'ok');
}
window.saveMissingPins = saveMissingPins;

async function loadMentors() {
  return fgLoad('mentorsTbody',
    async () => sb ? fgRows(await sb.from('mentorships').select('*').order('created_at',{ascending:false})) : DEMO.mentors,
    renderMentors,
    { empty: 'No mentor matches yet - check back later.' });
}

function renderMentors(data) {
  document.getElementById('mentorsTbody').innerHTML = data.map(m => `<tr>
        <td class="col-name">${m.student_name}</td>
        <td class="col-sm">${m.mentor_name}</td>
        <td class="col-sm">${m.school||'–'}</td>
        <td class="col-sm" style="color:var(--g700);font-weight:500;">${m.total_hours||0}h</td>
        <td class="col-sm">${m.session_count||0}</td>
        <td><span class="chip chip-${m.status==='active'?'active':'declined'}">${m.status}</span></td>
      </tr>`).join('');
}

const STAT_KEYS   = ['students_reached','resources_count','teachers_network','active_judges','schools_supported'];
const STAT_LABELS = ['Students Reached','Free Resources','Teacher Network',
                     'Active Judges (backup - the homepage counts these live)','Schools Supported (impact report)'];
async function loadStats() {
  let vals = { students_reached:1000, resources_count:116, teachers_network:100, active_judges:0, schools_supported:4 };
  if (sb) {
    try { fgRows(await sb.from('stats').select('*')).forEach(r => vals[r.key] = r.value); }
    catch (e) { console.warn('[Admin] stats read failed, using defaults:', e.message); }
  }
  document.getElementById('statsForm').innerHTML = STAT_KEYS.map((k,i) => `
    <div class="form-group"><label class="form-label">${STAT_LABELS[i]}</label><input type="number" id="stat_${k}" value="${vals[k]}" min="0"/></div>`).join('');
}
async function saveStats() {
  for (const key of STAT_KEYS) {
    const val = parseInt(document.getElementById('stat_'+key)?.value||'0');
    if (sb) await sb.from('stats').upsert({ key, value: val, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  }
  showMsg('statsMsg','Stats saved - homepage counters will update.','ok');
}
window.saveStats = saveStats;


/* ══════════════════════════════════════════════════════════════════
   MESSAGE REVIEW

   Supervision that nobody looks at is not supervision. This is where
   the flags raised in mentor_messages surface, ordered by the view
   fg_message_review_queue, which ranks safeguarding language sent by
   an adult above everything else.
   ══════════════════════════════════════════════════════════════════ */

/* Two vocabularies land in flag_reasons. The structural ones come from
   fg_scan_contact_info and are fixed; the rest are the categories in
   moderation_terms, which migration 11 renamed - secrecy_language became
   secrecy, and so on. Both sets are mapped here so nothing renders as a
   raw slug. */
const FLAG_LABELS = {
  // Structural, from fg_scan_contact_info
  email_address:         'Shared an email address',
  phone_number:          'Shared a phone number',
  social_platform:       'Mentioned a social platform',
  external_meeting_link: 'External meeting link',
  contact:               'Shared contact details',
  // Vocabulary, from moderation_terms
  self_harm:             'Possible welfare concern',
  sexual:                'Sexual content',
  off_platform:          'Pushed to move off the platform',
  secrecy:               'Asked to keep something secret',
  meeting:               'Suggested meeting in person',
  substances:            'Alcohol or drugs',
  violence:              'Threat or violence',
  profanity:             'Swearing',
  other:                 'Flagged phrase',
  // Retired names, kept so older rows still read properly
  secrecy_language:      'Asked to keep something secret',
  in_person_meeting:     'Suggested meeting in person',
  off_platform_contact:  'Pushed to move off the platform',
};

async function refreshReviewBadge() {
  if (!sb) return;
  try {
    const { count } = await sb.from('mentor_messages')
      .select('id', { count: 'exact', head: true })
      .eq('flagged', true).is('reviewed_at', null);
    const badge = document.getElementById('reviewBadge');
    if (!badge) return;
    if (count > 0) { badge.textContent = count; badge.style.display = 'inline-block'; }
    else           { badge.style.display = 'none'; }
  } catch (e) { /* table may not exist until migration 07 is applied */ }
}

async function loadReviewQueue() {
  if (!sb) { fgEmpty('reviewQueue', 'Connect Supabase to review messages.'); return; }
  return fgLoad('reviewQueue',
    async () => fgRows(await sb.from('fg_message_review_queue').select('*')
      .order('severity', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50)),
    renderReviewQueue,
    { empty: 'Nothing flagged for review - check back later.' });
}
window.loadReviewQueue = loadReviewQueue;

function renderReviewQueue(rows) {
  document.getElementById('reviewQueue').innerHTML = rows.map(r => {
    const reasons = Array.isArray(r.flag_reasons) ? r.flag_reasons : [];
    // Severity 3+ is safeguarding language; 4 means an adult sent it.
    const urgent = r.severity >= 3;
    const border = urgent ? '#dc2626' : '#f59e0b';
    return `<div style="padding:14px 16px;border-bottom:1px solid var(--gray-100,#eef1ee);border-left:3px solid ${border};">
      <div class="flex justify-between items-center mb-4" style="flex-wrap:wrap;gap:6px;">
        <span class="fw-500 text-sm" style="color:var(--g900);">
          ${esc(r.sender_name || r.sender_role)}
          <span class="chip chip-${r.sender_role === 'mentor' ? 'interest' : 'active'}" style="margin-left:6px;">${esc(r.sender_role)}</span>
        </span>
        <span class="text-xs text-muted">${new Date(r.created_at).toLocaleString()}</span>
      </div>
      <div class="text-xs text-muted mb-4">${esc(r.student_name)} + ${esc(r.mentor_name)}${r.school ? ' · ' + esc(r.school) : ''}</div>
      <div class="text-sm" style="background:var(--gray-50,#f7f9f7);padding:10px 12px;line-height:1.55;white-space:pre-wrap;color:var(--gray-700,#3d453d);margin-bottom:8px;">${esc(r.body)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;">
        ${reasons.map(f => `<span style="font-size:.66rem;padding:2px 8px;background:${urgent ? '#fef2f2' : '#fff8e1'};color:${urgent ? '#7f1d1d' : '#78350f'};border:1px solid ${border};">${esc(FLAG_LABELS[f] || f)}</span>`).join('')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn-xs approve" onclick="clearFlag('${esc(r.id)}')">Reviewed - no action</button>
        <button class="btn-xs danger" onclick="pauseFromReview('${esc(r.mentorship_id)}','${esc(r.id)}')">Pause this mentorship</button>
      </div>
    </div>`;
  }).join('');
}

async function clearFlag(messageId) {
  const { error } = await sb.from('mentor_messages')
    .update({ reviewed_at: new Date().toISOString(), reviewed_by: currentUser.id })
    .eq('id', messageId);
  if (error) { alert('Could not record the review: ' + error.message); return; }
  await loadReviewQueue();
  await refreshReviewBadge();
}
window.clearFlag = clearFlag;

async function pauseFromReview(mentorshipId, messageId) {
  const note = prompt('Pausing closes the channel immediately. The transcript is kept.\n\nWhy are you pausing it?');
  if (note === null) return;

  const { error } = await sb.from('mentorships')
    .update({ status: 'paused', closed_reason: note || 'Paused after message review' })
    .eq('id', mentorshipId);
  if (error) { alert('Could not pause: ' + error.message); return; }

  await sb.from('mentor_messages')
    .update({ reviewed_at: new Date().toISOString(), reviewed_by: currentUser.id, review_note: note })
    .eq('id', messageId);

  await loadReviewQueue();
  await refreshReviewBadge();
  await loadMentors();
}
window.pauseFromReview = pauseFromReview;


/* ══════════════════════════════════════════════════════════════════
   CONVERSATIONS

   Every mentor-student pair in one place, each collapsed to a summary
   until opened. Supervision that requires hunting through five screens
   does not get done, so this is deliberately the shortest path from
   "who is talking" to "what did they say".

   Transcripts load only when a row is opened. There is no reason to
   pull every message on the platform to render a list of names.
   ══════════════════════════════════════════════════════════════════ */

let allConvos = [];
const convoOpen  = new Set();   // ids currently expanded
const convoCache = new Map();   // id -> rendered transcript HTML

const SEV_LABEL = {
  0: '', 1: 'Low', 2: 'Concerning', 3: 'Serious', 4: 'Urgent', 5: 'Urgent',
};

async function loadConvos() {
  if (!sb) { fgEmpty('convoList', 'Connect Supabase to see conversations.'); return; }
  return fgLoad('convoList',
    async () => {
      convoCache.clear();
      allConvos = fgRows(await sb.from('fg_conversation_index').select('*'));
      // Most recently active first; a pair with no messages sorts last
      // rather than to the top on a null date.
      allConvos.sort((a, b) => {
        const at = a.last_message_at ? Date.parse(a.last_message_at) : 0;
        const bt = b.last_message_at ? Date.parse(b.last_message_at) : 0;
        return bt - at;
      });
      return allConvos;
    },
    renderConvos,
    { empty: 'No mentor matches yet - check back later.' });
}
window.loadConvos = loadConvos;

function convoMatchesFilter(c, mode, q) {
  if (q) {
    const hay = [c.student_name, c.mentor_name, c.school].join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (mode === 'flagged') return c.flagged_count > 0;
  if (mode === 'active')  return c.status === 'active';
  if (mode === 'pending') return c.status !== 'active';
  if (mode === 'quiet')   return !c.message_count;
  return true;
}

function renderConvos() {
  const el = document.getElementById('convoList');
  if (!el) return;
  const q    = (document.getElementById('convoSearch')?.value || '').trim().toLowerCase();
  const mode = document.getElementById('convoFilter')?.value || 'all';
  const rows = allConvos.filter(c => convoMatchesFilter(c, mode, q));

  if (!rows.length) {
    fgEmpty(el, q || mode !== 'all'
      ? 'Nothing matches that filter.'
      : 'No mentor matches yet - check back later.');
    return;
  }

  el.innerHTML = rows.map(c => {
    const open    = convoOpen.has(c.id);
    const flagged = c.flagged_count > 0;
    const sev     = c.worst_severity || 0;
    const stripe  = !flagged ? 'var(--gray-200,#e2e6e2)'
                  : sev >= 4 ? '#dc2626'
                  : sev === 3 ? '#ea580c'
                  : '#f59e0b';
    const last = c.last_message_at
      ? new Date(c.last_message_at).toLocaleDateString()
      : 'never';

    return `<div class="card" style="margin:0 0 10px;border-left:3px solid ${stripe};">
      <div class="card-body" style="cursor:pointer;display:flex;gap:14px;align-items:center;flex-wrap:wrap;"
           onclick="toggleConvo('${esc(c.id)}')">
        <div style="flex:1;min-width:200px;">
          <div class="text-serif fw-600" style="font-size:.95rem;color:var(--g900);">
            ${esc(c.student_name)} <span class="text-muted" style="font-weight:400;">and</span> ${esc(c.mentor_name)}
          </div>
          <div class="text-xs text-muted" style="margin-top:2px;">
            ${esc(c.school || 'School not listed')}${c.topic ? ' · ' + esc(c.topic) : ''}
          </div>
        </div>
        <span class="chip chip-${c.status === 'active' ? 'active' : 'interest'}">${esc(c.status)}</span>
        ${!c.teacher_assigned ? '<span class="chip chip-interest" title="Nobody at the school can read this thread">No teacher</span>' : ''}
        <span class="text-xs text-muted" style="white-space:nowrap;">
          ${c.message_count || 0} message${c.message_count === 1 ? '' : 's'} · last ${last}
        </span>
        ${flagged ? `<span class="chip" style="background:${stripe};color:#fff;">${c.flagged_count} flagged${sev ? ' · ' + SEV_LABEL[sev] : ''}</span>` : ''}
        <span class="text-muted" style="font-size:1rem;width:14px;text-align:center;">${open ? '\u2212' : '+'}</span>
      </div>
      <div id="convo-${esc(c.id)}" style="display:${open ? 'block' : 'none'};border-top:1px solid var(--gray-100,#eef1ee);"></div>
    </div>`;
  }).join('');

  // Re-fill any thread that was open before the re-render.
  convoOpen.forEach(id => { if (rows.some(r => r.id === id)) loadConvoThread(id); });
}
window.renderConvos = renderConvos;

function toggleConvo(id) {
  if (convoOpen.has(id)) convoOpen.delete(id);
  else                   convoOpen.add(id);
  renderConvos();
}
window.toggleConvo = toggleConvo;

async function loadConvoThread(id) {
  const box = document.getElementById('convo-' + id);
  if (!box) return;
  if (box.dataset.loaded === '1') return;   // already filled this render
  box.dataset.loaded = '1';
  if (convoCache.has(id)) { box.innerHTML = convoCache.get(id); return; }
  fgSpinner(box);

  let msgs;
  try {
    msgs = fgRows(await sb.from('mentor_messages').select('*')
      .eq('mentorship_id', id).order('created_at', { ascending: true }));
  } catch (e) {
    fgError(box, () => { box.dataset.loaded = ''; loadConvoThread(id); });
    return;
  }

  if (!msgs.length) {
    fgEmpty(box, 'Nothing has been said in this channel yet.');
    return;
  }

  const html = `<div style="padding:14px 16px;max-height:460px;overflow-y:auto;">
    ${msgs.map(renderConvoMessage).join('')}
  </div>`;
  convoCache.set(id, html);
  box.innerHTML = html;
}

function renderConvoMessage(m) {
  const mentor  = m.sender_role === 'mentor';
  const detail  = Array.isArray(m.flag_detail) ? m.flag_detail : [];
  const reasons = Array.isArray(m.flag_reasons) ? m.flag_reasons : [];
  const sev     = m.flag_severity || 0;
  const tone    = sev >= 4 ? '#dc2626' : sev === 3 ? '#ea580c' : '#f59e0b';

  return `<div style="display:flex;flex-direction:column;align-items:${mentor ? 'flex-start' : 'flex-end'};margin-bottom:12px;">
    <div style="max-width:76%;padding:10px 13px;white-space:pre-wrap;line-height:1.55;font-size:.84rem;
                background:${mentor ? 'var(--gray-100,#eef1ee)' : 'var(--g600,#357a38)'};
                color:${mentor ? 'var(--gray-700,#3d453d)' : '#fff'};
                ${m.flagged ? 'border:1.5px solid ' + tone + ';' : ''}">${esc(m.body)}</div>
    <div class="text-xs text-muted" style="margin-top:3px;">
      ${esc(m.sender_name || m.sender_role)} · ${esc(m.sender_role)} · ${new Date(m.created_at).toLocaleString()}
      ${m.reviewed_at ? ' · <span style="color:var(--g600);">reviewed</span>' : ''}
    </div>
    ${m.flagged ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;justify-content:${mentor ? 'flex-start' : 'flex-end'};">
      ${(detail.length
          ? detail.map(d => `<span style="font-size:.64rem;padding:1px 7px;border:1px solid ${tone};color:${tone};">${esc(d.category)}: &ldquo;${esc(d.term)}&rdquo;</span>`)
          : reasons.map(r => `<span style="font-size:.64rem;padding:1px 7px;border:1px solid ${tone};color:${tone};">${esc(r)}</span>`)
        ).join('')}
    </div>` : ''}
  </div>`;
}
