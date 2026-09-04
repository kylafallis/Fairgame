/* ── Demo data ── */
const DEMO = {
  approvals: [
    { id:'a1', name:'Ms. Williams', email:'mwilliams@bath.edu', school:'Bath High School', type:'teacher',    status:'pending',  created_at:'2026-03-10T10:00:00Z' },
    { id:'a2', name:'Priya Sharma', email:'priya@walnut.edu',  school:'Walnut Hills HS',  type:'ambassador', status:'interest', created_at:'2026-03-12T14:30:00Z' },
    { id:'a3', name:'Mr. Davis',    email:'tdavis@lima.edu',   school:'Lima Senior HS',   type:'teacher',    status:'active',   created_at:'2026-03-01T09:00:00Z' },
    { id:'a4', name:'Jordan Lee',   email:'jordan@school.edu', school:'Sacramento High School', type:'student_mentor_request', status:'pending', created_at:'2026-03-14T16:00:00Z',
      data:{ grade:'11th', state:'Sacramento, CA', title:'Low-cost water quality biosensor', topics:['Environmental Science','Chemistry / Biochemistry'] } },
    { id:'a5', name:'Dr. Sarah Chen', email:'schen@example.com', school:'',                 type:'mentor',      status:'active',   created_at:'2026-02-18T11:00:00Z' },
    { id:'a6', name:'Alex Rivera',   email:'alex@school.edu',   school:'Bath High School',  type:'student_mentor_request', status:'active', created_at:'2026-02-20T13:00:00Z',
      data:{ grade:'10th', state:'Columbus, OH', title:'Soil pH and crop yield', topics:['Biology / Life Sciences'] } },
  ],
  schools: [
    { school_name:'Bath High School',    teacher_name:'Ms. Williams', program_type:'School fair only', fair_date:'2026-03-14', student_count:35, county:'Allen County',    status:'planning' },
    { school_name:'Lima Senior HS',      teacher_name:'Mr. Davis',    program_type:'OAS District fair', fair_date:'2026-03-21', student_count:55, county:'Allen County',    status:'active'   },
    { school_name:'Linden-McKinley STEM',teacher_name:'Mr. Jones',    program_type:'Club Launch',       fair_date:null,        student_count:20, county:'Franklin County', status:'planning' },
  ],
  judges: [
    { code:'EN-163-7X', name:'Dr. Robert Davis', expertise:['Environmental Science'], city:'Lima, Allen County',      available_level:'Any level',  status:'active' },
    { code:'BI-163-K2', name:'Dr. Laura Chen',   expertise:['Biology'],               city:'Lima, Allen County',      available_level:'School fair', status:'unverified' },
    { code:'CH-489-Q5', name:'Mark Thompson',    expertise:['Chemistry'],             city:'Columbus, Franklin County',available_level:'District fair',status:'active' },
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

function approvalEmailFor(type, name) {
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

function buildMailto(email, type, name) {
  const m = approvalEmailFor(type, name);
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

function approvalMsg(html, type) {
  const el = document.getElementById('approvalsMsg');
  if (!el) return;
  el.innerHTML = html;
  el.className = 'msg-strip show ' + (type || 'ok');
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
  onSectionLoad('mentors',   loadMentors);
  onSectionLoad('review',    loadReviewQueue);
  refreshReviewBadge();
  onSectionLoad('settings',  loadStats);
});

async function loadAllData() {
  if (!sb) {
    document.getElementById('kSchools').textContent    = DEMO.schools.filter(s=>s.status==='active').length;
    document.getElementById('kPending').textContent    = DEMO.approvals.filter(a=>a.status==='pending').length;
    document.getElementById('kJudges').textContent     = DEMO.judges.length;
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
    const p = pending||0;
    const badge = document.getElementById('approvalBadge');
    if (p > 0) { badge.textContent = p; badge.style.display = 'inline-block'; setAlert(`${p} pending approval${p>1?'s':''}.`, 'approvals'); }
  }
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
        const row = `<tr>
        <td class="col-name">${esc(a.name)}</td>
        <td class="col-sm">${esc(a.email)}</td>
        <td class="col-sm">${esc(a.school)}</td>
        <td><span class="chip chip-interest">${esc(a.type)}</span></td>
        <td class="col-sm">${new Date(a.created_at).toLocaleDateString()}</td>
        <td><span class="chip chip-${esc(a.status)}">${esc(a.status)}</span></td>
        <td style="white-space:nowrap;display:flex;gap:6px;">
          ${a.status==='pending'||a.status==='interest' ? `<button class="btn-xs approve" onclick="approveUser('${esc(a.id)}')">Approve</button>` : ''}
          <button class="btn-xs danger" onclick="rejectUser('${esc(a.id)}')">Reject</button>
        </td>
      </tr>`;
        if (a.type !== 'student_mentor_request') return row;

        const topics  = a.data?.topics || [];
        const matches = matchMentorsForTopics(topics);
        const pairUrl = `/mentorlog.html?student=${encodeURIComponent(a.name||'')}&email=${encodeURIComponent(a.email||'')}&school=${encodeURIComponent(a.school||'')}&topic=${encodeURIComponent(a.data?.title || topics.join(', '))}`;
        const detail = `<tr class="row-detail">
        <td colspan="7" style="background:var(--g50,#f7faf7);padding:10px 16px;font-size:.8rem;color:var(--gray-600);">
          <strong>Topics:</strong> ${topics.map(esc).join(', ') || '–'}
          &nbsp;&middot;&nbsp;
          <strong>Suggested mentors:</strong> ${matches.length ? matches.map(m => esc(m.name) + (m.email ? ' ('+esc(m.email)+')' : '')).join(', ') : 'No overlap found yet - check the mentor list manually.'}
          &nbsp;&middot;&nbsp;
          <a href="${pairUrl}" class="btn-xs" style="text-decoration:none;">Create Pair in Mentor Log →</a>
        </td>
      </tr>`;
        return row + detail;
      }).join('');
}

async function approveUser(id) {
  const rec = allApprovals.find(a => String(a.id) === String(id));
  if (!rec) return;
  const { email, type, name } = rec;
  const confirmMsg = type === 'student_mentor_request'
    ? `Mark ${email}'s mentor request as matched? This sends them a confirmation email.`
    : `Approve ${email} as ${type}? They will be able to sign in immediately.`;
  if (!confirm(confirmMsg)) return;

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

  await loadApprovals();
  await loadAllData();
}
async function rejectUser(id) {
  if (!confirm('Reject this request?')) return;
  if (sb) {
    const { error } = await sb.from('portal_requests').update({ status:'rejected' }).eq('id', id);
    if (error) { approvalMsg('Could not reject - ' + esc(error.message), 'err'); return; }
  }
  approvalMsg('Request rejected. No email was sent.', 'ok');
  await loadApprovals();
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

async function loadJudges() {
  return fgLoad('judgesTbody',
    async () => sb ? fgRows(await sb.from('judges').select('*').order('created_at',{ascending:false})) : DEMO.judges,
    renderJudges,
    { empty: 'No judges yet - check back later.' });
}

function renderJudges(data) {
  document.getElementById('judgesTbody').innerHTML = data.map(j => `<tr>
        <td class="col-mono">${j.code||'–'}</td>
        <td class="col-name">${j.name}</td>
        <td class="col-sm">${(j.expertise||[]).join(', ')}</td>
        <td class="col-sm">${j.city||'–'}</td>
        <td class="col-sm">${j.available_level||'–'}</td>
        <td><span class="chip chip-${j.status}">${j.status}</span></td>
        <td style="white-space:nowrap;">
          ${j.status==='unverified' ? `<button class="btn-xs approve" onclick="verifyJudge('${j.id}')">Verify</button>` : ''}
          <button class="btn-xs danger" onclick="deactivateJudge('${j.id}')">Deactivate</button>
        </td>
      </tr>`).join('');
}
async function verifyJudge(id) {
  if (sb) await sb.from('judges').update({ status:'active' }).eq('id', id);
  await loadJudges();
}
async function deactivateJudge(id) {
  if (!confirm('Deactivate this judge?')) return;
  if (sb) await sb.from('judges').update({ status:'inactive' }).eq('id', id);
  await loadJudges();
}
window.verifyJudge = verifyJudge; window.deactivateJudge = deactivateJudge;

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

const STAT_KEYS   = ['schools_supported','students_reached','resources_count','teachers_network'];
const STAT_LABELS = ['Schools Supported','Students Reached','Free Resources','Teacher Network'];
async function loadStats() {
  let vals = { schools_supported:4, students_reached:500, resources_count:47, teachers_network:100 };
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

const FLAG_LABELS = {
  email_address:         'Shared an email address',
  phone_number:          'Shared a phone number',
  social_platform:       'Mentioned a social platform',
  external_meeting_link: 'External meeting link',
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
