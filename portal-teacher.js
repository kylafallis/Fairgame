let teacherId = null, currentFair = null, savedCounty = '', teacherStudents = [];

const DEMO_JUDGES = [
  { id:'j1', code:'EN-163-7X', name:'Dr. Robert Davis', expertise:['Environmental Science','Physics / Engineering'], city:'Lima, Allen County', available_level:'Any level', status:'active', email:'rdavis@univ.edu' },
  { id:'j2', code:'BI-163-K2', name:'Dr. Laura Chen',   expertise:['Biology / Life Sciences'], city:'Lima, Allen County', available_level:'School fair', status:'active', email:'lchen@osu.edu' },
  { id:'j3', code:'CH-489-Q5', name:'Mark Thompson',    expertise:['Chemistry'],               city:'Columbus, Franklin County', available_level:'District fair', status:'active', email:'' },
];

const TIMELINE = [
  { m:'Months 1–2', task:'Get administrator approval and set fair date' },
  { m:'Months 3–4', task:'Register with OAS and set up ProjectBoard' },
  { m:'Months 5–6', task:'Begin recruiting judges and find sponsors' },
  { m:'Month 7',    task:'Open student registration, send announcements' },
  { m:'Months 8–9', task:'Run topic selection and design workshops' },
  { m:'Month 10',   task:'Confirm judges and finalise logistics' },
  { m:'Month 11',   task:'Final student check-ins and display board prep' },
  { m:'Month 12',   task:'Science fair day → awards → post-event follow-up' },
];

requireAuth('teacher', async (user) => {
  teacherId = user.id;
  renderTimeline();
  if (sb) {
    const { data: fair } = await sb.from('fairs').select('*').eq('teacher_user_id', teacherId).order('created_at',{ascending:false}).limit(1).single().catch(()=>({ data:null }));
    if (fair) prefillFair(fair);
    else document.getElementById('fairAlert').style.display = 'flex';
  } else { document.getElementById('fairAlert').style.display = 'flex'; }
  onSectionLoad('judges', loadJudgeSection);
  onSectionLoad('students', loadTeacherStudents);
  onSectionLoad('documents', loadSchoolDocs);
});

function prefillFair(fair) {
  currentFair = fair; savedCounty = fair.county || '';
  const map = { fSchool:'school_name', fTeacher:'teacher_name', fEmail:'teacher_email', fCity:'city', fCounty:'county', fStudents:'student_count' };
  Object.entries(map).forEach(([id, key]) => { const el = document.getElementById(id); if (el && fair[key]) el.value = fair[key]; });
  if (fair.fair_date) document.getElementById('fDate').value = fair.fair_date;
  if (fair.program_type) document.getElementById('fProgram').value = fair.program_type;
  const days = fair.fair_date ? Math.ceil((new Date(fair.fair_date) - new Date()) / 86400000) : null;
  document.getElementById('kFairDate').textContent  = days && days > 0 ? days : '—';
  document.getElementById('kStudents').textContent  = fair.student_count || '—';
  document.getElementById('kStatus').textContent    = fair.status || 'Planning';
  document.getElementById('kConfirmed').textContent = '0';
  const chip = document.getElementById('fairStatusChip');
  chip.textContent = fair.status || 'planning'; chip.className = 'chip chip-' + (fair.status || 'planning'); chip.style.display = 'inline-block';
  const summary = document.getElementById('fairSummary');
  summary.innerHTML = `<div class="detail-grid">
    <div><div class="detail-item-label">School</div><div class="detail-item-value">${fair.school_name}</div></div>
    <div><div class="detail-item-label">Fair Date</div><div class="detail-item-value">${fair.fair_date || 'TBD'}</div></div>
    <div><div class="detail-item-label">County</div><div class="detail-item-value">${fair.county || '—'}</div></div>
    <div><div class="detail-item-label">Program Type</div><div class="detail-item-value">${fair.program_type || '—'}</div></div>
  </div>`;
}

async function saveFair() {
  const school  = document.getElementById('fSchool').value.trim();
  const teacher = document.getElementById('fTeacher').value.trim();
  const email   = document.getElementById('fEmail').value.trim();
  const county  = document.getElementById('fCounty').value.trim();
  if (!school || !teacher || !email) { showMsg('fairMsg','School name, your name, and email are required.','err'); return; }
  showMsg('fairMsg','Saving…','info');
  savedCounty = county;
  const categories = ['Biology','Chemistry','Physics','Environmental','CS/Math','Medicine'].filter((_,i) => document.getElementById('fc'+(i+1)).checked);
  const row = {
    school_name: school, teacher_name: teacher, teacher_email: email,
    city: document.getElementById('fCity').value.trim(),
    county, fair_date: document.getElementById('fDate').value || null,
    student_count: parseInt(document.getElementById('fStudents').value)||0,
    program_type: document.getElementById('fProgram').value,
    project_areas: categories,
    teacher_user_id: teacherId, status: 'planning'
  };
  if (sb) {
    const q = currentFair
      ? sb.from('fairs').update(row).eq('id', currentFair.id)
      : sb.from('fairs').insert([row]);
    const { data, error } = await q.select().single();
    if (error) { showMsg('fairMsg', error.message, 'err'); return; }
    currentFair = data;
    prefillFair(data);
  }
  showMsg('fairMsg', 'Fair saved! Check Judge Matching for judges in your area.', 'ok');
  document.getElementById('fairAlert').style.display = 'none';
  portalLog('fair_saved', { school, county });
}
window.saveFair = saveFair;

async function loadJudgeSection() {
  const grid = document.getElementById('judgeMatchGrid');
  if (!savedCounty) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><p>Register your fair and enter your county to see nearby judges.</p></div>'; return; }
  grid.innerHTML = '<div style="grid-column:1/-1;"><div class="spinner-wrap"><div class="spinner"></div></div></div>';
  let judges = DEMO_JUDGES;
  if (sb) {
    const word = savedCounty.split(' ')[0];
    const { data } = await sb.from('judges').select('*').eq('status','active').ilike('city', `%${word}%`);
    if (data?.length) judges = data;
  }
  if (!judges.length) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><p>No judges in your county yet. Use the custom invitation below.</p></div>'; return; }
  grid.innerHTML = judges.map(j => `
    <div class="card" style="margin:0;">
      <div class="card-body">
        <div class="col-mono mb-4">${j.code || '—'}</div>
        <div class="fw-500" style="font-size:.88rem;color:var(--g900);margin-bottom:2px;">${j.name}</div>
        <div class="text-sm text-muted mb-4">${(j.expertise||[]).join(', ')}</div>
        <div class="text-xs text-muted mb-16">${j.city || 'Ohio'} · ${j.available_level || 'Any level'}</div>
        <button class="btn-primary w-full" onclick="requestJudge('${j.id}','${(j.name||'').replace(/'/g,"\\'")}','${j.email||''}')" style="justify-content:center;font-size:.78rem;padding:8px;">Request →</button>
      </div>
    </div>`).join('');
}

async function requestJudge(judgeId, judgeName, judgeEmail) {
  const school   = document.getElementById('fSchool').value.trim() || 'our school';
  const date     = document.getElementById('fDate').value || 'TBD';
  const teacher  = document.getElementById('fTeacher').value.trim();
  const tEmail   = document.getElementById('fEmail').value.trim();
  if (sb) await sb.from('judge_requests').insert([{ judge_id: judgeId, judge_email: judgeEmail, judge_name: judgeName, teacher_name: teacher, teacher_email: tEmail, school, fair_date: date, status: 'pending', fair_id: currentFair?.id || null }]).catch(()=>{});
  if (judgeEmail) {
    const sub  = encodeURIComponent(`Science Fair Judge Request — ${school}`);
    const body = encodeURIComponent(`Hi ${judgeName},\n\nI'm coordinating the science fair at ${school} on ${date} and would love to have you join us as a judge.\n\nPlease reply to confirm your availability.\n\nThank you,\n${teacher}\n${tEmail}`);
    window.open(`mailto:${judgeEmail}?subject=${sub}&body=${body}`);
  }
  portalLog('judge_request', { judgeId, school });
}
window.requestJudge = requestJudge;

async function sendCustomInvite() {
  const email = document.getElementById('customJudgeEmail').value.trim();
  if (!email) { showMsg('customInviteMsg','Enter an email address.','err'); return; }
  const school   = document.getElementById('fSchool').value.trim() || 'our school';
  const date     = document.getElementById('fDate').value || 'TBD';
  const teacher  = document.getElementById('fTeacher').value.trim();
  const sub  = encodeURIComponent(`Science Fair Judge Invitation — ${school}`);
  const body = encodeURIComponent(`Hi,\n\nI'm coordinating the science fair at ${school} on ${date}. Would you be interested in serving as a judge? It's typically a 3–5 hour commitment.\n\nPlease reply if you're available and I'll send full details.\n\nThank you,\n${teacher}`);
  window.open(`mailto:${email}?subject=${sub}&body=${body}`);
  showMsg('customInviteMsg', 'Email opened — edit the message before sending.', 'ok');
}
window.sendCustomInvite = sendCustomInvite;

async function loadTeacherStudents() {
  if (!sb) { teacherStudents = []; renderTeacherStudentTable([]); return; }
  const { data } = await sb.from('students').select('*').eq('teacher_user_id', teacherId).order('name');
  teacherStudents = data || [];
  renderTeacherStudentTable(teacherStudents);
}

function renderTeacherStudentTable(students) {
  const tbody = document.getElementById('teacherStudentTbody');
  if (!students.length) { tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>No students yet.</p></div></td></tr>'; return; }
  tbody.innerHTML = students.map(s => `<tr>
    <td class="col-name">${s.name}</td>
    <td class="col-sm">${s.grade||'—'}</td>
    <td class="col-sm">${s.project_title||'<em class="text-muted">Not set</em>'}</td>
    <td class="col-sm">${s.project_field||'—'}</td>
    <td><span class="chip chip-${s.paperwork_status||'pending'}">${s.paperwork_status||'pending'}</span></td>
    <td><button class="btn-xs" onclick="alert('Document upload for teachers coming in next build.')">Upload</button></td>
  </tr>`).join('');
}

async function saveTeacherStudent() {
  const name  = document.getElementById('tsnName').value.trim();
  if (!name) { showMsg('addTeacherStudentMsg','Name required.','err'); return; }
  showMsg('addTeacherStudentMsg','Saving…','info');
  const row = { name, grade: document.getElementById('tsnGrade').value.trim(), email: document.getElementById('tsnEmail').value.trim(), project_field: document.getElementById('tsnField').value, project_title: document.getElementById('tsnTitle').value.trim(), teacher_user_id: teacherId, paperwork_status: 'pending' };
  if (sb) { const { error } = await sb.from('students').insert([row]); if (error) { showMsg('addTeacherStudentMsg', error.message, 'err'); return; } }
  showMsg('addTeacherStudentMsg','Student added!','ok');
  setTimeout(() => { closeModal('addTeacherStudentModal'); loadTeacherStudents(); }, 1200);
}
window.saveTeacherStudent = saveTeacherStudent;

async function loadSchoolDocs() {
  if (!sb) return;
  const { data: docs } = await sb.from('documents').select('*').eq('owner_id', teacherId).eq('owner_type','teacher').order('uploaded_at',{ascending:false});
  const list = document.getElementById('schoolDocList');
  if (!docs?.length) return;
  list.innerHTML = docs.map(d => `
    <div class="flex items-center gap-12" style="padding:10px 0;border-bottom:var(--border,1px solid #e2e6e2);">
      <div style="flex:1;"><div class="fw-500 text-sm" style="color:var(--g900);">${d.file_name}</div><div class="text-xs text-muted">${d.file_type} · ${new Date(d.uploaded_at||d.created_at).toLocaleDateString()}</div></div>
      <button class="btn-xs" onclick="dlDoc('${d.file_path}')">Download</button>
    </div>`).join('');
}

function previewTeacherDoc(input) { document.getElementById('teacherDocPreview').textContent = input.files[0] ? input.files[0].name : ''; }
window.previewTeacherDoc = previewTeacherDoc;

async function uploadTeacherDoc() {
  const fileInput = document.getElementById('teacherDocFile');
  if (!fileInput.files.length) { showMsg('teacherDocMsg','Select a file.','err'); return; }
  const file = fileInput.files[0];
  if (file.size > 10*1024*1024) { showMsg('teacherDocMsg','Max 10MB.','err'); return; }
  const docType = document.getElementById('teacherDocType').value;
  showMsg('teacherDocMsg','Uploading…','info');
  const path = `teachers/${teacherId}/${Date.now()}_${file.name.replace(/\s+/g,'_')}`;
  if (sb) {
    const { error } = await uploadPortalFile('student-docs', path, file);
    if (error) { showMsg('teacherDocMsg','Upload failed.','err'); return; }
    await sb.from('documents').insert([{ owner_id: teacherId, owner_type:'teacher', file_path: path, file_name: file.name, file_type: docType, uploaded_at: new Date().toISOString() }]);
  }
  showMsg('teacherDocMsg','Uploaded!','ok');
  fileInput.value = ''; document.getElementById('teacherDocPreview').textContent = '';
  loadSchoolDocs();
}
window.uploadTeacherDoc = uploadTeacherDoc;

async function dlDoc(path) { const url = await getSignedUrl('student-docs', path); if (url) window.open(url); }
window.dlDoc = dlDoc;

function renderTimeline() {
  const saved = JSON.parse(localStorage.getItem('fg_tl')||'{}');
  document.getElementById('timelineBody').innerHTML = TIMELINE.map((t,i) => `
    <div class="flex items-center gap-12" style="padding:12px 0;border-bottom:var(--border,1px solid #e2e6e2);">
      <input type="checkbox" id="tl${i}" ${saved[i]?'checked':''} onchange="saveTl(${i},this.checked)" style="width:16px;height:16px;accent-color:var(--g600);flex-shrink:0;"/>
      <div>
        <div class="text-xs text-muted">${t.m}</div>
        <div class="text-sm fw-500" style="${saved[i]?'text-decoration:line-through;color:var(--gray-400)':''}">${t.task}</div>
      </div>
    </div>`).join('');
}
function saveTl(i, v) { const s = JSON.parse(localStorage.getItem('fg_tl')||'{}'); s[i]=v; localStorage.setItem('fg_tl',JSON.stringify(s)); renderTimeline(); }
window.saveTl = saveTl;

async function dlTeacherRes(path) { const url = await getSignedUrl('resources', path); if (url) window.open(url); else alert('Resource not uploaded yet. Email fairgameinitiative@outlook.com'); }
window.dlTeacherRes = dlTeacherRes;
