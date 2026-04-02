'use strict';

let studentId = null;
let projectData = {};

/* ── Init ── */
requireAuth('student', async (user) => {
  studentId = user.id;
  const name = user.user_metadata?.name || user.email?.split('@')[0] || 'there';
  document.getElementById('welcomeName').textContent = name;
  await loadProject();
  loadMilestones();
  loadNotes();
  loadMessages();
});

/* ── Project ── */
async function loadProject() {
  if (!sb) {
    renderProjectDisplay({ title: 'Demo Project', field: 'Environmental Science', stage: 'experiment', school: 'Demo High School', description: 'Testing water filtration.' });
    document.getElementById('kProjectStatus').textContent = 'In Progress';
    document.getElementById('kField').textContent = 'Env. Science';
    return;
  }
  const { data } = await sb.from('student_projects').select('*').eq('student_id', studentId).maybeSingle();
  if (data) {
    projectData = data;
    renderProjectDisplay(data);
    document.getElementById('kProjectStatus').textContent = stageLabel(data.stage);
    document.getElementById('kField').textContent = shortField(data.field) || '—';
    // Pre-fill modal fields
    document.getElementById('projTitle').value  = data.title  || '';
    document.getElementById('projField').value  = data.field  || '';
    document.getElementById('projGrade').value  = data.grade  || '';
    document.getElementById('projStage').value  = data.stage  || 'planning';
    document.getElementById('projSchool').value = data.school || '';
    document.getElementById('projDesc').value   = data.description || '';
  } else {
    document.getElementById('kProjectStatus').textContent = 'Not set';
    document.getElementById('kField').textContent = '—';
  }
}

function renderProjectDisplay(d) {
  if (!d || !d.title) return;
  document.getElementById('projectDisplay').innerHTML = `
    <div style="display:grid;gap:14px;">
      <div>
        <div class="text-xs text-muted" style="margin-bottom:2px;">Project Title</div>
        <div class="text-serif fw-600" style="font-size:1.05rem;color:var(--g900);">${d.title}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;">
        <div><div class="text-xs text-muted">Field</div><div class="text-sm fw-500">${d.field || '—'}</div></div>
        <div><div class="text-xs text-muted">Grade</div><div class="text-sm fw-500">${d.grade || '—'}</div></div>
        <div><div class="text-xs text-muted">Stage</div><div class="text-sm fw-500">${stageLabel(d.stage)}</div></div>
        <div><div class="text-xs text-muted">School</div><div class="text-sm fw-500">${d.school || '—'}</div></div>
      </div>
      ${d.description ? `<div><div class="text-xs text-muted" style="margin-bottom:4px;">Description / Hypothesis</div><p class="text-sm" style="line-height:1.6;color:var(--gray-700,#3d453d);">${d.description}</p></div>` : ''}
    </div>
  `;
}

function stageLabel(s) {
  const map = { planning:'Planning', research:'Researching', experiment:'Experimenting', analysis:'Analyzing', display:'Building Board', registered:'Registered' };
  return map[s] || s || '—';
}
function shortField(f) {
  if (!f) return '';
  const m = { 'Biology / Life Sciences':'Biology', 'Physics / Engineering':'Physics/Eng', 'Environmental Science':'Env. Science', 'Computer Science / Math':'CS / Math', 'Medicine / Health':'Medicine' };
  return m[f] || f;
}

async function saveProject() {
  const title  = document.getElementById('projTitle').value.trim();
  const field  = document.getElementById('projField').value;
  const grade  = document.getElementById('projGrade').value.trim();
  const stage  = document.getElementById('projStage').value;
  const school = document.getElementById('projSchool').value.trim();
  const desc   = document.getElementById('projDesc').value.trim();
  if (!title) { showMsg('projectMsg', 'Project title is required.', 'err'); return; }
  showMsg('projectMsg', 'Saving…', 'info');
  const row = { student_id: studentId, title, field, grade, stage, school, description: desc, updated_at: new Date().toISOString() };
  if (sb) {
    const { error } = await sb.from('student_projects').upsert([row], { onConflict: 'student_id' });
    if (error) { showMsg('projectMsg', error.message, 'err'); return; }
  }
  showMsg('projectMsg', 'Saved!', 'ok');
  projectData = row;
  renderProjectDisplay(row);
  document.getElementById('kProjectStatus').textContent = stageLabel(stage);
  document.getElementById('kField').textContent = shortField(field) || '—';
  setTimeout(() => closeModal('editProjectModal'), 1200);
  portalLog('project_updated', { title });
}
window.saveProject = saveProject;

/* ── Milestones (localStorage) ── */
function loadMilestones() {
  const saved = JSON.parse(localStorage.getItem('fg_milestones') || '{}');
  for (let i = 1; i <= 7; i++) {
    const el = document.getElementById('ms' + i);
    if (el) el.checked = !!saved['ms' + i];
  }
}
function saveMilestones() {
  const out = {};
  for (let i = 1; i <= 7; i++) {
    const el = document.getElementById('ms' + i);
    if (el) out['ms' + i] = el.checked;
  }
  localStorage.setItem('fg_milestones', JSON.stringify(out));
}
window.saveMilestones = saveMilestones;

/* ── Notes (localStorage) ── */
function loadNotes() {
  document.getElementById('projectNotes').value = localStorage.getItem('fg_student_notes') || '';
}
function saveNotes() {
  localStorage.setItem('fg_student_notes', document.getElementById('projectNotes').value);
  showMsg('notesMsg', 'Notes saved.', 'ok');
}
window.saveNotes = saveNotes;

/* ── Messages count ── */
async function loadMessages() {
  if (!sb) { document.getElementById('kMessages').textContent = '0'; return; }
  const { count } = await sb.from('messages').select('*', { count: 'exact', head: true }).eq('to_user_id', studentId).eq('read', false);
  document.getElementById('kMessages').textContent = count ?? '0';
}

/* ── Help / Contact ── */
async function sendHelpMessage() {
  const topic   = document.getElementById('helpTopic').value;
  const message = document.getElementById('helpMessage').value.trim();
  if (!topic || !message) { showMsg('helpMsg', 'Please select a topic and write your message.', 'err'); return; }
  showMsg('helpMsg', 'Sending…', 'info');
  if (sb) {
    await sb.from('messages').insert([{
      from_user_id: studentId, from_role: 'student', to_role: 'admin',
      subject: topic, body: message
    }]).catch(() => {});
  }
  const sub  = encodeURIComponent(`FairGame Student Question — ${topic}`);
  const body = encodeURIComponent(`Topic: ${topic}\n\n${message}`);
  window.open(`mailto:fairgameinitiative@outlook.com?subject=${sub}&body=${body}`);
  document.getElementById('helpTopic').value = '';
  document.getElementById('helpMessage').value = '';
  showMsg('helpMsg', "Message sent! We'll reply within 48 hours.", 'ok');
  portalLog('help_message_sent', { topic });
}
window.sendHelpMessage = sendHelpMessage;

async function scheduleCall() {
  const date  = document.getElementById('callDate').value;
  const time  = document.getElementById('callTime').value;
  const notes = document.getElementById('callNotes').value.trim();
  if (!date) { showMsg('callMsg', 'Please select a date.', 'err'); return; }
  showMsg('callMsg', 'Sending…', 'info');
  if (sb) {
    await sb.from('messages').insert([{
      from_user_id: studentId, from_role: 'student', to_role: 'admin',
      subject: `Call Request — ${date} ${time}`,
      body: notes || '(No additional notes)'
    }]).catch(() => {});
  }
  const sub  = encodeURIComponent(`FairGame Call Request — ${date}`);
  const bod  = encodeURIComponent(`Hi FairGame Team,\n\nI'd like to schedule a 30-minute call on ${date} (${time}).\n\n${notes}`);
  window.open(`mailto:fairgameinitiative@outlook.com?subject=${sub}&body=${bod}`);
  showMsg('callMsg', "Request sent! We'll confirm within 48 hours.", 'ok');
}
window.scheduleCall = scheduleCall;

/* ── Mentor request ── */
async function requestMentor() {
  showMsg('mentorMsg', 'Sending…', 'info');
  const name  = currentUser?.user_metadata?.name || currentUser?.email || 'A student';
  const field = projectData.field || 'General';
  const title = projectData.title || '(not set)';
  if (sb) {
    await sb.from('messages').insert([{
      from_user_id: studentId, from_role: 'student', to_role: 'admin',
      subject: 'Mentor Request',
      body: `${name} is requesting a mentor.\nProject: ${title}\nField: ${field}`
    }]).catch(() => {});
  }
  const sub = encodeURIComponent('FairGame Mentor Request');
  const bod = encodeURIComponent(`Hi FairGame Team,\n\nI'd like to be connected with a mentor for my project.\n\nProject: ${title}\nField: ${field}\n\n— ${name}`);
  window.open(`mailto:fairgameinitiative@outlook.com?subject=${sub}&body=${bod}`);
  showMsg('mentorMsg', "Mentor request sent! We'll be in touch shortly.", 'ok');
  portalLog('mentor_requested', { field, title });
}
window.requestMentor = requestMentor;

/* ── Community posts ── */
async function loadCommunityPosts() {
  if (!sb) { document.getElementById('noPostsMsg').style.display = 'block'; return; }
  const { data: posts } = await sb.from('community_posts').select('*').eq('audience', 'student').order('created_at', { ascending: false }).limit(20);
  const list = document.getElementById('communityPostsList');
  if (!posts?.length) { document.getElementById('noPostsMsg').style.display = 'block'; return; }
  list.innerHTML = posts.map(p => {
    const initials = (p.author_name || 'U').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    return `<div style="padding:14px;border:1.5px solid var(--gray-200,#e2e6e2);border-radius:3px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <div style="width:32px;height:32px;border-radius:50%;background:var(--g500);display:flex;align-items:center;justify-content:center;font-size:.78rem;color:white;font-weight:600;flex-shrink:0;">${initials}</div>
        <div>
          <div class="text-sm fw-500" style="color:var(--g900);">${p.author_name || 'Student'}</div>
          <div class="text-xs text-muted">${new Date(p.created_at).toLocaleDateString()}</div>
        </div>
      </div>
      <p class="text-sm" style="line-height:1.6;color:var(--gray-700,#3d453d);">${p.body}</p>
    </div>`;
  }).join('');
}

async function postIntro() {
  const text = document.getElementById('introText').value.trim();
  if (!text) { showMsg('introMsg', 'Please write something first.', 'err'); return; }
  await _submitPost(text, 'introMsg');
  if (document.getElementById('introMsg').classList.contains('ok')) {
    setTimeout(() => closeModal('introModal'), 1400);
    document.getElementById('introText').value = '';
  }
}
window.postIntro = postIntro;

async function submitPost() {
  const text = document.getElementById('postText').value.trim();
  if (!text) { showMsg('postMsg', 'Please write something first.', 'err'); return; }
  await _submitPost(text, 'postMsg');
  if (document.getElementById('postMsg').classList.contains('ok')) {
    setTimeout(() => closeModal('postModal'), 1400);
    document.getElementById('postText').value = '';
  }
}
window.submitPost = submitPost;

async function _submitPost(body, msgId) {
  showMsg(msgId, 'Posting…', 'info');
  const authorName = currentUser?.user_metadata?.name || currentUser?.email?.split('@')[0] || 'Student';
  if (sb) {
    const { error } = await sb.from('community_posts').insert([{
      author_id: studentId, author_role: 'student', author_name: authorName,
      body, audience: 'student', created_at: new Date().toISOString()
    }]);
    if (error) { showMsg(msgId, error.message, 'err'); return; }
  }
  showMsg(msgId, 'Posted!', 'ok');
  loadCommunityPosts();
}

/* ── Resources download ── */
async function dlRes(path) {
  const url = await getSignedUrl('resources', path);
  if (url) window.open(url);
  else alert('Resource not yet uploaded. Email fairgameinitiative@outlook.com to request it.');
}
window.dlRes = dlRes;

/* ── Load community posts on section open ── */
onSectionLoad('community', loadCommunityPosts);
