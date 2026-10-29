/* ── JUDGE MAP PAGE LOGIC ────────────────────────────────── */
let map, allJudges = [], markers = {}, activeFilter = 'all', activeLevelFilter = 'all';

// Continental US. Judges are placed from the latitude/longitude saved at
// sign-up, or from their ZIP / city / state for older rows (geo.js).
const US_CENTER = [39.5, -98.35];
const US_ZOOM   = 4;
const judgePoints = new Map();

function initMap() {
  map = L.map('judgeMap').setView(US_CENTER, US_ZOOM);
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
    list.innerHTML = allJudges.length
      ? '<div class="empty-state">No judges match the current filter.</div>'
      : '<div class="empty-state">No judges have joined the network yet - check back later.</div>';
    return;
  }

  list.innerHTML = '';
  const bounds = [];
  filtered.forEach(judge => {
    const pt = judgePoints.get(String(judge.id));
    const coords = pt ? [pt.lat, pt.lng] : null;
    if (coords) bounds.push(coords);
    // Sidebar item
    const item = document.createElement('div');
    item.className = 'judge-item';
    item.dataset.id = judge.id;
    item.innerHTML = `
      <div class="judge-item-name">${judge.name}</div>
      <div class="judge-item-org">${judge.org || 'Independent'}</div>
      <div class="judge-item-tags">${(judge.expertise || []).map(e => `<span class="judge-tag">${e.split('/')[0].trim()}</span>`).join('')}</div>
      <div class="judge-item-level">${judge.available_level || 'Any level'} · ${FG_GEO.label(judge)}</div>`;
    item.addEventListener('click', () => {
      document.querySelectorAll('.judge-item').forEach(i => i.classList.remove('highlighted'));
      item.classList.add('highlighted');
      if (markers[judge.id]) {
        map.setView(coords, 10, { animate: true });
        markers[judge.id].openPopup();
      }
    });
    list.appendChild(item);
    if (!coords) return;

    // Map marker
    const marker = L.marker(coords, { icon: makeMarkerIcon() }).addTo(map);
    markers[judge.id] = marker;
    marker.bindPopup(`
      <div class="judge-popup">
        <div class="judge-popup-name">${judge.name}</div>
        <div class="judge-popup-org">${judge.org || 'Independent'} · ${FG_GEO.label(judge)}</div>
        <div class="judge-popup-tags">${(judge.expertise || []).map(e => `<span class="judge-popup-tag">${e.split('/')[0].trim()}</span>`).join('')}</div>
        <div style="font-size:0.75rem;color:#6b756b;margin-bottom:8px;">Available for: ${judge.available_level || 'Any level'}</div>
        <button class="judge-popup-btn" onclick="openMatchModal('${judge.id}','${escHtml(judge.name)}')">Send Match Request →</button>
      </div>`);
    marker.on('click', () => {
      document.querySelectorAll('.judge-item').forEach(i => i.classList.remove('highlighted'));
      const sidebarItem = list.querySelector(`[data-id="${judge.id}"]`);
      if (sidebarItem) { sidebarItem.classList.add('highlighted'); sidebarItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    });
  });

  if (bounds.length && !map._fgFitted) { map.fitBounds(bounds, { padding: [30, 30], maxZoom: 8 }); map._fgFitted = true; }

  // Update stats
  const districts = new Set(filtered.map(j => (j.country || 'US') + ':' + (j.state_code || j.region || '')).filter(k => !k.endsWith(':'))).size;
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
      { id:'demo1', name:'Dr. Sarah Mitchell', org:'Ohio State University', city:'Columbus', state_code:'OH', expertise:['Biology / Life Sciences','Environmental Science'], available_level:'Any level', email:'' },
      { id:'demo2', name:'Prof. James Chen',   org:'Case Western Reserve',  city:'Cleveland', state_code:'OH', expertise:['Physics / Engineering','Computer Science / Math'], available_level:'District fair', email:'' },
      { id:'demo3', name:'Dr. Maria Santos',   org:'University of Cincinnati', city:'Atlanta', state_code:'GA', expertise:['Chemistry / Biochemistry','Medicine / Health Sciences'], available_level:'School fair', email:'' },
      { id:'demo4', name:'Mark Thompson',      org:'Procter & Gamble',       city:'Cincinnati', state_code:'OH', expertise:['Chemistry / Biochemistry'], available_level:'School fair', email:'' },
      { id:'demo5', name:'Dr. Linda Park',     org:'Cleveland Clinic',       city:'Phoenix', state_code:'AZ', expertise:['Medicine / Health Sciences','Biology / Life Sciences'], available_level:'Any level', email:'' },
      { id:'demo6', name:'Prof. Robert Davis',  org:'Toledo University',     city:'Denver', state_code:'CO', expertise:['Environmental Science','Physics / Engineering'], available_level:'District fair', email:'' },
    ];
    await placeJudges();
    renderJudges(allJudges);
    return;
  }
  try {
    // Public columns only. judges_public (migration 16) is the safe source;
    // until it exists, ask the table for the same columns rather than '*',
    // which handed every visitor each judge's email and private notes.
    const COLS = 'id,name,org,city,state_code,country,region,expertise,available_level,travel_miles,travel_range,virtual_ok,latitude,longitude,geocode_source,created_at';
    let { data, error } = await sb.from('judges_public').select(COLS).order('created_at', { ascending: false });
    if (error) ({ data, error } = await sb.from('judges').select(COLS).eq('status','active').order('created_at', { ascending: false }));
    if (error) throw new Error(error.message);
    allJudges = data || [];
  } catch (err) {
    // Leaving "Loading judge network..." on screen would be a lie. Say what
    // happened and give a way out.
    console.warn('Failed to load judges:', err.message);
    document.getElementById('judgeCount').textContent = 'Could not load judges';
    document.getElementById('judgeList').innerHTML =
      '<div class="empty-state">We couldn\u2019t load the judge network just now. ' +
      '<button type="button" class="btn-xs" onclick="loadJudges()">Try again</button></div>';
    return;
  }
  await placeJudges();
  renderJudges(allJudges);
}
window.loadJudges = loadJudges;

async function placeJudges() {
  await Promise.all(allJudges.map(async j => {
    if (judgePoints.has(String(j.id))) return;
    const pt = await FG_GEO.resolveJudge(j).catch(() => null);
    if (pt) judgePoints.set(String(j.id), pt);
  }));
}

/* ── MATCH REQUEST ─────────────────────────────────────── */
function openMatchModal(judgeId, judgeName) {
  document.getElementById('targetJudgeId').value    = judgeId;
  document.getElementById('targetJudgeName').value  = judgeName;
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
    // The id is made here so the notify function can be handed it without
    // reading the row back, which an anonymous visitor cannot do.
    const id = crypto.randomUUID();
    const { error } = await sb.from('judge_requests').insert([{
      id, judge_id: judgeId, judge_name: judgeName,
      teacher_name: teacher, teacher_email: teacherEmail,
      school, fair_date: date, message,
      status: 'pending'
    }]);
    if (error) { msgEl.textContent = 'Error saving request. Please email us directly.'; msgEl.style.color = '#c0392b'; return; }

    /* Judges' addresses are no longer handed to the public page, so the
       judge is emailed by supabase/functions/judge-request-notify, with
       the teacher as Reply-To. Until that is deployed the request still
       waits in the judge's portal. */
    sb.functions.invoke('judge-request-notify', { body: { id } }).catch(() => {});
  }

  msgEl.textContent = `Request sent to ${judgeName}! They will reply to you at ${teacherEmail}.`; msgEl.style.color = 'var(--green-600)';
  logEvent('judge_request_sent', { judge_id: judgeId, school });

  setTimeout(() => { closeModal(); document.getElementById('reqMsg').textContent = ''; }, 2000);
}
window.sendMatchRequest = sendMatchRequest;

/* ── BOOT ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  loadJudges();
});

document.addEventListener('visibilitychange', () => { if (!document.hidden) loadJudges(); });
