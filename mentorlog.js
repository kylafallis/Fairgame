let allPairs = [], currentPairId = null, currentMilestones = {};

const DEMO_PAIRS = [
  { id:'p1', student_name:'Rishi Pampati', mentor_name:'Kyla Fallis', school:'Walnut Hills HS', topic:'Environmental monitoring using biosensors', status:'active',  total_hours:6.5,  session_count:4, started_at:'2025-11-01', milestones:{ topic:true, proposal:true, design:true, data:false, board:false, competed:false } },
  { id:'p2', student_name:'Aisha Williams', mentor_name:'Dr. Chen', school:'Linden-McKinley STEM', topic:'ML classification of water quality samples', status:'active', total_hours:3.0, session_count:2, started_at:'2025-12-10', milestones:{ topic:true, proposal:true, design:false, data:false, board:false, competed:false } },
  { id:'p3', student_name:'Marcus Johnson',  mentor_name:'Dr. Santos', school:'Bath High School', topic:'Effect of soil pH on soybean yield', status:'active', total_hours:4.0, session_count:3, started_at:'2025-11-15', milestones:{ topic:true, proposal:false, design:false, data:false, board:false, competed:false } },
];
const DEMO_SESSIONS = {
  p1: [
    { date:'2025-11-08', hours:2.0, notes:'Introduced the scientific method. Helped Rishi narrow topic from general water quality to biosensor detection. Assigned: write hypothesis and list three variables.' },
    { date:'2025-11-22', hours:1.5, notes:'Reviewed hypothesis - good! Discussed experimental design. Controls need work. Identified local creek as test site. Assigned: write full procedure.' },
    { date:'2025-12-06', hours:1.5, notes:'Procedure looks solid. Talked about data collection tables and statistical analysis. Rishi starting field collection next week. Looking strong for district.' },
    { date:'2026-01-10', hours:1.5, notes:'Data collection going well, unexpected pH reading on sample 3 - discussed how to handle outliers honestly. Displaying raw data correctly. On track.' },
  ],
};

async function loadPairs() {
  if (!sb) { allPairs = DEMO_PAIRS; renderPairList(); return; }
  const list = document.getElementById('pairList');
  fgSpinner(list);
  try {
    allPairs = fgRows(await sb.from('mentorships').select('*').order('created_at', { ascending: false }));
  } catch (e) {
    console.warn('[Mentorlog] pair read failed:', e.message);
    allPairs = [];
    fgError(list, loadPairs);
    return;
  }
  renderPairList();
}
window.loadPairs = loadPairs;

function renderPairList() {
  const list = document.getElementById('pairList');
  if (!allPairs.length) { fgEmpty(list, 'No matches yet - check back later, or create the first one above.'); return; }
  list.innerHTML = allPairs.map(p => `
    <div class="pair-item ${p.id === currentPairId ? 'active' : ''}" onclick="selectPair('${p.id}')">
      <div class="pair-names">${p.student_name} + ${p.mentor_name}</div>
      <div class="pair-school">${p.school || '–'}</div>
      <div class="pair-meta">
        <span class="pair-status ${p.status}">${p.status}</span>
        <span class="pair-hours">${p.total_hours || 0} hrs · ${p.session_count || 0} sessions</span>
      </div>
      ${p.status === 'active' ? '' : `
      <button class="btn-xs" style="margin-top:7px;width:100%;"
              onclick="event.stopPropagation();openGatesFor('${p.id}')">
        See what is blocking this →
      </button>`}
    </div>`).join('');
}

async function selectPair(id) {
  currentPairId = id;
  const pair = allPairs.find(p => p.id === id);
  if (!pair) return;
  renderPairList();
  document.getElementById('logEmpty').style.display  = 'none';
  document.getElementById('logDetail').style.display = 'flex';
  document.getElementById('logDetail').classList.add('active');
  document.getElementById('detailTitle').textContent    = `${pair.student_name} + ${pair.mentor_name}`;
  document.getElementById('detailSubtitle').textContent = `${pair.school || 'School not listed'} · ${pair.topic || 'No topic set'}`;
  document.getElementById('metaHours').textContent    = (pair.total_hours || 0).toFixed(1);
  document.getElementById('metaSessions').textContent = pair.session_count || 0;
  document.getElementById('metaStarted').textContent  = pair.started_at ? new Date(pair.started_at).toLocaleDateString('en-US', { month:'short', year:'numeric' }) : '–';

  // Milestones
  currentMilestones = pair.milestones || {};
  document.querySelectorAll('.milestone-step').forEach(el => {
    el.classList.toggle('done', !!currentMilestones[el.dataset.milestone]);
  });

  // Sessions
  await loadSessions(id);
}
window.selectPair = selectPair;

async function loadSessions(pairId) {
  if (!sb) { renderSessions(DEMO_SESSIONS[pairId] || []); return; }
  const list = document.getElementById('sessionList');
  fgSpinner(list);
  try {
    renderSessions(fgRows(await sb.from('mentorship_sessions').select('*').eq('pair_id', pairId).order('date', { ascending: false })));
  } catch (e) {
    console.warn('[Mentorlog] session read failed:', e.message);
    fgError(list, () => loadSessions(pairId));
  }
}

function renderSessions(sessions) {
  const list = document.getElementById('sessionList');
  if (!sessions.length) { fgEmpty(list, 'No sessions logged yet - check back later.'); return; }
  list.innerHTML = sessions.map(s => `
    <div class="session-item">
      <div class="session-date">${new Date(s.date + 'T00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}</div>
      <div class="session-notes">${s.notes || '–'}</div>
      <div class="session-hours">${s.hours}h</div>
    </div>`).join('');
}

async function toggleMilestone(el) {
  const key = el.dataset.milestone;
  currentMilestones[key] = !currentMilestones[key];
  el.classList.toggle('done', currentMilestones[key]);
  if (sb && currentPairId) {
    await sb.from('mentorships').update({ milestones: currentMilestones }).eq('id', currentPairId);
  }
}
window.toggleMilestone = toggleMilestone;

async function logSession() {
  const date  = document.getElementById('newSessionDate').value;
  const hours = parseFloat(document.getElementById('newSessionHours').value);
  const notes = document.getElementById('newSessionNotes').value.trim();
  const msg   = document.getElementById('sessionMsg');
  if (!date || !hours || !notes) { msg.textContent = 'Please fill in date, hours, and notes.'; msg.style.color = '#c0392b'; return; }

  msg.textContent = 'Saving...'; msg.style.color = 'var(--gray-500)';

  if (sb && currentPairId) {
    const { error: sErr } = await sb.from('mentorship_sessions').insert([{ pair_id: currentPairId, date, hours, notes }]);
    if (sErr) { msg.textContent = sErr.message; msg.style.color = '#c0392b'; return; }
    // total_hours, session_count and last_session are recomputed from the
    // sessions table by a trigger. Writing them here as well would
    // overwrite the correct sum with a stale one.
  }

  msg.textContent = 'Session saved!'; msg.style.color = 'var(--green-600)';
  document.getElementById('newSessionDate').value  = '';
  document.getElementById('newSessionHours').value = '';
  document.getElementById('newSessionNotes').value = '';
  await loadPairs();
  await selectPair(currentPairId);
  setTimeout(() => { msg.textContent = ''; }, 3000);
}
window.logSession = logSession;

function openAddPair()  { document.getElementById('addPairModal').classList.add('open'); }
function closeAddPair() { document.getElementById('addPairModal').classList.remove('open'); }
window.openAddPair  = openAddPair;
window.closeAddPair = closeAddPair;

async function createPair() {
  const studentName  = document.getElementById('pStudentName').value.trim();
  const studentEmail = document.getElementById('pStudentEmail').value.trim();
  const mentorName   = document.getElementById('pMentorName').value.trim();
  const mentorEmail  = document.getElementById('pMentorEmail').value.trim();
  const school       = document.getElementById('pSchool').value.trim();
  const topic        = document.getElementById('pTopic').value.trim();
  const msg          = document.getElementById('pairMsg');

  if (!studentName || !mentorName) { msg.textContent = 'Student and mentor names required.'; msg.style.color = '#c0392b'; return; }
  msg.textContent = 'Creating...'; msg.style.color = 'var(--gray-500)';

  // 'pending', never 'active'. A hand-entered pair has passed none of
  // the four gates, and marking it active would show both people an
  // "Open messages" button over a channel the database will refuse to
  // let them write to. The gate report below is the way it opens.
  const newPair = {
    student_name: studentName, student_email: studentEmail,
    mentor_name: mentorName,   mentor_email: mentorEmail,
    school, topic, status: 'pending',
    total_hours: 0, session_count: 0,
    started_at: new Date().toISOString().split('T')[0],
    milestones: {}
  };

  let newId = null;
  if (sb) {
    const { data, error } = await sb.from('mentorships').insert([newPair]).select('id').maybeSingle();
    if (error) { msg.textContent = error.message; msg.style.color = '#c0392b'; return; }
    newId = data?.id || null;
    // The insert carries emails only; this resolves them to accounts.
    if (newId) { try { await sb.rpc('fg_link_mentorship_accounts', { p_id: newId }); } catch (e) {} }
  } else {
    newPair.id = 'local_' + Date.now();
    allPairs.unshift(newPair);
  }

  msg.textContent = 'Pair created.'; msg.style.color = 'var(--green-600)';
  await loadPairs();
  setTimeout(() => {
    closeAddPair();
    msg.textContent = '';
    // Straight to the gates, so it is immediately obvious that creating
    // the pair is not the same as letting them talk.
    if (newId) openGatesFor(newId);
  }, 1200);
}
window.createPair = createPair;

function prefillFromQuery() {
  const q = new URLSearchParams(window.location.search);
  if (!q.has('student')) return;
  document.getElementById('pStudentName').value  = q.get('student')  || '';
  document.getElementById('pStudentEmail').value = q.get('email')    || '';
  document.getElementById('pSchool').value       = q.get('school')   || '';
  document.getElementById('pTopic').value        = q.get('topic')    || '';
  openAddPair();
}

requireAuth('admin', () => { loadPairs(); prefillFromQuery(); });

/* ══════════════════════════════════════════════════════════════════
   MATCH FINDER

   Replaces retyping names into a blank form. Step 1 lists the student
   requests that are actually waiting; step 2 asks the database to rank
   approved mentors against the one you picked and shows why each
   scored what it did; step 3 reports which of the four safety gates
   are still open, because creating a match and letting two people talk
   are deliberately not the same action.
   ══════════════════════════════════════════════════════════════════ */

let matchStep = 1;
let selectedRequest = null;
let createdMentorshipId = null;
let lastCandidates = [];

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function openMatchFinder() {
  document.getElementById('matchModal').classList.add('open');
  gotoMatchStep(1);
  loadOpenRequests();
}
window.openMatchFinder = openMatchFinder;

function closeMatchFinder() {
  document.getElementById('matchModal').classList.remove('open');
  document.getElementById('matchMsg').textContent = '';
  selectedRequest = null;
  createdMentorshipId = null;
  lastCandidates = [];
}
window.closeMatchFinder = closeMatchFinder;

function gotoMatchStep(n) {
  matchStep = n;
  [1, 2, 3].forEach(i => {
    document.getElementById('matchStep' + i).classList.toggle('active', i === n);
    document.getElementById('rail' + i).classList.toggle('on', i === n);
  });
  document.getElementById('matchBackBtn').style.display   = n === 2 ? 'inline-block' : 'none';
  document.getElementById('matchManualBtn').style.display = n === 3 ? 'none' : 'inline-block';
  const titles = {
    1: ['Find a Mentor Match', 'Pick the student whose request you are filling.'],
    2: ['Ranked Mentors', 'Scored on field overlap, format fit, and current load. Every score shows its reasoning.'],
    3: ['Before They Can Talk', 'The match exists. The channel stays closed until all four gates pass.'],
  };
  document.getElementById('matchTitle').textContent    = titles[n][0];
  document.getElementById('matchSubtitle').textContent = titles[n][1];
}

function matchBack() { gotoMatchStep(1); }
window.matchBack = matchBack;

/* ── Step 1: student requests still waiting on a mentor ── */
async function loadOpenRequests() {
  if (!sb) { fgEmpty('requestList', 'Connect Supabase to load student requests.'); return; }
  return fgLoad('requestList',
    async () => {
      const queued = fgRows(await sb.from('portal_requests')
        .select('*')
        .eq('type', 'student_mentor_request')
        .in('status', ['pending', 'active'])
        .order('created_at', { ascending: true }));

      // Registered students with no request on file. Signing up and
      // asking for a mentor were separate acts, so a student could do
      // the first and wait forever without ever reaching this screen.
      let unqueued = [];
      try {
        const { data, error } = await sb.rpc('fg_students_without_request');
        if (!error) unqueued = data || [];
      } catch (_) { /* migration 10 not applied yet */ }

      return (queued.length || unqueued.length) ? { queued, unqueued } : [];
    },
    renderOpenRequests,
    { empty: 'Nobody is waiting for a mentor - check back later.' });
}

function renderOpenRequests(groups) {
  const { queued = [], unqueued = [] } = groups;
  const parts = [];

  if (queued.length) {
    parts.push('<div class="req-group-head">In the queue</div>' + queued.map(requestItemHTML).join(''));
  }

  if (unqueued.length) {
    parts.push(
      '<div class="req-group-head">Registered, but never asked for a mentor</div>' +
      '<p class="req-group-note">These students have accounts but no request on file, so the matcher cannot see them. ' +
      'Adding one puts them in the queue - it does not match or contact anyone.</p>' +
      unqueued.map(u => `<div class="req-item req-item-quiet">
        <div class="req-name">${esc(u.full_name || u.email)}</div>
        <div class="req-meta">${esc(u.email)}${u.school ? ' &middot; ' + esc(u.school) : ''}${u.grade ? ' &middot; ' + esc(u.grade) : ''} &middot; registered ${new Date(u.registered_at).toLocaleDateString()}</div>
        ${u.project_title ? `<div class="req-topics">${esc(u.project_title)}${u.project_field ? ' &middot; ' + esc(u.project_field) : ''}</div>`
                          : '<div class="req-meta" style="font-style:italic;">No project filled in yet - the match will be weaker without one.</div>'}
        <button class="btn-xs" style="margin-top:8px;" onclick="queueStudent('${esc(u.user_id)}')">Add to the queue →</button>
      </div>`).join(''));
  }

  document.getElementById('requestList').innerHTML = parts.join('');
}

/* Raises the request the matcher reads, on the student's behalf. */
async function queueStudent(userId) {
  const msg = document.getElementById('matchMsg');
  msg.textContent = 'Adding…'; msg.style.color = 'var(--gray-500)';
  const { error } = await sb.rpc('fg_create_student_request', { p_user_id: userId });
  if (error) { msg.textContent = error.message; msg.style.color = '#c0392b'; return; }
  msg.textContent = '';
  await loadOpenRequests();
}
window.queueStudent = queueStudent;

function requestItemHTML(r) {
  const d = r.data || {};
  const topics = Array.isArray(d.topics) ? d.topics : [];
  // Oldest first, and the wait is shown, because a student who
  // applied five weeks ago should not be buried under a new one.
  const waited = Math.floor((Date.now() - new Date(r.created_at)) / 86400000);
  return `<div class="req-item" onclick="pickRequest('${esc(r.id)}')">
    <div class="req-name">${esc(r.name)}</div>
    <div class="req-meta">${esc(r.school || 'School not given')} &middot; ${esc(d.grade || '-')} &middot; ${esc(d.format || 'Format not set')} &middot; waiting ${waited} day${waited === 1 ? '' : 's'}</div>
    ${topics.length ? `<div class="req-topics">${topics.map(esc).join(' &middot; ')}</div>` : ''}
    ${d.title ? `<div class="req-meta" style="font-style:italic;margin-top:4px;">${esc(d.title)}</div>` : ''}
  </div>`;
}

async function pickRequest(id) {
  const { data } = await sb.from('portal_requests').select('*').eq('id', id).maybeSingle();
  selectedRequest = data;
  gotoMatchStep(2);
  loadCandidates(id);
}
window.pickRequest = pickRequest;

/* ── Step 2: ranked mentors, straight from fg_suggest_mentor_matches ── */
async function loadCandidates(requestId) {
  return fgLoad('candidateList',
    async () => {
      const { data, error } = await sb.rpc('fg_suggest_mentor_matches', {
        p_student_request_id: requestId, p_limit: 10
      });
      if (error) throw new Error(error.message);
      lastCandidates = data || [];
      return lastCandidates;
    },
    renderCandidates,
    { empty: 'No approved mentor overlaps this student’s topics yet. Approve more mentors, or enter the match manually.' });
}

function renderCandidates(cands) {
  document.getElementById('candidateList').innerHTML = cands.map((c, i) => {
    const reasons = Array.isArray(c.reasons) ? c.reasons : [];
    const bio = String(c.mentor_bio || '');
    return `<div class="cand">
      <div class="cand-score">
        <div class="cand-score-n">${c.score}</div>
        <div class="cand-score-l">score</div>
      </div>
      <div class="cand-main">
        <div class="cand-name">${esc(c.mentor_name)}</div>
        <div class="cand-sub">${esc(c.mentor_field || 'Field not given')} &middot; ${esc(c.mentor_format || 'Format not set')} &middot; ${esc(c.mentor_hours || '?')} hrs/mo</div>
        ${bio ? `<div class="cand-bio">${esc(bio.slice(0, 220))}${bio.length > 220 ? '…' : ''}</div>` : ''}
        <div class="cand-reasons">
          ${reasons.map(r => `<span class="cand-reason${/MISMATCH|Already mentoring/i.test(r) ? ' warn' : ''}">${esc(r)}</span>`).join('')}
        </div>
      </div>
      <div style="flex-shrink:0;">
        <button class="btn btn-primary" style="font-size:0.76rem;padding:7px 13px;white-space:nowrap;"
                onclick="createMatch(${i})">Match &rarr;</button>
      </div>
    </div>`;
  }).join('');
}

/* ── Create the match. It lands as 'pending' by design - see step 3. ── */
async function createMatch(index) {
  const c = lastCandidates[index];
  if (!c) return;
  const msg = document.getElementById('matchMsg');
  msg.textContent = 'Creating match…'; msg.style.color = 'var(--gray-500)';

  const { data, error } = await sb.rpc('fg_create_mentorship', {
    p_student_request_id: selectedRequest.id,
    p_mentor_request_id:  c.mentor_request_id,
    p_score:              c.score,
    p_reasons:            Array.isArray(c.reasons) ? c.reasons : [],
  });

  if (error) { msg.textContent = error.message; msg.style.color = '#c0392b'; return; }

  createdMentorshipId = data;
  msg.textContent = '';
  gotoMatchStep(3);
  await loadGateReport(data);
  await loadPairs();
}
window.createMatch = createMatch;

/* ── Step 3: the four gates, and what is still missing ── */
async function loadGateReport(mentorshipId) {
  const el = document.getElementById('gateReport');
  fgSpinner(el);

  let m = null, consent = null;
  try {
    m = (await sb.from('mentorships').select('*').eq('id', mentorshipId).maybeSingle()).data;
    if (m && m.consent_id) {
      consent = (await sb.from('guardian_consents').select('*').eq('id', m.consent_id).maybeSingle()).data;
    }
  } catch (e) {
    fgError(el, () => loadGateReport(mentorshipId));
    return;
  }
  if (!m) { fgEmpty(el, 'Match created, but it could not be read back.'); return; }

  const consentOk = !!consent && !!consent.signed_at && !consent.revoked_at &&
                    (!consent.expires_at || new Date(consent.expires_at) > new Date());

  const gates = [
    { ok: true, // fg_create_mentorship refuses a mentor who is not approved
      label: 'Mentor approved',
      detail: `${m.mentor_name} was reviewed and approved by a person.` },

    { ok: !!m.student_user_id && !!m.mentor_user_id,
      label: 'Both have accounts',
      detail: (m.student_user_id && m.mentor_user_id)
        ? 'Both sign in and can see this match.'
        : `Waiting on an account for ${!m.student_user_id ? m.student_name : m.mentor_name}. A channel neither party can read is not a channel.`,
      action: (m.student_user_id && m.mentor_user_id) ? null
        : { label: 'Re-check accounts', fn: `relinkAccounts('${esc(mentorshipId)}')` } },

    { ok: !!m.mentor_attested_at,
      label: 'Conduct policy signed',
      detail: m.mentor_attested_at
        ? `Signed ${new Date(m.mentor_attested_at).toLocaleDateString()}.`
        : 'The mentor signs this themselves in their portal. It covers every student they mentor, so they are only asked once.' },

    { ok: !!m.background_check_on_file,
      label: 'Background check on file',
      detail: m.background_check_on_file
        ? 'On file.'
        : 'No check recorded. Record it only once a real check has actually been run - the reference is stored with your name against it.',
      action: m.background_check_on_file ? null
        : { label: 'Record a check', fn: `recordCheck('${esc(mentorshipId)}')` } },

    { ok: consentOk,
      label: 'Guardian consent',
      detail: consentOk
        ? `Signed by ${consent.guardian_name} on ${new Date(consent.signed_at).toLocaleDateString()}.`
        : (consent && consent.revoked_at)
          ? 'Consent was withdrawn by the guardian. It cannot be reinstated here - send a fresh request.'
          : 'No signed consent for this student. Send the guardian a signing link.',
      action: consentOk ? null
        : { label: 'Send consent link', fn: `sendConsent('${esc(mentorshipId)}')` } },

    { ok: !!m.supervising_teacher_id,
      label: 'Supervising teacher assigned',
      detail: m.supervising_teacher_id
        ? 'A teacher can read this thread.'
        : 'No teacher is assigned. FairGame admins can still read every message, but nobody at the school can. Strongly advised, not enforced.',
      action: m.supervising_teacher_id ? null
        : { label: 'Assign a teacher', fn: `assignTeacher('${esc(mentorshipId)}')` } },
  ];

  // The first five block the channel. The teacher assignment is
  // strongly advised but not enforced, and is shown as such.
  const blocking = gates.slice(0, 5).filter(g => !g.ok).length;

  el.innerHTML = `
    <div style="font-size:0.86rem;color:var(--gray-700);line-height:1.6;">
      <strong style="color:var(--green-900);">${esc(m.student_name)} + ${esc(m.mentor_name)}</strong> is recorded as a match.
      Its status is <strong>pending</strong>: no message can pass between them yet.
    </div>
    <ul class="gate-list">
      ${gates.map(g => `<li>
        <span class="gate-mark ${g.ok ? 'done' : 'todo'}">${g.ok ? '✓' : '!'}</span>
        <span class="gate-text"><strong>${g.label}</strong> — ${esc(g.detail)}
          ${g.action ? `<button class="btn-xs" style="margin-left:6px;" onclick="${g.action.fn}">${g.action.label}</button>` : ''}
        </span>
      </li>`).join('')}
    </ul>
    <div style="margin-top:16px;">
      ${blocking === 0
        ? `<button class="btn btn-primary" onclick="activateChannel('${esc(mentorshipId)}')">Open the mentoring channel &rarr;</button>
           <div style="font-size:0.76rem;color:var(--gray-500);margin-top:7px;">Both of them will be told that every message is visible to FairGame staff and to the student's teacher.</div>`
        : `<div style="background:#fff8e1;border:1.5px solid #f59e0b;padding:12px 14px;font-size:0.82rem;color:#78350f;line-height:1.55;">
             <strong>${blocking} gate${blocking === 1 ? '' : 's'} still open.</strong>
             The channel stays closed until they pass. This is enforced in the database, so it cannot be clicked past.
           </div>`}
    </div>`;
}

async function activateChannel(mentorshipId) {
  const msg = document.getElementById('matchMsg');
  msg.textContent = 'Opening…'; msg.style.color = 'var(--gray-500)';
  const { data, error } = await sb.rpc('fg_activate_mentorship', { p_id: mentorshipId });
  if (error)                 { msg.textContent = error.message; msg.style.color = '#c0392b'; return; }
  if (data && data !== 'OK') { msg.textContent = data;          msg.style.color = '#c0392b'; return; }
  msg.textContent = 'Channel open.'; msg.style.color = 'var(--green-600)';
  await loadPairs();
  await loadGateReport(mentorshipId);
}
window.activateChannel = activateChannel;


/* ══════════════════════════════════════════════════════════════════
   GATE ACTIONS

   Each open gate has one button, and the button does the one thing that
   closes that gate. Nothing here can force a channel open - every one
   of these writes a fact, and fg_activate_mentorship re-checks all of
   them independently before it will open anything.
   ══════════════════════════════════════════════════════════════════ */

/* Someone may have created their account since the match was made. */
async function relinkAccounts(mentorshipId) {
  const msg = document.getElementById('matchMsg');
  msg.textContent = 'Checking…'; msg.style.color = 'var(--gray-500)';
  const { error } = await sb.rpc('fg_link_mentorship_accounts', { p_id: mentorshipId });
  if (error) { msg.textContent = error.message; msg.style.color = '#c0392b'; return; }
  msg.textContent = '';
  await loadGateReport(mentorshipId);
}
window.relinkAccounts = relinkAccounts;

/* The reference is required by the database, not just by this form. A
   check with no reference is not a check anyone could later verify. */
async function recordCheck(mentorshipId) {
  const ref = prompt(
    'Record a completed background check.\n\n' +
    'Only do this once a real check has been run and filed. Enter a reference ' +
    'that identifies it - the vendor and date, or your internal file number.\n\n' +
    'This is stored with your name and the time against it.');
  if (ref === null) return;
  if (!ref.trim()) { alert('A reference is required.'); return; }

  const msg = document.getElementById('matchMsg');
  msg.textContent = 'Recording…'; msg.style.color = 'var(--gray-500)';
  const { error } = await sb.rpc('fg_record_background_check', {
    p_mentorship_id: mentorshipId, p_reference: ref.trim(), p_on_file: true
  });
  if (error) { msg.textContent = error.message; msg.style.color = '#c0392b'; return; }
  msg.textContent = '';
  await loadGateReport(mentorshipId);
}
window.recordCheck = recordCheck;

/* Creates the consent row and hands back the signing link. The link is
   shown rather than emailed automatically, so the admin sees exactly
   what the guardian will receive before it goes out. */
async function sendConsent(mentorshipId) {
  const m = allPairs.find(p => p.id === mentorshipId)
         || (await sb.from('mentorships').select('*').eq('id', mentorshipId).maybeSingle()).data;
  if (!m) return;

  const gName = prompt('Guardian\u2019s full name (for ' + m.student_name + '):');
  if (gName === null) return;
  const gEmail = prompt('Guardian\u2019s email address:');
  if (gEmail === null) return;
  if (!gName.trim() || !gEmail.trim()) { alert('Both a name and an email are needed.'); return; }

  const msg = document.getElementById('matchMsg');
  msg.textContent = 'Creating the link…'; msg.style.color = 'var(--gray-500)';

  const { data: consentId, error } = await sb.rpc('fg_request_consent', {
    p_student_request_id: m.student_request_id,
    p_guardian_name:  gName.trim(),
    p_guardian_email: gEmail.trim(),
    p_mentor_name:    m.mentor_name,
  });
  if (error) { msg.textContent = error.message; msg.style.color = '#c0392b'; return; }

  const { data: row } = await sb.from('guardian_consents')
    .select('token').eq('id', consentId).maybeSingle();
  if (!row?.token) { msg.textContent = 'Created, but the link could not be read back.'; msg.style.color = '#c0392b'; return; }

  const link = location.origin + '/consent.html?t=' + row.token;
  msg.textContent = '';
  // Redraw first, then append. loadGateReport replaces the container's
  // contents, so appending before it would wipe the link out again.
  await loadGateReport(mentorshipId);
  showConsentLink(link, gName.trim(), gEmail.trim(), m.student_name);
}
window.sendConsent = sendConsent;

function showConsentLink(link, gName, gEmail, studentName) {
  const subject = encodeURIComponent('Permission for ' + studentName + ' to work with a FairGame mentor');
  const body = encodeURIComponent(
    'Hi ' + gName.split(' ')[0] + ',\n\n' +
    'We have found a science fair mentor for ' + studentName + ', and we need your permission before they can be introduced.\n\n' +
    'Please open this link to read what mentoring involves and give permission:\n' +
    link + '\n\n' +
    'It takes about two minutes. The page explains exactly how we keep ' + studentName + ' safe, including that every message between them and their mentor is recorded and read by their teacher and by us.\n\n' +
    'The link is valid for 30 days. You can withdraw permission at any time using the same link.\n\n' +
    'Thank you,\nThe FairGame Initiative team');

  const el = document.getElementById('gateReport');
  const box = document.createElement('div');
  box.style.cssText = 'background:var(--green-50,#f1faf2);border:1.5px solid var(--green-600,#357a38);padding:14px 16px;margin-top:14px;font-size:0.84rem;line-height:1.55;';
  box.innerHTML =
    '<strong style="color:var(--green-900,#1c3a1c);">Consent link ready for ' + esc(gName) + '</strong>' +
    '<div style="margin:8px 0;padding:8px 10px;background:#fff;border:1px solid var(--gray-200,#e2e6e2);' +
    'font-family:monospace;font-size:0.76rem;word-break:break-all;">' + esc(link) + '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
    '<a class="btn btn-primary" style="font-size:0.76rem;padding:7px 13px;" href="mailto:' +
      encodeURIComponent(gEmail) + '?subject=' + subject + '&body=' + body + '">Open the email</a>' +
    '<button class="btn" style="font-size:0.76rem;padding:7px 13px;border:1.5px solid var(--gray-200,#e2e6e2);background:none;" ' +
      'onclick="navigator.clipboard.writeText(\'' + link + '\');this.textContent=\'Copied\';">Copy the link</button>' +
    '</div>' +
    '<div style="margin-top:8px;color:var(--gray-500,#6b756b);font-size:0.78rem;">' +
    'Anyone with this link can give or withdraw permission for this student, so send it only to the guardian.</div>';
  el.appendChild(box);
}

/* Teachers are looked up by their user_roles row rather than typed, so
   the id stored is always a real account that can read the thread. */
async function assignTeacher(mentorshipId) {
  const { data: teachers, error } = await sb.from('user_roles')
    .select('user_id, full_name').eq('role', 'teacher').order('full_name');
  if (error) { alert('Could not load teachers: ' + error.message); return; }
  if (!teachers?.length) { alert('No teacher accounts exist yet. A teacher must sign up and be approved first.'); return; }

  const list = teachers.map((t, i) => (i + 1) + '. ' + (t.full_name || t.user_id)).join('\n');
  const pick = prompt('Which teacher supervises this student?\n\n' + list + '\n\nEnter a number:');
  if (pick === null) return;
  const idx = parseInt(pick, 10) - 1;
  if (!(idx >= 0 && idx < teachers.length)) { alert('That is not one of the numbers listed.'); return; }

  const msg = document.getElementById('matchMsg');
  msg.textContent = 'Assigning…'; msg.style.color = 'var(--gray-500)';
  const { error: uErr } = await sb.from('mentorships')
    .update({ supervising_teacher_id: teachers[idx].user_id }).eq('id', mentorshipId);
  if (uErr) { msg.textContent = uErr.message; msg.style.color = '#c0392b'; return; }
  msg.textContent = '';
  await loadGateReport(mentorshipId);
}
window.assignTeacher = assignTeacher;

/* Reopen the gate report for a pair straight from the sidebar, so a
   match that stalled can be picked back up without redoing the match. */
async function openGatesFor(pairId) {
  document.getElementById('matchModal').classList.add('open');
  gotoMatchStep(3);
  await loadGateReport(pairId);
}
window.openGatesFor = openGatesFor;
