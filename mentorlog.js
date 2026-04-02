let allPairs = [], currentPairId = null, currentMilestones = {};

const DEMO_PAIRS = [
  { id:'p1', student_name:'Rishi Pampati', mentor_name:'Kyla Fallis', school:'Walnut Hills HS', topic:'Environmental monitoring using biosensors', status:'active',  total_hours:6.5,  session_count:4, started_at:'2025-11-01', milestones:{ topic:true, proposal:true, design:true, data:false, board:false, competed:false } },
  { id:'p2', student_name:'Aisha Williams', mentor_name:'Dr. Chen', school:'Linden-McKinley STEM', topic:'ML classification of water quality samples', status:'active', total_hours:3.0, session_count:2, started_at:'2025-12-10', milestones:{ topic:true, proposal:true, design:false, data:false, board:false, competed:false } },
  { id:'p3', student_name:'Marcus Johnson',  mentor_name:'Dr. Santos', school:'Bath High School', topic:'Effect of soil pH on soybean yield', status:'active', total_hours:4.0, session_count:3, started_at:'2025-11-15', milestones:{ topic:true, proposal:false, design:false, data:false, board:false, competed:false } },
];
const DEMO_SESSIONS = {
  p1: [
    { date:'2025-11-08', hours:2.0, notes:'Introduced the scientific method. Helped Rishi narrow topic from general water quality to biosensor detection. Assigned: write hypothesis and list three variables.' },
    { date:'2025-11-22', hours:1.5, notes:'Reviewed hypothesis — good! Discussed experimental design. Controls need work. Identified local creek as test site. Assigned: write full procedure.' },
    { date:'2025-12-06', hours:1.5, notes:'Procedure looks solid. Talked about data collection tables and statistical analysis. Rishi starting field collection next week. Looking strong for district.' },
    { date:'2026-01-10', hours:1.5, notes:'Data collection going well, unexpected pH reading on sample 3 — discussed how to handle outliers honestly. Displaying raw data correctly. On track.' },
  ],
};

async function loadPairs() {
  if (!sb) { allPairs = DEMO_PAIRS; renderPairList(); return; }
  const { data } = await sb.from('mentorships').select('*').order('created_at', { ascending: false });
  allPairs = data || [];
  renderPairList();
}

function renderPairList() {
  const list = document.getElementById('pairList');
  if (!allPairs.length) { list.innerHTML = '<div style="padding:24px 18px;text-align:center;color:var(--gray-300);font-size:0.84rem;">No pairs yet. Add the first one.</div>'; return; }
  list.innerHTML = allPairs.map(p => `
    <div class="pair-item ${p.id === currentPairId ? 'active' : ''}" onclick="selectPair('${p.id}')">
      <div class="pair-names">${p.student_name} + ${p.mentor_name}</div>
      <div class="pair-school">${p.school || '—'}</div>
      <div class="pair-meta">
        <span class="pair-status ${p.status}">${p.status}</span>
        <span class="pair-hours">${p.total_hours || 0} hrs · ${p.session_count || 0} sessions</span>
      </div>
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
  document.getElementById('metaStarted').textContent  = pair.started_at ? new Date(pair.started_at).toLocaleDateString('en-US', { month:'short', year:'numeric' }) : '—';

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
  let sessions;
  if (!sb) { sessions = DEMO_SESSIONS[pairId] || []; }
  else {
    const { data } = await sb.from('mentorship_sessions').select('*').eq('pair_id', pairId).order('date', { ascending: false });
    sessions = data || [];
  }
  renderSessions(sessions);
}

function renderSessions(sessions) {
  const list = document.getElementById('sessionList');
  if (!sessions.length) { list.innerHTML = '<div style="padding:16px;color:var(--gray-300);font-size:0.84rem;text-align:center;">No sessions logged yet.</div>'; return; }
  list.innerHTML = sessions.map(s => `
    <div class="session-item">
      <div class="session-date">${new Date(s.date + 'T00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}</div>
      <div class="session-notes">${s.notes || '—'}</div>
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
    if (sErr) { msg.textContent = 'Error — try again.'; msg.style.color = '#c0392b'; return; }
    // Update totals
    const pair = allPairs.find(p => p.id === currentPairId);
    await sb.from('mentorships').update({
      total_hours:   (pair?.total_hours || 0) + hours,
      session_count: (pair?.session_count || 0) + 1,
      last_session:  date
    }).eq('id', currentPairId);
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

  const newPair = {
    student_name: studentName, student_email: studentEmail,
    mentor_name: mentorName,   mentor_email: mentorEmail,
    school, topic, status: 'active',
    total_hours: 0, session_count: 0,
    started_at: new Date().toISOString().split('T')[0],
    milestones: {}
  };

  if (sb) {
    const { error } = await sb.from('mentorships').insert([newPair]);
    if (error) { msg.textContent = 'Error — try again.'; msg.style.color = '#c0392b'; return; }
  } else {
    newPair.id = 'local_' + Date.now();
    allPairs.unshift(newPair);
  }

  msg.textContent = 'Pair created!'; msg.style.color = 'var(--green-600)';
  logEvent('mentorship_created', { school });
  setTimeout(() => { closeAddPair(); msg.textContent = ''; }, 1500);
  await loadPairs();
}
window.createPair = createPair;

document.addEventListener('DOMContentLoaded', loadPairs);
