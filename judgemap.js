/* ── JUDGE MAP PAGE LOGIC ────────────────────────────────── */
let map, allJudges = [], markers = {}, activeFilter = 'all', activeLevelFilter = 'all';

// Ohio center
const OHIO_CENTER = [40.4173, -82.9071];
const OHIO_ZOOM   = 7;

/* Ohio county → approx lat/lng lookup (subset — expand as needed) */
const COUNTY_COORDS = {
  'franklin':    [39.97,  -82.99], 'cuyahoga': [41.48,  -81.68], 'hamilton': [39.10,  -84.51],
  'summit':      [41.10,  -81.52], 'montgomery':[39.76, -84.19], 'lucas':    [41.66,  -83.56],
  'stark':       [40.80,  -81.35], 'lorain':   [41.28,  -82.22], 'butler':   [39.44,  -84.56],
  'lake':        [41.70,  -81.24], 'mahoning': [41.01,  -80.77], 'warren':   [39.43,  -84.17],
  'medina':      [41.14,  -81.86], 'clermont': [39.06,  -84.15], 'licking':  [40.09,  -82.47],
  'allen':       [40.77,  -84.10], 'richland': [40.78,  -82.53], 'wayne':    [40.83,  -81.89],
  'delaware':    [40.28,  -83.07], 'portage':  [41.17,  -81.21], 'geauga':   [41.50,  -81.16],
  'greene':      [39.69,  -83.88], 'fairfield':[39.74,  -82.62], 'ashtabula':[41.73,  -80.79],
  'trumbull':    [41.31,  -80.77], 'muskingum':[39.97,  -82.01], 'pickaway': [39.64,  -83.06],
  'ross':        [39.35,  -83.00], 'tuscarawas':[40.44, -81.48], 'athens':   [39.33,  -82.10],
  'scioto':      [38.84,  -82.97], 'wood':     [41.37,  -83.62],
  // City fallbacks
  'columbus':    [39.96,  -82.99], 'cleveland':[41.49,  -81.69], 'cincinnati':[39.10, -84.51],
  'toledo':      [41.66,  -83.55], 'akron':    [41.08,  -81.52], 'dayton':   [39.76,  -84.19],
  'lima':        [40.74,  -84.10], 'youngstown':[41.10, -80.65], 'canton':   [40.80,  -81.37],
  'lorain city': [41.45,  -82.18], 'elyria':   [41.37,  -82.10], 'springfield':[39.92,-83.81],
};

function coordsFromLocation(city) {
  if (!city) return [...OHIO_CENTER];
  const lower = city.toLowerCase();
  for (const [key, coords] of Object.entries(COUNTY_COORDS)) {
    if (lower.includes(key)) return [...coords];
  }
  // Add small random jitter to avoid exact overlap for unknown cities
  return [OHIO_CENTER[0] + (Math.random() - 0.5) * 3, OHIO_CENTER[1] + (Math.random() - 0.5) * 4];
}

function initMap() {
  map = L.map('judgeMap').setView(OHIO_CENTER, OHIO_ZOOM);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors © CARTO',
    maxZoom: 18
  }).addTo(map);
}

function makeMarkerIcon(color = '#357a38') {
  return L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;background:${color};border:2px solid #1c3a1c;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.25);">
             <div style="width:8px;height:8px;background:white;border-radius:50%;"></div>
           </div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14],
  });
}

function renderJudges(judges) {
  const list = document.getElementById('judgeList');
  // Clear existing markers
  Object.values(markers).forEach(m => map.removeLayer(m));
  markers = {};

  const filtered = judges.filter(j => {
    const fieldMatch  = activeFilter === 'all' || (j.expertise || []).some(e => e.includes(activeFilter));
    const levelMatch  = activeLevelFilter === 'all' || j.available_level === activeLevelFilter || j.available_level === 'Any level';
    return fieldMatch && levelMatch;
  });

  document.getElementById('judgeCount').textContent = `${filtered.length} judge${filtered.length !== 1 ? 's' : ''} shown`;

  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state">No judges match the current filter.</div>';
    return;
  }

  list.innerHTML = '';
  filtered.forEach(judge => {
    const coords = coordsFromLocation(judge.city);
    // Sidebar item
    const item = document.createElement('div');
    item.className = 'judge-item';
    item.dataset.id = judge.id;
    item.innerHTML = `
      <div class="judge-item-name">${judge.name}</div>
      <div class="judge-item-org">${judge.org || 'Independent'}</div>
      <div class="judge-item-tags">${(judge.expertise || []).map(e => `<span class="judge-tag">${e.split('/')[0].trim()}</span>`).join('')}</div>
      <div class="judge-item-level">${judge.available_level || 'Any level'} · ${judge.city || 'Ohio'}</div>`;
    item.addEventListener('click', () => {
      document.querySelectorAll('.judge-item').forEach(i => i.classList.remove('highlighted'));
      item.classList.add('highlighted');
      if (markers[judge.id]) {
        map.setView(coords, 10, { animate: true });
        markers[judge.id].openPopup();
      }
    });
    list.appendChild(item);

    // Map marker
    const marker = L.marker(coords, { icon: makeMarkerIcon() }).addTo(map);
    markers[judge.id] = marker;
    marker.bindPopup(`
      <div class="judge-popup">
        <div class="judge-popup-name">${judge.name}</div>
        <div class="judge-popup-org">${judge.org || 'Independent'} · ${judge.city || 'Ohio'}</div>
        <div class="judge-popup-tags">${(judge.expertise || []).map(e => `<span class="judge-popup-tag">${e.split('/')[0].trim()}</span>`).join('')}</div>
        <div style="font-size:0.75rem;color:#6b756b;margin-bottom:8px;">Available for: ${judge.available_level || 'Any level'}</div>
        <button class="judge-popup-btn" onclick="openMatchModal('${judge.id}','${escHtml(judge.name)}','${escHtml(judge.email || '')}')">Send Match Request →</button>
      </div>`);
    marker.on('click', () => {
      document.querySelectorAll('.judge-item').forEach(i => i.classList.remove('highlighted'));
      const sidebarItem = list.querySelector(`[data-id="${judge.id}"]`);
      if (sidebarItem) { sidebarItem.classList.add('highlighted'); sidebarItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    });
  });

  // Update stats
  const districts = new Set(filtered.map(j => j.city?.split(',')[0]?.trim()).filter(Boolean)).size;
  const fields    = new Set(filtered.flatMap(j => j.expertise || [])).size;
  document.getElementById('statTotal').textContent    = judges.length;
  document.getElementById('statActive').textContent   = filtered.length;
  document.getElementById('statFields').textContent   = fields;
  document.getElementById('statDistricts').textContent = districts;
}

function escHtml(s) { return s.replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

function filterJudges(field, btn) {
  document.querySelectorAll('#filterChips .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = field;
  renderJudges(allJudges);
}
function filterLevel(level, btn) {
  btn.closest('.filter-chips').querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  activeLevelFilter = level;
  renderJudges(allJudges);
}
window.filterJudges = filterJudges;
window.filterLevel  = filterLevel;

async function loadJudges() {
  if (!sb) {
    // Demo data when Supabase isn't connected
    allJudges = [
      { id:'demo1', name:'Dr. Sarah Mitchell', org:'Ohio State University', city:'Columbus, Franklin County', expertise:['Biology / Life Sciences','Environmental Science'], available_level:'Any level', email:'' },
      { id:'demo2', name:'Prof. James Chen',   org:'Case Western Reserve',  city:'Cleveland, Cuyahoga County', expertise:['Physics / Engineering','Computer Science / Math'], available_level:'District fair', email:'' },
      { id:'demo3', name:'Dr. Maria Santos',   org:'University of Cincinnati', city:'Cincinnati, Hamilton County', expertise:['Chemistry / Biochemistry','Medicine / Health Sciences'], available_level:'School fair', email:'' },
      { id:'demo4', name:'Mark Thompson',      org:'Procter & Gamble',       city:'Cincinnati, Hamilton County', expertise:['Chemistry / Biochemistry'], available_level:'School fair', email:'' },
      { id:'demo5', name:'Dr. Linda Park',     org:'Cleveland Clinic',       city:'Cleveland, Cuyahoga County', expertise:['Medicine / Health Sciences','Biology / Life Sciences'], available_level:'Any level', email:'' },
      { id:'demo6', name:'Prof. Robert Davis',  org:'Toledo University',     city:'Toledo, Lucas County', expertise:['Environmental Science','Physics / Engineering'], available_level:'District fair', email:'' },
    ];
    renderJudges(allJudges);
    return;
  }
  const { data, error } = await sb.from('judges').select('*').eq('status','active').order('created_at', { ascending: false });
  if (error) { console.error('Failed to load judges:', error); return; }
  allJudges = data || [];
  renderJudges(allJudges);
}

function toggleRegister() {
  document.getElementById('registerPanel').classList.toggle('open');
}
window.toggleRegister = toggleRegister;

async function registerJudgeMap() {
  const name  = document.getElementById('rjName').value.trim();
  const email = document.getElementById('rjEmail').value.trim();
  const org   = document.getElementById('rjOrg').value.trim();
  const city  = document.getElementById('rjCity').value.trim();
  const level = document.getElementById('rjLevel').value;
  const expertise = ['rje1','rje2','rje3','rje4','rje5','rje6'].map((id, i) => {
    const labels = ['Biology / Life Sciences','Chemistry / Biochemistry','Physics / Engineering','Environmental Science','Computer Science / Math','Medicine / Health Sciences'];
    return document.getElementById(id).checked ? labels[i] : null;
  }).filter(Boolean);
  const msg = document.getElementById('rjMsg');

  if (!name || !email || !city) { msg.textContent = 'Please fill in name, email, and city.'; msg.style.color = '#c0392b'; return; }
  msg.textContent = 'Adding you to the map...'; msg.style.color = 'var(--gray-500)';

  if (sb) {
    const { error } = await sb.from('judges').insert([{ name, email, org, city, expertise, available_level: level, status: 'active' }]);
    if (error) { msg.textContent = 'Error — please try again or email us.'; msg.style.color = '#c0392b'; return; }
  }

  msg.textContent = 'You\'re on the map! Refresh to see your pin.'; msg.style.color = 'var(--green-600)';
  logEvent('judge_registered', { city, expertise });
  await loadJudges();
}
window.registerJudgeMap = registerJudgeMap;

/* ── MATCH REQUEST ─────────────────────────────────────── */
function openMatchModal(judgeId, judgeName, judgeEmail) {
  document.getElementById('targetJudgeId').value    = judgeId;
  document.getElementById('targetJudgeName').value  = judgeName;
  document.getElementById('targetJudgeEmail').value = judgeEmail;
  document.getElementById('matchModal').classList.add('open');
  // Set min date to today
  document.getElementById('reqDate').min = new Date().toISOString().split('T')[0];
}
function closeModal() { document.getElementById('matchModal').classList.remove('open'); }
window.openMatchModal = openMatchModal;
window.closeModal     = closeModal;

async function sendMatchRequest() {
  const judgeId    = document.getElementById('targetJudgeId').value;
  const judgeName  = document.getElementById('targetJudgeName').value;
  const judgeEmail = document.getElementById('targetJudgeEmail').value;
  const teacher    = document.getElementById('reqTeacher').value.trim();
  const teacherEmail = document.getElementById('reqTeacherEmail').value.trim();
  const school     = document.getElementById('reqSchool').value.trim();
  const date       = document.getElementById('reqDate').value;
  const message    = document.getElementById('reqMessage').value.trim();
  const msgEl      = document.getElementById('reqMsg');

  if (!teacher || !teacherEmail || !school || !date) {
    msgEl.textContent = 'Please fill in all required fields.'; msgEl.style.color = '#c0392b'; return;
  }

  msgEl.textContent = 'Sending request...'; msgEl.style.color = 'var(--gray-500)';

  if (sb) {
    // Log the match request in Supabase
    const { error } = await sb.from('judge_requests').insert([{
      judge_id: judgeId, judge_email: judgeEmail, judge_name: judgeName,
      teacher_name: teacher, teacher_email: teacherEmail,
      school, fair_date: date, message,
      status: 'pending'
    }]);
    if (error) { msgEl.textContent = 'Error saving request. Please email us directly.'; msgEl.style.color = '#c0392b'; return; }
  }

  // Trigger email via mailto as fallback (replace with Supabase Edge Function when ready)
  const subject = encodeURIComponent(`Science Fair Judge Request — ${school}`);
  const body    = encodeURIComponent(
    `Hi ${judgeName},\n\nMy name is ${teacher} and I'm coordinating the science fair at ${school}.\n\n` +
    `Fair date: ${date}\n\n${message ? message + '\n\n' : ''}` +
    `We'd love to have you join us as a judge. Please reply to this email or contact me at ${teacherEmail} to confirm.\n\n` +
    `Thank you!\n${teacher}`
  );

  if (judgeEmail) {
    window.open(`mailto:${judgeEmail}?subject=${subject}&body=${body}`);
  }

  msgEl.textContent = `Request sent to ${judgeName}!`; msgEl.style.color = 'var(--green-600)';
  logEvent('judge_request_sent', { judge_id: judgeId, school });

  setTimeout(() => { closeModal(); document.getElementById('reqMsg').textContent = ''; }, 2000);
}
window.sendMatchRequest = sendMatchRequest;

/* ── BOOT ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  loadJudges();
});

<footer>
  <div class="container">
    <div class="footer-grid">
      <div>
        <div class="f-brand-name">FairGame Initiative</div>
        <p class="f-brand-desc">Bringing competitive STEM opportunities to rural and low-income schools. Advised by Forbes 30 Under 30 founders and nationwide STEM education experts.</p>
        &nbsp;·&nbsp;
        <a href="/privacy.html" style="color:rgba(255,255,255,.6);">Privacy Policy</a>
        &nbsp;·&nbsp;
        <a href="/terms.html" style="color:rgba(255,255,255,.6);">Terms of Service</a>
        <div class="f-social">
          <a href="#" title="Instagram">IG</a>
          <a href="#" title="Twitter / X">X</a>
          <a href="#" title="LinkedIn">in</a>
          <a href="#" title="TikTok">TK</a>
        </div>
      </div>
      <div class="f-col">
        <h5>Resources</h5>
        <ul>
          <li><a href="/starthere.html">Start Here</a></li>
          <li><a href="/setupguide.html">Setup Guide</a></li>
          <li><a href="/stateresources.html">State Resources</a></li>
          <li><a href="/researchguide.html">Research Guide</a></li>
          <li><a href="/teachers-professionals.html">For Teachers</a></li>
        </ul>
      </div>
      <div class="f-col">
        <h5>Get Involved</h5>
        <ul>
          <li><a href="/volunteer.html">Volunteer / Judge</a></li>
          <li><a href="/donate.html">Donate</a></li>
          <li><a href="#portal">Ambassador Portal</a></li>
          <li><a href="mailto:fairgameinitiative@outlook.com">Partner With Us</a></li>
        </ul>
      </div>
      <div class="f-col">
        <h5>Organization</h5>
        <ul>
          <li><a href="/successstories.html">Success Stories</a></li>
          <li><a href="mailto:fairgameinitiative@outlook.com">Contact Us</a></li>
          <li><a href="https://fairgameinitiative.org">fairgameinitiative.org</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <p>© 2026 FairGame Initiative · All rights reserved.</p>
      <div><a href="#">Privacy Policy</a><a href="#">Terms of Service</a></div>
    </div>
  </div>
</footer>
