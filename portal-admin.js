/* ── Demo data ── */
const DEMO = {
  approvals: [
    { id:'a1', name:'Ms. Williams', email:'mwilliams@bath.edu', school:'Bath High School', type:'teacher',    status:'pending',  created_at:'2026-03-10T10:00:00Z' },
    { id:'a2', name:'Priya Sharma', email:'priya@walnut.edu',  school:'Walnut Hills HS',  type:'ambassador', status:'interest', created_at:'2026-03-12T14:30:00Z' },
    { id:'a3', name:'Mr. Davis',    email:'tdavis@lima.edu',   school:'Lima Senior HS',   type:'teacher',    status:'active',   created_at:'2026-03-01T09:00:00Z' },
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

let allApprovals = [], approvalFilter = 'all';

requireAuth('admin', () => {
  loadAllData();
  onSectionLoad('activity',  loadActivity);
  onSectionLoad('approvals', loadApprovals);
  onSectionLoad('schools',   loadSchools);
  onSectionLoad('judges',    loadJudges);
  onSectionLoad('mentors',   loadMentors);
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
  const feed = document.getElementById('activityFeed');
  if (!sb) { feed.innerHTML = '<div class="empty-state"><p>Connect Supabase to see live activity.</p></div>'; return; }
  const { data } = await sb.from('events').select('*').order('ts',{ascending:false}).limit(40);
  if (!data?.length) { feed.innerHTML = '<div class="empty-state"><p>No events recorded yet.</p></div>'; return; }
  const COLORS = { page_view:'var(--gray-100)', quiz_complete:'var(--g100)', judge_request:'#e0f2fe', portal_request:'#fef3c7', contact_form:'var(--g50)' };
  feed.innerHTML = data.map(e => `
    <div class="activity-item">
      <div class="act-date">${new Date(e.ts).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</div>
      <div class="act-body">${e.event}${e.data?.page?' · '+e.data.page:''}${e.data?.role?' · '+e.data.role:''}</div>
      <span style="font-size:.62rem;font-weight:600;padding:2px 7px;background:${COLORS[e.event]||'var(--gray-100)'};color:var(--gray-700);white-space:nowrap;">${e.event.replace(/_/g,' ')}</span>
    </div>`).join('');
}

async function loadApprovals() {
  allApprovals = sb ? (await sb.from('portal_requests').select('*').order('created_at',{ascending:false})).data||[] : DEMO.approvals;
  renderApprovals();
}
function filterApp(type, btn) {
  approvalFilter = type;
  document.querySelectorAll('[onclick^="filterApp"]').forEach(b => b.style.fontWeight = '400');
  btn.style.fontWeight = '700';
  renderApprovals();
}
window.filterApp = filterApp;
function renderApprovals() {
  const f = approvalFilter === 'all' ? allApprovals : allApprovals.filter(a => a.type === approvalFilter || a.status === approvalFilter);
  document.getElementById('approvalsTbody').innerHTML = !f.length
    ? '<tr><td colspan="7"><div class="empty-state"><p>No records match the current filter.</p></div></td></tr>'
    : f.map(a => `<tr>
        <td class="col-name">${a.name}</td>
        <td class="col-sm">${a.email}</td>
        <td class="col-sm">${a.school}</td>
        <td><span class="chip chip-interest">${a.type}</span></td>
        <td class="col-sm">${new Date(a.created_at).toLocaleDateString()}</td>
        <td><span class="chip chip-${a.status}">${a.status}</span></td>
        <td style="white-space:nowrap;display:flex;gap:6px;">
          ${a.status==='pending'||a.status==='interest' ? `<button class="btn-xs approve" onclick="approveUser('${a.id}','${a.email}','${a.type}')">Approve</button>` : ''}
          <button class="btn-xs danger" onclick="rejectUser('${a.id}')">Reject</button>
        </td>
      </tr>`).join('');
}

async function approveUser(id, email, type) {
  if (!confirm(`Approve ${email} as ${type}? They will be able to sign in to their portal immediately.`)) return;
  if (sb) await sb.from('portal_requests').update({ status:'active' }).eq('id', id);
  await loadApprovals();
  await loadAllData();
}
async function rejectUser(id) {
  if (!confirm('Reject this request?')) return;
  if (sb) await sb.from('portal_requests').update({ status:'rejected' }).eq('id', id);
  await loadApprovals();
}
window.approveUser = approveUser; window.rejectUser = rejectUser;

async function loadSchools() {
  const data = sb ? (await sb.from('fairs').select('*').order('created_at',{ascending:false})).data||[] : DEMO.schools;
  document.getElementById('schoolsTbody').innerHTML = !data.length
    ? '<tr><td colspan="7"><div class="empty-state"><p>No schools registered yet.</p></div></td></tr>'
    : data.map(s => `<tr>
        <td class="col-name">${s.school_name}</td>
        <td class="col-sm">${s.teacher_name}</td>
        <td class="col-sm">${s.program_type||'—'}</td>
        <td class="col-sm">${s.fair_date||'TBD'}</td>
        <td class="col-sm">${s.student_count||'—'}</td>
        <td class="col-sm">${s.county||'—'}</td>
        <td><span class="chip chip-${s.status||'planning'}">${s.status||'planning'}</span></td>
      </tr>`).join('');
}

async function loadJudges() {
  const data = sb ? (await sb.from('judges').select('*').order('created_at',{ascending:false})).data||[] : DEMO.judges;
  document.getElementById('judgesTbody').innerHTML = !data.length
    ? '<tr><td colspan="7"><div class="empty-state"><p>No judges yet.</p></div></td></tr>'
    : data.map(j => `<tr>
        <td class="col-mono">${j.code||'—'}</td>
        <td class="col-name">${j.name}</td>
        <td class="col-sm">${(j.expertise||[]).join(', ')}</td>
        <td class="col-sm">${j.city||'—'}</td>
        <td class="col-sm">${j.available_level||'—'}</td>
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
  const data = sb ? (await sb.from('mentorships').select('*').order('created_at',{ascending:false})).data||[] : DEMO.mentors;
  document.getElementById('mentorsTbody').innerHTML = !data.length
    ? '<tr><td colspan="6"><div class="empty-state"><p>No mentorships yet.</p></div></td></tr>'
    : data.map(m => `<tr>
        <td class="col-name">${m.student_name}</td>
        <td class="col-sm">${m.mentor_name}</td>
        <td class="col-sm">${m.school||'—'}</td>
        <td class="col-sm" style="color:var(--g700);font-weight:500;">${m.total_hours||0}h</td>
        <td class="col-sm">${m.session_count||0}</td>
        <td><span class="chip chip-${m.status==='active'?'active':'declined'}">${m.status}</span></td>
      </tr>`).join('');
}

const STAT_KEYS   = ['schools_supported','states_covered','resources_count','teachers_network'];
const STAT_LABELS = ['Schools Supported','States Covered','Resources Count','Teacher Network'];
async function loadStats() {
  let vals = { schools_supported:12, states_covered:1, resources_count:47, teachers_network:100 };
  if (sb) { const { data } = await sb.from('stats').select('*'); (data||[]).forEach(r => vals[r.key] = r.value); }
  document.getElementById('statsForm').innerHTML = STAT_KEYS.map((k,i) => `
    <div class="form-group"><label class="form-label">${STAT_LABELS[i]}</label><input type="number" id="stat_${k}" value="${vals[k]}" min="0"/></div>`).join('');
}
async function saveStats() {
  for (const key of STAT_KEYS) {
    const val = parseInt(document.getElementById('stat_'+key)?.value||'0');
    if (sb) await sb.from('stats').update({ value: val, updated_at: new Date().toISOString() }).eq('key', key);
  }
  showMsg('statsMsg','Stats saved — homepage counters will update.','ok');
}
window.saveStats = saveStats;
