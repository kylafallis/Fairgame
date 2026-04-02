/* ── State ── */
let allStudents = [], ambassadorId = null;
let activeDocStudentId = null;

const DEMO_STUDENTS = [
  { id:'s1', name:'Priya Sharma',  grade:'10th', project_title:'Microplastics in Olentangy River', project_field:'Environmental Science', paperwork_status:'uploaded', mentor_id:'m1' },
  { id:'s2', name:'Marcus Lee',    grade:'9th',  project_title:'Solar Cell Efficiency Optimizer',  project_field:'Physics / Engineering',  paperwork_status:'pending',  mentor_id:null },
  { id:'s3', name:'Sofia Reyes',   grade:'11th', project_title:'CRISPR in E. Coli',                project_field:'Biology / Life Sciences',paperwork_status:'verified', mentor_id:'m2' },
  { id:'s4', name:'James Okafor',  grade:'9th',  project_title:null,                               project_field:null,                     paperwork_status:'pending',  mentor_id:null },
];

/* ── Init ── */
requireAuth('ambassador', async (user) => {
  ambassadorId = user.id;
  await loadStudents();
  onSectionLoad('documents', populateDocSelect);
});

async function loadStudents() {
  if (!sb) { allStudents = DEMO_STUDENTS; }
  else {
    const { data } = await sb.from('students').select('*').eq('ambassador_id', ambassadorId).order('name');
    allStudents = data || [];
  }
  renderStudentTable(allStudents);
  renderHomeStats(allStudents);
  renderRecentStudents(allStudents.slice(0, 5));
}

function renderHomeStats(students) {
  document.getElementById('kStudents').textContent = students.length;
  document.getElementById('kDocs').textContent     = students.filter(s => s.paperwork_status !== 'pending').length;
  document.getElementById('kMentored').textContent = students.filter(s => s.mentor_id).length;
  document.getElementById('kReady').textContent    = students.filter(s => s.paperwork_status === 'verified').length;
}

function renderRecentStudents(students) {
  const el = document.getElementById('recentStudentsTable');
  if (!students.length) { el.innerHTML = '<div class="empty-state"><p>No students yet — add your first student using the button above.</p></div>'; return; }
  el.innerHTML = `<table class="data-table">
    <thead><tr><th>Name</th><th>Project</th><th>Paperwork</th></tr></thead>
    <tbody>${students.map(s => `<tr>
      <td class="col-name">${s.name}</td>
      <td class="col-sm text-muted">${s.project_title || '<em>Not set</em>'}</td>
      <td><span class="chip chip-${s.paperwork_status||'pending'}">${s.paperwork_status||'pending'}</span></td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function renderStudentTable(students) {
  const tbody = document.getElementById('studentTbody');
  document.getElementById('studentCountLabel').textContent = `${students.length} Student${students.length !== 1 ? 's' : ''}`;
  if (!students.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><p>No students yet. Use "+ Add Student" to get started.</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = students.map(s => `<tr>
    <td class="col-name">${s.name}</td>
    <td class="col-sm">${s.grade || '—'}</td>
    <td class="col-sm" style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.project_title || '<span class="text-muted"><em>Not set</em></span>'}</td>
    <td class="col-sm text-muted">${s.project_field || '—'}</td>
    <td><span class="chip chip-${s.paperwork_status||'pending'}">${s.paperwork_status||'pending'}</span></td>
    <td class="col-sm">${s.mentor_id ? '<span class="text-green">Assigned</span>' : '<span class="text-muted">None</span>'}</td>
    <td style="white-space:nowrap;">
      <button class="btn-xs" onclick="openUploadFor('${s.id}','${s.name.replace(/'/g,"\\'")}')">Upload</button>
      <button class="btn-xs" onclick="viewDocSection('${s.id}','${s.name.replace(/'/g,"\\'")}')">Files</button>
    </td>
  </tr>`).join('');
}

function filterStudents(q) {
  const f = q.toLowerCase();
  renderStudentTable(q ? allStudents.filter(s =>
    s.name?.toLowerCase().includes(f) || s.project_title?.toLowerCase().includes(f) || s.project_field?.toLowerCase().includes(f)
  ) : allStudents);
}
window.filterStudents = filterStudents;

/* ── Add student ── */
async function saveStudent() {
  const name  = document.getElementById('snName').value.trim();
  const grade = document.getElementById('snGrade').value.trim();
  const email = document.getElementById('snEmail').value.trim();
  const field = document.getElementById('snField').value;
  const title = document.getElementById('snTitle').value.trim();
  const desc  = document.getElementById('snDesc').value.trim();
  if (!name) { showMsg('addStudentMsg','Student name is required.','err'); return; }
  showMsg('addStudentMsg','Saving…','info');
  const row = { name, grade, email, project_field: field, project_title: title, abstract: desc, ambassador_id: ambassadorId, paperwork_status: 'pending' };
  if (sb) {
    const { error } = await sb.from('students').insert([row]);
    if (error) { showMsg('addStudentMsg', error.message, 'err'); return; }
  } else { row.id = 'local_'+Date.now(); allStudents.push(row); }
  showMsg('addStudentMsg','Student added!','ok');
  setTimeout(() => { closeModal('addStudentModal'); loadStudents(); }, 1200);
  portalLog('student_added', { name });
}
window.saveStudent = saveStudent;

/* ── Documents ── */
function populateDocSelect() {
  const sel = document.getElementById('docStudentSelect');
  sel.innerHTML = '<option value="">— Choose a student —</option>' +
    allStudents.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

async function loadStudentDocs(studentId) {
  if (!studentId) return;
  activeDocStudentId = studentId;
  const student = allStudents.find(s => s.id === studentId);
  document.getElementById('docVaultTitle').textContent = student?.name + ' — Documents';
  document.getElementById('docVaultCard').style.display = 'block';
  document.getElementById('uploadStudentId').value = studentId;
  document.getElementById('uploadFor').textContent = 'Uploading for: ' + (student?.name || '');
  const list = document.getElementById('docList');
  list.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';
  if (!sb) { list.innerHTML = '<div class="empty-state"><p>Connect Supabase to view documents.</p></div>'; return; }
  const { data: docs } = await sb.from('documents').select('*').eq('student_id', studentId).order('uploaded_at', { ascending: false });
  if (!docs?.length) { list.innerHTML = '<div class="empty-state"><p>No files yet — click Upload File to add the first one.</p></div>'; return; }
  list.innerHTML = docs.map(d => `
    <div class="flex items-center gap-12" style="padding:10px 0;border-bottom:var(--border,1px solid #e2e6e2);">
      <div style="flex:1;">
        <div class="fw-500" style="font-size:.86rem;color:#1c3a1c;">${d.file_name}</div>
        <div class="text-xs text-muted">${d.file_type} · ${new Date(d.uploaded_at||d.created_at).toLocaleDateString()}</div>
      </div>
      <button class="btn-xs" onclick="downloadDoc('${d.file_path}')">Download</button>
    </div>`).join('');
}
window.loadStudentDocs = loadStudentDocs;

function openUploadFor(studentId, studentName) {
  document.getElementById('uploadStudentId').value = studentId;
  document.getElementById('uploadFor').textContent = 'Uploading for: ' + studentName;
  openModal('uploadModal');
}
function viewDocSection(studentId, studentName) {
  showSection('documents', document.querySelector('[data-section="documents"]'));
  setTimeout(() => {
    document.getElementById('docStudentSelect').value = studentId;
    loadStudentDocs(studentId);
  }, 50);
}
window.openUploadFor = openUploadFor;
window.viewDocSection = viewDocSection;

function previewFile(input) {
  const f = input.files[0];
  document.getElementById('filePreview').textContent = f ? f.name + ' (' + (f.size/1024/1024).toFixed(1) + 'MB)' : '';
}
window.previewFile = previewFile;

async function doUpload() {
  const studentId = document.getElementById('uploadStudentId').value;
  const docType   = document.getElementById('docType').value;
  const fileInput = document.getElementById('docFile');
  if (!fileInput.files.length) { showMsg('uploadMsg','Select a file first.','err'); return; }
  const file = fileInput.files[0];
  if (file.size > 10 * 1024 * 1024) { showMsg('uploadMsg','File must be under 10MB.','err'); return; }
  showMsg('uploadMsg','Uploading…','info');
  const path = `students/${ambassadorId}/${studentId}/${Date.now()}_${file.name.replace(/\s+/g,'_')}`;
  if (sb) {
    const { error: upErr } = await uploadPortalFile('student-docs', path, file);
    if (upErr) { showMsg('uploadMsg','Upload failed — check file type and size.','err'); return; }
    await sb.from('documents').insert([{ owner_id: ambassadorId, owner_type: 'ambassador', student_id: studentId, file_path: path, file_name: file.name, file_type: docType, uploaded_at: new Date().toISOString() }]);
    await sb.from('students').update({ paperwork_status: 'uploaded' }).eq('id', studentId);
  }
  showMsg('uploadMsg','Uploaded successfully!','ok');
  fileInput.value = ''; document.getElementById('filePreview').textContent = '';
  setTimeout(() => { closeModal('uploadModal'); loadStudents(); if (activeDocStudentId === studentId) loadStudentDocs(studentId); }, 1400);
}
window.doUpload = doUpload;

async function downloadDoc(path) {
  const url = await getSignedUrl('student-docs', path);
  if (url) window.open(url); else alert('Could not generate download link.');
}
window.downloadDoc = downloadDoc;

/* ── Schedule ── */
async function requestMeeting() {
  const date  = document.getElementById('schedDate').value;
  const time  = document.getElementById('schedTime').value;
  const notes = document.getElementById('schedNotes').value.trim();
  if (!date || !notes) { showMsg('schedMsg','Please set a date and describe what you need help with.','err'); return; }
  showMsg('schedMsg','Sending…','info');
  if (sb) await sb.from('messages').insert([{ from_user_id: ambassadorId, from_role:'ambassador', to_role:'admin', subject:`Meeting Request — ${date} ${time}`, body: notes }]).catch(()=>{});
  const sub  = encodeURIComponent(`FairGame Meeting Request — ${date}`);
  const body = encodeURIComponent(`Hi FairGame Team,\n\nI'd like to schedule a meeting on ${date} (${time}).\n\n${notes}`);
  window.open(`mailto:fairgameinitiative@outlook.com?subject=${sub}&body=${body}`);
  showMsg('schedMsg',"Request sent! We'll confirm within 48 hours.",'ok');
}
window.requestMeeting = requestMeeting;

/* ── Resources download ── */
async function dlRes(path) {
  const url = await getSignedUrl('resources', path);
  if (url) window.open(url); else alert('Resource not uploaded yet. Email fairgameinitiative@outlook.com');
}
window.dlRes = dlRes;
