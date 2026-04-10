let judgeRecord = null;
const EXP_LABELS = ['Biology / Life Sciences','Chemistry / Biochemistry','Physics / Engineering','Environmental Science','Computer Science / Math','Medicine / Health Sciences'];
const DEMO_REQS = [
  { id:'r1', school:'Bath High School',  fair_date:'2026-03-14', teacher_name:'Ms. Williams', teacher_email:'mwilliams@bath.edu', message:'35 projects across biology and environmental science.', status:'pending' },
  { id:'r2', school:'Lima Senior HS',    fair_date:'2026-03-21', teacher_name:'Mr. Perez',    teacher_email:'jperez@lima.edu',    message:'District-level fair, all STEM fields.', status:'pending' },
];

requireAuth('judge', async (user) => {
  if (sb) {
    const { data } = await sb.from('judges').select('*').eq('email', user.email).maybeSingle().catch(()=>({ data: null }));
    judgeRecord = data;
    if (data) prefillProfile(data);
    else {
      // Judge signed in via magic link but record not found — show their email at minimum
      document.getElementById('navUserEmail').textContent = user.email;
    }
  }
  await loadRequests();
  onSectionLoad('confirmed', loadConfirmed);
});

function prefillProfile(j) {
  document.getElementById('profileCode').textContent = j.code || '—';
  document.getElementById('kCode').textContent       = j.code || '—';
  document.getElementById('pName').value    = j.name   || '';
  document.getElementById('pOrg').value     = j.org    || '';

  // City and county stored separately now; also support legacy combined 'city' field
  if (j.county) {
    document.getElementById('pCity').value   = j.city?.replace(/,.*$/, '').trim() || '';
    document.getElementById('pCounty').value = j.county || '';
  } else {
    // legacy: city was "Columbus, Franklin County"
    const parts = (j.city || '').split(',');
    document.getElementById('pCity').value   = (parts[0] || '').trim();
    document.getElementById('pCounty').value = (parts[1] || '').trim();
  }

  // Travel range
  const travel = j.travel_range || j.travel_miles;
  if (travel) {
    const sel = document.getElementById('pTravel');
    const known = ['10','20','30','40','statewide'];
    if (known.includes(String(travel))) {
      sel.value = String(travel);
    } else {
      sel.value = 'other';
      const oth = document.getElementById('pTravelOther');
      if (oth) { oth.style.display = 'block'; oth.value = travel; }
    }
  }

  if (j.available_level) document.getElementById('pLevel').value = j.available_level;
  (j.expertise || []).forEach(exp => {
    EXP_LABELS.forEach((lbl, i) => { if (exp.includes(lbl.split('/')[0].trim())) document.getElementById('pe'+(i+1)).checked = true; });
  });

  // Checkbox: checked = visible (active), unchecked = hidden (inactive)
  document.getElementById('pActive').checked = (j.status === 'active');
}

function handlePTravelOther(sel) {
  const oth = document.getElementById('pTravelOther');
  if (oth) oth.style.display = sel.value === 'other' ? 'block' : 'none';
}
window.handlePTravelOther = handlePTravelOther;

function updateActiveLabel() {}
window.updateActiveLabel = updateActiveLabel;

async function saveVisibility() {
  if (!sb || !judgeRecord?.id) return;
  const visible = document.getElementById('pActive').checked;
  const status  = visible ? 'active' : 'inactive';
  await sb.from('judges').update({ status }).eq('id', judgeRecord.id).catch(()=>{});
  judgeRecord.status = status;
}
window.saveVisibility = saveVisibility;

async function saveProfile() {
  const expertise  = EXP_LABELS.filter((_,i) => document.getElementById('pe'+(i+1)).checked);
  const city       = document.getElementById('pCity').value.trim();
  const county     = document.getElementById('pCounty').value.trim();
  const travelSel  = document.getElementById('pTravel').value;
  const travelNum  = document.getElementById('pTravelOther')?.value;
  const travel_range = travelSel === 'other' ? (travelNum || 'other') : travelSel;
  const travel_miles = travelSel === 'statewide' ? 9999
    : travelSel === 'other' ? (parseInt(travelNum) || 50)
    : (parseInt(travelSel) || 10);
  const code = judgeRecord?.code || generateJudgeCode(expertise, city);

  const updates = {
    name:            document.getElementById('pName').value.trim(),
    org:             document.getElementById('pOrg').value.trim(),
    city:            city + (county ? ', ' + county : ''),
    county,
    travel_range,
    travel_miles,
    available_level: document.getElementById('pLevel').value,
    expertise,
    status:          document.getElementById('pActive').checked ? 'active' : 'inactive',
    code
  };

  if (sb && judgeRecord?.id) {
    const { error } = await sb.from('judges').update(updates).eq('id', judgeRecord.id);
    if (error) { showMsg('profileMsg', error.message, 'err'); return; }
    Object.assign(judgeRecord, updates);
  }
  document.getElementById('profileCode').textContent = code;
  document.getElementById('kCode').textContent       = code;
  showMsg('profileMsg', 'Profile saved!', 'ok');
}
window.saveProfile = saveProfile;

async function setPassword() {
  const pw      = document.getElementById('newPw').value;
  const confirm = document.getElementById('newPwConfirm').value;
  if (!pw || pw.length < 8) { showMsg('pwMsg','Password must be at least 8 characters.','err'); return; }
  if (pw !== confirm)       { showMsg('pwMsg','Passwords do not match.','err'); return; }
  if (!sb)                  { showMsg('pwMsg','Not connected.','err'); return; }
  const { error } = await sb.auth.updateUser({ password: pw });
  if (error) { showMsg('pwMsg', error.message, 'err'); return; }
  showMsg('pwMsg','Password set! You can now sign in with email and password.','ok');
  document.getElementById('newPw').value = '';
  document.getElementById('newPwConfirm').value = '';
}
window.setPassword = setPassword;

const EMPTY_JOKES = [
  "No requests yet — even Schrödinger's cat hasn't observed one. Check back soon.",
  "Zero requests. Much like dark matter, they exist — just not here yet.",
  "Nothing yet. Your inbox is currently in its ground state. Excitation imminent.",
  "No requests yet. The control group has no data. Science is patient.",
];

async function loadRequests() {
  let reqs = [];
  if (sb && judgeRecord?.id) {
    const { data } = await sb.from('judge_requests').select('*').eq('judge_id', judgeRecord.id).order('created_at',{ascending:false});
    reqs = data || [];
  } else if (!sb) {
    // dev/demo mode only
    reqs = DEMO_REQS;
  }
  const pending = reqs.filter(r => r.status === 'pending').length;
  document.getElementById('kPending').textContent = pending;
  const badge = document.getElementById('reqBadge');
  if (pending > 0) { badge.textContent = pending; badge.style.display = 'inline-block'; } else { badge.style.display = 'none'; }

  const emptyJoke = EMPTY_JOKES[Math.floor(Math.random() * EMPTY_JOKES.length)];

  const renderReqs = (container, max) => {
    if (!container) return;
    const show = max ? reqs.slice(0, max) : reqs;
    if (!show.length) { container.innerHTML = `<div class="empty-state"><p>${emptyJoke}</p></div>`; return; }
    container.innerHTML = show.map(r => `
      <div class="card" style="margin:0;border-left:3px solid ${r.status==='pending'?'var(--g600)':'var(--gray-200)'};">
        <div class="card-body">
          <div class="flex justify-between items-center mb-4" style="flex-wrap:wrap;gap:6px;">
            <span class="text-serif fw-600" style="color:var(--g900);font-size:.95rem;">${r.school}</span>
            <span class="chip chip-${r.status}">${r.status}</span>
          </div>
          <div class="text-sm text-muted mb-4">Fair date: ${r.fair_date||'TBD'} · ${r.teacher_name} &lt;${r.teacher_email}&gt;</div>
          ${r.message ? `<div class="text-sm" style="font-style:italic;color:var(--gray-500);margin-bottom:12px;">"${r.message}"</div>` : ''}
          ${r.status==='pending' ? `<div class="flex gap-8"><button class="btn-primary" onclick="respond('${r.id}','${r.teacher_email}','accepted')" style="font-size:.78rem;padding:7px 14px;">Accept</button><button class="btn-outline" onclick="respond('${r.id}','${r.teacher_email}','declined')" style="font-size:.78rem;padding:7px 14px;">Decline</button></div>` : ''}
        </div>
      </div>`).join('');
  };

  renderReqs(document.getElementById('homeRequests'), 3);
  renderReqs(document.getElementById('requestsList'), 0);
}

async function respond(reqId, teacherEmail, status) {
  if (sb) await sb.from('judge_requests').update({ status, responded_at: new Date().toISOString() }).eq('id', reqId).catch(()=>{});
  if (status === 'accepted' && teacherEmail) {
    const name = document.getElementById('pName').value || 'the judge';
    const sub  = encodeURIComponent('Science Fair Judge Confirmation');
    const body = encodeURIComponent(`Hi,\n\nI'm happy to confirm — I'll be there to judge. Please send any materials I'll need.\n\nBest,\n${name}`);
    window.open(`mailto:${teacherEmail}?subject=${sub}&body=${body}`);
  }
  await loadRequests();
}
window.respond = respond;

async function loadConfirmed() {
  let reqs = [];
  if (sb && judgeRecord?.id) {
    const { data } = await sb.from('judge_requests').select('*').eq('judge_id', judgeRecord.id).eq('status','accepted').order('fair_date');
    reqs = data || [];
  }
  document.getElementById('kConfirmed').textContent = reqs.length;
  const hours = reqs.length * 4;
  document.getElementById('kHours').textContent     = hours + 'h';
  document.getElementById('totalHours').textContent = hours + ' hrs';
  if (!reqs.length) return;
  document.getElementById('confirmedTbody').innerHTML = reqs.map(r => `<tr>
    <td class="col-name">${r.school}</td>
    <td class="col-sm">${r.fair_date||'TBD'}</td>
    <td class="col-sm">${r.teacher_name}</td>
    <td><span class="chip chip-verified">Confirmed</span></td>
    <td><a href="/Documents/2026-Judging-Score-Cards-Vertical-layout.pdf" target="_blank" class="btn-xs">Score Cards</a></td>
  </tr>`).join('');
}
