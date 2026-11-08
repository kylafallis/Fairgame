/* ================================================================
   FairGame - portal-state.js
   The state director / regional coordinator portal.

   Everything on the page comes from one call, fg_state_overview
   (migration 18), which decides what the caller may see:
     - a state director gets their own state, whatever is asked for;
     - a regional coordinator gets their own region;
     - an admin gets whichever state (and region) is in the URL, so
       /portal-state?state=OH is a preview of exactly what the Ohio
       director sees.
   Writes go through fg_save_region / fg_delete_region / fg_revoke_invite
   / fg_remove_state_role, and invitations through fgCreateInvite in
   portal-shared.js. The page never reads a table directly.
   ================================================================ */

'use strict';

const SP = {
  role: null,          // the signed-in person's role
  state: null,         // two-letter code being shown
  region: null,        // region id when looking at one region
  data: null,          // last fg_state_overview result
  counties: [],        // every county in the state, from /data/geo/counties.json
  stateNames: {},
};

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
const lc = s => String(s || '').trim().toLowerCase();
/* County names compared the way the database does (fg_county_key):
   no case, accents, punctuation or "County"/"Parish" suffix, so
   "Prince Georges" from the ZIP list matches "Prince George's" on the map. */
const ck = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+(county|parish|borough|census area|city and borough|municipality)\s*$/i, '')
  .replace(/[^a-z0-9]/gi, '').toLowerCase();
function fmtDate(d) {
  if (!d) return '';
  const t = new Date(String(d).length === 10 ? d + 'T12:00:00' : d);
  return isNaN(t) ? '' : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
const ROLE_LABEL = { state_director: 'State director', regional_coordinator: 'Regional coordinator', admin: 'Admin' };
const stateName = c => SP.stateNames[c] || c || '';
const countyOf = j => Array.isArray(j.county) ? j.county[0] : j.county;

/* ── Sample data for ?demo=true ───────────────────────────────── */
const DEMO_OVERVIEW = {
  state_code: 'OH', viewer: 'state_director',
  regions: [
    { id: 'r1', name: 'Northwest', counties: ['Allen', 'Lucas', 'Wood', 'Hancock'] },
    { id: 'r2', name: 'Central', counties: ['Franklin', 'Delaware', 'Licking'] },
  ],
  fairs: [
    { id: 'f1', slug: 'oh-northwest-district', name: 'Northwest District Science Day', level: 'district', county: 'Allen', city: 'Lima', event_start_date: '2027-03-06', verification_status: 'verified', judges_needed: true, judges_needed_count: 40, website_url: 'https://example.org', grade_min: 5, grade_max: 12, about: 'The district fair for eight counties in northwest Ohio.' },
    { id: 'f2', slug: 'oh-central-regional', name: 'Central Ohio Regional Science Fair', level: 'regional', county: 'Franklin', event_start_date: null, verification_status: 'lead', judges_needed: true },
    { id: 'f3', slug: 'oh-athens-county', name: 'Athens County Science Fair', level: 'district', county: 'Athens', event_start_date: '2027-02-20', verification_status: 'lead' },
  ],
  judges: [
    { id: 'j1', name: 'Dr. Robert Davis', org: 'Ohio Northern University', city: 'Lima', county: 'Allen', expertise: ['Environmental Science'], status: 'active', available_level: 'Any level' },
    { id: 'j2', name: 'Dr. Laura Chen', org: 'Allen County Health', city: 'Lima', county: 'Allen', expertise: ['Biology / Life Sciences'], status: 'unverified', available_level: 'School fair' },
    { id: 'j3', name: 'Mark Thompson', org: 'Procter & Gamble', city: 'Columbus', county: 'Franklin', expertise: ['Chemistry / Biochemistry'], status: 'active', available_level: 'District fair' },
    { id: 'j4', name: 'Jamie Ortiz', org: 'Retired teacher', city: 'Athens', county: 'Athens', expertise: ['Physics / Engineering'], status: 'active' },
    { id: 'j5', name: 'Sam Lee', org: null, city: null, county: null, expertise: [], status: 'active' },
  ],
  people: [{ user_id: 'u1', role: 'regional_coordinator', full_name: 'Cora Diaz', email: 'cora@example.org', region_id: 'r1' }],
  invites: [{ id: 'i1', role: 'regional_coordinator', email: 'pat@example.org', full_name: 'Pat Kim', region_id: 'r2', created_at: '2026-11-01T12:00:00Z', expires_at: '2026-11-15T12:00:00Z', emailed_at: '2026-11-01T12:00:00Z', status: 'open' }],
  issues: [
    { kind: 'fair', id: 'f2', severity: 'warn', message: 'Central Ohio Regional Science Fair has no fair date.' },
    { kind: 'fair', id: 'f2', severity: 'warn', message: 'Central Ohio Regional Science Fair is not verified yet. Check its details and mark it verified.' },
    { kind: 'fair', id: 'f3', severity: 'warn', message: 'Athens County Science Fair is not verified yet. Check its details and mark it verified.' },
    { kind: 'judge', id: 'j5', severity: 'warn', message: 'Sam Lee has no county, so they are not in any region.' },
    { kind: 'judge', id: 'j4', severity: 'info', message: 'Jamie Ortiz is in Athens County, which is not in any region yet.' },
    { kind: 'region', id: 'r2', severity: 'info', message: 'Region "Central" has no coordinator yet.' },
  ],
};

/* ── Start ─────────────────────────────────────────────────────── */
requireAuth(['state_director', 'regional_coordinator'], async () => {
  try {
    const regions = await FG_GEO.regions('US');
    regions.forEach(r => { SP.stateNames[r.code] = r.name; });
  } catch (_) { /* names are cosmetic; codes still work */ }

  const q = new URLSearchParams(location.search);
  SP.role = currentRole;

  if (!sb) {                                  // ?demo=true
    SP.role = q.get('as') === 'admin' ? 'admin' : 'state_director';
    SP.state = 'OH';
  } else if (SP.role === 'admin') {
    SP.state = (q.get('state') || 'OH').toUpperCase().slice(0, 2);
    SP.region = q.get('region') || null;
  } else {
    const { data, error } = await sb.rpc('fg_my_scope');
    const me = Array.isArray(data) ? data[0] : data;
    if (error || !me?.state_code) {
      document.querySelector('.portal-content').innerHTML =
        '<div class="card"><div class="card-body">Your account is not attached to a state yet. Email <a href="mailto:fairgameinitiative@outlook.com">fairgameinitiative@outlook.com</a> and we will sort it out.</div></div>';
      return;
    }
    SP.state = me.state_code;
    SP.region = me.region_id;
  }

  setupChrome();
  onSectionLoad('home', loadOverview);
  ['fairs', 'judges', 'regions', 'team'].forEach(s => onSectionLoad(s, () => { if (!SP.data) return loadOverview(); }));
});

/* Labels, the admin preview bar, and what this person can change. */
function setupChrome() {
  const isAdmin = SP.role === 'admin';
  const viewingRegion = !!SP.region;
  const asCoordinator = SP.role === 'regional_coordinator' || (isAdmin && viewingRegion);

  document.getElementById('navRoleLabel').textContent =
    isAdmin ? 'Admin preview' : ROLE_LABEL[SP.role] || 'State';
  document.getElementById('navStateName').textContent = stateName(SP.state) || 'My State';
  document.title = `${stateName(SP.state)} - FairGame State Portal`;
  if (isAdmin) document.getElementById('navAdminBack').style.display = '';

  // Coordinators look; they do not redraw regions or invite people.
  document.body.classList.toggle('sp-readonly', asCoordinator);
  if (asCoordinator) {
    document.querySelectorAll('.sp-team-link').forEach(a => a.style.display = 'none');
    document.getElementById('regionsSub').textContent = 'Your region and the counties in it. Your state director draws the regions.';
  }
  document.getElementById('directorInviteCard').style.display = isAdmin && !viewingRegion ? '' : 'none';

  if (isAdmin) {
    document.getElementById('previewBar').style.display = '';
    const sel = document.getElementById('previewState');
    const codes = Object.keys(SP.stateNames).length ? Object.keys(SP.stateNames) : [SP.state];
    sel.innerHTML = codes.sort((a, b) => stateName(a).localeCompare(stateName(b)))
      .map(c => `<option value="${esc(c)}"${c === SP.state ? ' selected' : ''}>${esc(stateName(c))}</option>`).join('');
  }
}

function changePreview() {
  const st = document.getElementById('previewState').value;
  const rg = document.getElementById('previewRegion').value;
  const p = new URLSearchParams({ state: st });
  // A region only makes sense inside the state it belongs to.
  if (rg && st === SP.state) p.set('region', rg);
  location.search = p.toString();
}
window.changePreview = changePreview;

/* ── Load ──────────────────────────────────────────────────────── */
async function fetchOverview() {
  if (!sb) return JSON.parse(JSON.stringify(DEMO_OVERVIEW));
  const { data, error } = await sb.rpc('fg_state_overview', { p_state: SP.state, p_region: SP.region });
  if (error) {
    if (/function .* does not exist|schema cache/i.test(error.message)) {
      throw new Error('Migration 18 has not been run on this database yet.');
    }
    throw new Error(error.message);
  }
  return data;
}

async function loadCounties() {
  try {
    const r = await fetch('/data/geo/counties.json');
    const all = await r.json();
    SP.counties = all[SP.state] || [];
  } catch (_) { SP.counties = []; }
}

async function loadOverview() {
  const issuesEl = document.getElementById('issuesList');
  try {
    const [data] = await Promise.all([fetchOverview(), SP.counties.length ? null : loadCounties()]);
    SP.data = data;
  } catch (e) {
    issuesEl.innerHTML = `<div class="empty-state"><p>${esc(e.message || 'Could not load this state.')} <button class="btn-xs" type="button" onclick="loadOverview()">Try again</button></p></div>`;
    return;
  }
  if (SP.data.no_region) {
    issuesEl.innerHTML = '<div class="empty-state"><p>Your region was removed. Ask your state director to add you to another one.</p></div>';
    return;
  }
  renderAll();
  // Arriving from a fair page's "Edit" link.
  const want = new URLSearchParams(location.search).get('fair');
  if (want && !SP.openedFromUrl) {
    SP.openedFromUrl = true;
    if ((SP.data.fairs || []).some(f => f.id === want)) { showSection('fairs'); openFair(want); }
  }
}
window.loadOverview = loadOverview;

/* County -> region lookup from the regions in the overview. */
function regionIndex() {
  const idx = {};
  (SP.data?.regions || []).forEach(r => (r.counties || []).forEach(c => { idx[ck(c)] = r; }));
  return idx;
}
function fairRegion(f, idx) {
  const own = idx[ck(f.county)];
  if (own) return own;
  for (const c of (f.counties_served || [])) if (idx[ck(c)]) return idx[ck(c)];
  return null;
}

function renderAll() {
  renderHome();
  renderFairs();
  renderJudges();
  renderRegions();
  renderTeam();
  fillRegionSelects();
}

function fillRegionSelects() {
  const regions = SP.data.regions || [];
  const opts = regions.map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
  ['fairRegion', 'judgeRegion'].forEach(id => {
    const el = document.getElementById(id);
    const cur = el.value;
    el.innerHTML = '<option value="">All regions</option><option value="__none">Not in a region</option>' + opts;
    el.value = cur;
    el.style.display = regions.length > 1 ? '' : 'none';
  });
  const c = document.getElementById('cRegion');
  c.innerHTML = regions.length ? opts : '<option value="">Draw a region first</option>';

  if (SP.role === 'admin') {
    const pr = document.getElementById('previewRegion');
    pr.innerHTML = '<option value="">As state director</option>' +
      regions.map(r => `<option value="${esc(r.id)}"${r.id === SP.region ? ' selected' : ''}>As coordinator: ${esc(r.name)}</option>`).join('');
  }
}

/* ── Overview ──────────────────────────────────────────────────── */
function renderHome() {
  const d = SP.data;
  const region = d.region;
  document.getElementById('homeTitle').textContent = region ? `${region.name}, ${stateName(d.state_code)}` : stateName(d.state_code);
  document.getElementById('homeSub').textContent = region
    ? `${(region.counties || []).length} counties. The fairs and volunteer judges in your region, and anything that needs a look.`
    : 'Every fair and volunteer judge FairGame has here, and anything that needs a look.';

  const judges = d.judges || [];
  document.getElementById('kFairs').textContent = (d.fairs || []).length;
  document.getElementById('kJudges').textContent = judges.filter(j => j.status === 'active').length;
  document.getElementById('kPending').textContent = judges.filter(j => j.status === 'unverified').length;
  document.getElementById('kRegions').textContent = region ? (region.counties || []).length : (d.regions || []).length;
  document.getElementById('kRegionsL').textContent = region ? 'Counties' : 'Regions';

  const issues = d.issues || [];
  const warn = issues.filter(i => i.severity === 'warn').length;
  const badge = document.getElementById('issueBadge');
  badge.textContent = warn; badge.style.display = warn ? '' : 'none';
  document.getElementById('issueCount').textContent = issues.length ? `${issues.length} item${issues.length === 1 ? '' : 's'}` : '';
  const list = document.getElementById('issuesList');
  if (!issues.length) {
    list.innerHTML = '<div class="empty-state"><p>Nothing to fix. Everything here looks complete.</p></div>';
  } else {
    const sorted = [...issues].sort((a, b) => (a.severity === 'warn' ? 0 : 1) - (b.severity === 'warn' ? 0 : 1));
    const go = { fair: 'Open fair', judge: 'Show judge', region: 'Open region' };
    list.innerHTML = '<ul class="sp-issues">' + sorted.map(i => {
      const live = i.id && go[i.kind];
      return `<li${live ? ` class="sp-go" tabindex="0" role="button" data-kind="${esc(i.kind)}" data-id="${esc(i.id)}"` : ''}><span class="sp-dot ${i.severity === 'warn' ? 'warn' : ''}" title="${i.severity === 'warn' ? 'Needs fixing' : 'Worth a look'}"></span><span class="sp-kind">${esc(i.kind)}</span><span>${esc(i.message)}</span>${live ? `<span class="sp-arrow">${go[i.kind]} →</span>` : ''}</li>`;
    }).join('') + '</ul>';
    list.querySelectorAll('li.sp-go').forEach(li => {
      const open = () => openIssue(li.dataset.kind, li.dataset.id);
      li.addEventListener('click', open);
      li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }

  // Regions at a glance
  const idx = regionIndex();
  const coord = {};
  (d.people || []).forEach(p => { if (p.role === 'regional_coordinator' && p.region_id) (coord[p.region_id] ||= []).push(p.full_name || p.email); });
  const tb = document.getElementById('regionSummary');
  const rows = (d.regions || []).map(r => {
    const fairs = (d.fairs || []).filter(f => fairRegion(f, idx)?.id === r.id).length;
    const js = judges.filter(j => j.status === 'active' && idx[ck(countyOf(j))]?.id === r.id).length;
    const who = coord[r.id]?.join(', ') || (SP.data.viewer === 'regional_coordinator' ? 'You' : '<span class="text-muted">None yet</span>');
    return `<tr><td class="col-name">${esc(r.name)}</td><td class="col-sm">${(r.counties || []).length}</td><td>${fairs}</td><td>${js}</td><td class="col-sm">${coord[r.id] ? esc(who) : who}</td></tr>`;
  });
  if (!region) {
    const outFairs = (d.fairs || []).filter(f => !fairRegion(f, idx)).length;
    const outJudges = judges.filter(j => j.status === 'active' && !idx[ck(countyOf(j))]).length;
    if (outFairs || outJudges) rows.push(`<tr><td class="text-muted">Not in a region</td><td></td><td>${outFairs}</td><td>${outJudges}</td><td></td></tr>`);
  }
  tb.innerHTML = rows.length ? rows.join('')
    : `<tr><td colspan="5"><div class="empty-state"><p>No regions yet. <a href="#" onclick="showSection('regions');return false;">Draw the first one</a>.</p></div></td></tr>`;
}

/* ── Fairs ─────────────────────────────────────────────────────── */
const STATUS_CHIP = {
  verified: ['chip-verified', 'Verified'], lead: ['chip-pending', 'Not verified'],
  stale: ['chip-unverified', 'Out of date'], retired: ['chip-declined', 'Retired'],
};
function renderFairs() {
  const tb = document.getElementById('fairsTbody');
  if (!SP.data) return;
  const idx = regionIndex();
  const q = lc(document.getElementById('fairSearch').value);
  const rf = document.getElementById('fairRegion').value;
  const sf = document.getElementById('fairStatus').value;
  const rows = (SP.data.fairs || []).filter(f => {
    const reg = fairRegion(f, idx);
    if (rf === '__none' && reg) return false;
    if (rf && rf !== '__none' && reg?.id !== rf) return false;
    if (sf === 'verified' && f.verification_status !== 'verified') return false;
    if (sf === 'todo' && f.verification_status === 'verified') return false;
    if (q && !lc([f.name, f.short_name, f.county, f.city, ...(f.counties_served || [])].join(' ')).includes(q)) return false;
    return true;
  });
  const todo = (SP.data.fairs || []).filter(f => f.verification_status !== 'verified').length;
  document.getElementById('fairsSub').innerHTML = esc((SP.data.fairs || []).length
    ? `Each fair has its own page on fairgameinitiative.org. Click a fair to check its details; once you mark it verified, its page goes public.${todo ? ` ${todo} still need checking.` : ' Every fair is verified.'}`
    : 'Each fair has its own page on fairgameinitiative.org.') +
    ` <a href="/fair?state=${encodeURIComponent(SP.state)}" target="_blank" rel="noopener">See the public ${esc(stateName(SP.state))} list ↗</a>`;
  if (!rows.length) { fgEmpty(tb, (SP.data.fairs || []).length ? 'No fairs match.' : 'No fairs here yet. Add the first one.'); return; }
  tb.innerHTML = rows.map(f => {
    const reg = fairRegion(f, idx);
    const date = f.event_start_date || f.judging_date;
    const [cls, label] = STATUS_CHIP[f.verification_status] || ['chip-pending', f.verification_status || '–'];
    const page = f.slug ? `<a href="/fair?f=${encodeURIComponent(f.slug)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${f.verification_status === 'verified' ? 'Public ↗' : 'Preview ↗'}</a>` : '';
    return `<tr class="sp-row" data-id="${esc(f.id)}" tabindex="0">
      <td class="col-name">${esc(f.name)}</td>
      <td class="col-sm" style="text-transform:capitalize;">${esc(f.level || '')}</td>
      <td class="col-sm">${esc(f.county || (f.counties_served || []).join(', ') || '–')}</td>
      <td class="col-sm">${reg ? esc(reg.name) : '<span class="text-muted">–</span>'}</td>
      <td class="col-sm">${date ? esc(fmtDate(date)) : '<span class="text-red">No date</span>'}</td>
      <td><span class="chip ${cls}">${esc(label)}</span></td>
      <td class="col-sm">${page}</td>
    </tr>`;
  }).join('');
  tb.querySelectorAll('tr.sp-row').forEach(tr => {
    tr.addEventListener('click', () => openFair(tr.dataset.id));
    tr.addEventListener('keydown', e => { if (e.key === 'Enter') openFair(tr.dataset.id); });
  });
}
window.renderFairs = renderFairs;

/* ── Judges ────────────────────────────────────────────────────── */
const JUDGE_CHIP = { active: ['chip-active', 'Active'], unverified: ['chip-unverified', 'In review'], inactive: ['chip-inactive', 'Inactive'] };
function renderJudges() {
  const tb = document.getElementById('judgesTbody');
  if (!SP.data) return;
  const idx = regionIndex();
  const q = lc(document.getElementById('judgeSearch').value);
  const rf = document.getElementById('judgeRegion').value;
  const st = document.getElementById('judgeStatus').value;
  const all = SP.data.judges || [];
  const rows = all.filter(j => {
    const reg = idx[ck(countyOf(j))];
    if (rf === '__none' && reg) return false;
    if (rf && rf !== '__none' && reg?.id !== rf) return false;
    if (st && j.status !== st) return false;
    if (q && !lc([j.name, j.org, j.city, countyOf(j), ...(j.expertise || [])].join(' ')).includes(q)) return false;
    return true;
  });
  if (!rows.length) { fgEmpty(tb, all.length ? 'No judges match.' : 'No judges have signed up here yet.'); return; }
  tb.innerHTML = rows.map(j => {
    const reg = idx[ck(countyOf(j))];
    const [cls, label] = JUDGE_CHIP[j.status] || ['chip-pending', j.status || '–'];
    const levels = (j.preferred_levels && j.preferred_levels.length) ? j.preferred_levels.join(', ') : (j.available_level || '');
    return `<tr data-id="${esc(j.id)}">
      <td class="col-name">${esc(j.name || '–')}${j.org ? `<div class="text-xs text-muted">${esc(j.org)}</div>` : ''}</td>
      <td class="col-sm">${esc((j.expertise || []).join(', '))}</td>
      <td class="col-sm">${esc(j.city || '')}</td>
      <td class="col-sm">${countyOf(j) ? esc(countyOf(j)) : '<span class="text-red">Missing</span>'}</td>
      <td class="col-sm">${reg ? esc(reg.name) : '<span class="text-muted">–</span>'}</td>
      <td class="col-sm">${esc(levels)}${j.virtual_ok ? ' <span class="text-muted">· virtual OK</span>' : ''}</td>
      <td><span class="chip ${cls}">${esc(label)}</span></td>
    </tr>`;
  }).join('');
}
window.renderJudges = renderJudges;

/* ── Regions ───────────────────────────────────────────────────
   The map and the "pick from a list" boxes are two views of one choice:
   SP.pick holds the county names in the region being edited. */
SP.pick = new Set();
SP.shapes = null;
const REGION_TINTS = ['#dbe9f7', '#fde7c8', '#e7dcf5', '#fbd9dc', '#d7f0ec', '#f3efc4', '#e3e3e3', '#f6dcf0'];

function canEditRegions() { return !document.body.classList.contains('sp-readonly'); }
function editingId() { return document.getElementById('regionId').value; }
function ownerOf(name) {
  const k = ck(name);
  return (SP.data?.regions || []).find(r => r.id !== editingId() && (r.counties || []).some(c => ck(c) === k)) || null;
}
function tintFor(regionId) {
  const i = (SP.data?.regions || []).findIndex(r => r.id === regionId);
  return REGION_TINTS[(i < 0 ? 0 : i) % REGION_TINTS.length];
}

function renderRegions() {
  const d = SP.data;
  const list = document.getElementById('regionsList');
  const idx = regionIndex();
  const judges = d.judges || [];
  const regions = d.regions || [];
  const canEdit = canEditRegions();

  if (!regions.length) {
    fgEmpty(list, canEdit ? 'No regions yet. Click counties on the map, name the region, and save.' : 'No regions yet.');
  } else {
    list.innerHTML = '<table class="data-table"><thead><tr><th>Region</th><th>Counties</th><th>Judges</th><th></th></tr></thead><tbody>' +
      regions.map(r => {
        const n = judges.filter(j => idx[ck(countyOf(j))]?.id === r.id && j.status === 'active').length;
        return `<tr>
          <td class="col-name"><i style="display:inline-block;width:10px;height:10px;background:${tintFor(r.id)};border:1px solid #8f9a8f;margin-right:7px;"></i>${esc(r.name)}${r.notes ? `<div class="text-xs text-muted">${esc(r.notes)}</div>` : ''}</td>
          <td><div class="sp-tags">${(r.counties || []).map(c => `<span class="sp-tag">${esc(c)}</span>`).join('') || '<span class="text-red text-sm">No counties</span>'}</div></td>
          <td>${n}</td>
          <td>${canEdit ? `<button class="btn-xs" type="button" onclick="editRegion('${esc(r.id)}')">Edit</button>` : ''}</td>
        </tr>`;
      }).join('') + '</tbody></table>';
  }

  const note = document.getElementById('unassignedNote');
  if (SP.counties.length && !d.region) {
    const free = SP.counties.filter(c => !idx[ck(c)]);
    note.textContent = free.length ? `${free.length} of ${SP.counties.length} counties not in a region` : 'Every county is in a region';
  } else note.textContent = '';

  // A coordinator sees their own region highlighted on the map.
  if (!canEdit) { SP.pick = new Set((d.region?.counties || regions[0]?.counties || [])); }
  drawMap();
  if (canEdit) { drawCountyGrid(); renderChips(); }
}

async function loadShapes() {
  if (SP.shapes && SP.shapes.state === SP.state) return SP.shapes;
  const r = await fetch(`/data/geo/county-shapes/${encodeURIComponent(SP.state)}.json`);
  if (!r.ok) throw new Error('no map');
  SP.shapes = { state: SP.state, ...(await r.json()) };
  return SP.shapes;
}

async function drawMap() {
  const box = document.getElementById('countyMap');
  let shapes;
  try { shapes = await loadShapes(); }
  catch (_) { box.innerHTML = '<div class="text-sm text-muted">The map for this state did not load. Use "Pick from a list instead" below.</div>'; return; }
  const canEdit = canEditRegions();
  box.classList.toggle('sp-live', canEdit);
  if (!box.querySelector('svg')) {
    box.innerHTML = `<svg viewBox="0 0 ${shapes.w} ${shapes.h}" role="img" aria-label="Map of ${esc(stateName(SP.state))} counties">` +
      shapes.counties.map(c => `<path d="${c.d}" data-name="${esc(c.n)}"></path>`).join('') + '</svg>';
    const svg = box.querySelector('svg');
    const tip = document.getElementById('mapTip');
    svg.addEventListener('mousemove', e => {
      const p = e.target.closest('path');
      if (!p) { tip.style.display = 'none'; return; }
      const name = p.dataset.name;
      const owner = ownerOf(name);
      const inEdit = SP.pick.has(name);
      const label = /city$/i.test(name) ? name : name + ' County';
      tip.textContent = label + (inEdit ? (canEditRegions() ? ' - in this region' : '') : owner ? ' - ' + owner.name : '');
      const rect = box.parentElement.getBoundingClientRect();
      tip.style.left = (e.clientX - rect.left + 14) + 'px';
      tip.style.top = (e.clientY - rect.top + 10) + 'px';
      tip.style.display = '';
    });
    svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    // Draw the county under the pointer last, so its outline is not hidden
    // under its neighbours' borders.
    svg.addEventListener('mouseover', e => { const p = e.target.closest('path'); if (p && p !== svg.lastElementChild) svg.appendChild(p); });
    svg.addEventListener('click', e => {
      const p = e.target.closest('path');
      if (!p || !canEditRegions()) return;
      const name = p.dataset.name;
      const owner = ownerOf(name);
      if (owner) { showMsg('regionMsg', `${name} County is already in "${owner.name}". Edit that region to move it.`, 'info'); return; }
      if (SP.pick.has(name)) SP.pick.delete(name); else SP.pick.add(name);
      paintMap(); syncGrid(); renderChips();
    });
  }
  paintMap();
}

function paintMap() {
  const svg = document.querySelector('#countyMap svg');
  if (!svg) return;
  const pickKeys = new Set([...SP.pick].map(ck));
  svg.querySelectorAll('path').forEach(p => {
    const name = p.dataset.name;
    const mine = pickKeys.has(ck(name));
    const owner = mine ? null : ownerOf(name);
    p.classList.toggle('sel', mine);
    p.classList.toggle('taken', !!owner && canEditRegions());
    p.style.fill = mine ? '' : owner ? tintFor(owner.id) : '';
  });
  // Legend: this region, then the others in their tints.
  const legend = document.getElementById('mapLegend');
  const others = (SP.data?.regions || []).filter(r => r.id !== editingId());
  const editing = canEditRegions()
    ? (document.getElementById('regionName').value.trim() || (editingId() ? 'This region' : 'New region'))
    : (SP.data?.region?.name || 'Your region');
  legend.innerHTML = `<span><i style="background:#4a9e4e;"></i>${esc(editing)}</span>` +
    (canEditRegions() ? others.map(r => `<span><i style="background:${tintFor(r.id)};"></i>${esc(r.name)}</span>`).join('') : '') +
    '<span><i style="background:#fff;"></i>Not in a region</span>';
}

function renderChips() {
  const el = document.getElementById('regionChips');
  const names = [...SP.pick].sort((a, b) => a.localeCompare(b));
  document.getElementById('regionPicked').textContent = names.length ? `(${names.length})` : '';
  el.innerHTML = names.length
    ? names.map(n => `<span class="sp-tag rm" title="Take out of this region" data-name="${esc(n)}">${esc(n)} ✕</span>`).join('')
    : '<span class="text-sm text-muted">None yet. Click counties on the map.</span>';
  el.querySelectorAll('.sp-tag.rm').forEach(t => t.addEventListener('click', () => {
    SP.pick.delete(t.dataset.name); paintMap(); syncGrid(); renderChips();
  }));
}

function drawCountyGrid() {
  const grid = document.getElementById('countyGrid');
  const names = [...new Set([...SP.counties, ...(SP.data.regions || []).flatMap(r => r.counties || [])])]
    .filter((n, i, a) => a.findIndex(m => ck(m) === ck(n)) === i)
    .sort((a, b) => a.localeCompare(b));
  if (!names.length) { grid.innerHTML = '<div class="text-sm text-muted">The county list for this state did not load. Refresh the page.</div>'; return; }
  grid.innerHTML = names.map(c => {
    const owner = ownerOf(c);
    return `<label class="${owner ? 'taken' : ''}" data-name="${esc(lc(c))}" title="${owner ? 'In ' + esc(owner.name) : ''}">
      <input type="checkbox" value="${esc(c)}" ${owner ? 'disabled' : ''}/>
      <span>${esc(c)}${owner ? ` <small>(${esc(owner.name)})</small>` : ''}</span></label>`;
  }).join('');
  grid.querySelectorAll('input').forEach(i => i.addEventListener('change', () => {
    // Keep whichever spelling the map uses, so the map lights up.
    const mapName = SP.shapes?.counties.find(c => ck(c.n) === ck(i.value))?.n || i.value;
    [...SP.pick].forEach(n => { if (ck(n) === ck(i.value)) SP.pick.delete(n); });
    if (i.checked) SP.pick.add(mapName);
    paintMap(); renderChips();
  }));
  syncGrid();
  filterCounties();
}

function syncGrid() {
  const keys = new Set([...SP.pick].map(ck));
  document.querySelectorAll('#countyGrid input').forEach(i => { i.checked = keys.has(ck(i.value)); });
}

function filterCounties() {
  const q = lc(document.getElementById('countyFilter').value);
  document.querySelectorAll('#countyGrid label').forEach(l => { l.style.display = !q || l.dataset.name.includes(q) ? '' : 'none'; });
}
window.filterCounties = filterCounties;

function editRegion(id) {
  const r = (SP.data.regions || []).find(x => x.id === id);
  if (!r) return;
  document.getElementById('regionId').value = r.id;
  document.getElementById('regionName').value = r.name;
  document.getElementById('regionNotes').value = r.notes || '';
  document.getElementById('regionEditorTitle').textContent = 'Edit ' + r.name;
  document.getElementById('regionDeleteBtn').style.display = '';
  const byKey = new Map((SP.shapes?.counties || []).map(c => [ck(c.n), c.n]));
  SP.pick = new Set((r.counties || []).map(c => byKey.get(ck(c)) || c));
  drawCountyGrid(); paintMap(); renderChips();
  document.querySelector('#sec-regions .card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.editRegion = editRegion;

function resetRegionForm() {
  document.getElementById('regionId').value = '';
  document.getElementById('regionName').value = '';
  document.getElementById('regionNotes').value = '';
  document.getElementById('countyFilter').value = '';
  document.getElementById('regionEditorTitle').textContent = 'New region';
  document.getElementById('regionDeleteBtn').style.display = 'none';
  SP.pick = new Set();
  drawCountyGrid(); paintMap(); renderChips();
}
window.resetRegionForm = resetRegionForm;
document.addEventListener('input', e => { if (e.target.id === 'regionName') paintMap(); });

async function saveRegion() {
  const id = document.getElementById('regionId').value || null;
  const name = document.getElementById('regionName').value.trim();
  const counties = [...SP.pick];
  if (!name) { showMsg('regionMsg', 'Give the region a name.', 'err'); return; }
  if (!counties.length) { showMsg('regionMsg', 'Pick at least one county.', 'err'); return; }
  if (!sb) { showMsg('regionMsg', 'Preview mode - nothing was saved.', 'info'); return; }
  const btn = document.getElementById('regionSaveBtn');
  btn.disabled = true;
  const { error } = await sb.rpc('fg_save_region', {
    p_id: id, p_state: SP.state, p_name: name, p_counties: counties,
    p_notes: document.getElementById('regionNotes').value.trim() || null,
  });
  btn.disabled = false;
  if (error) { showMsg('regionMsg', error.message, 'err'); return; }
  showMsg('regionMsg', `Saved "${name}".`, 'ok');
  resetRegionForm();
  await loadOverview();
}
window.saveRegion = saveRegion;

async function deleteRegion() {
  const id = document.getElementById('regionId').value;
  const r = (SP.data.regions || []).find(x => x.id === id);
  if (!r) return;
  if (!confirm(`Delete the region "${r.name}"?\n\nIts coordinator keeps their account but will see nothing until given another region, and any open invitations for it are withdrawn.`)) return;
  if (!sb) { showMsg('regionMsg', 'Preview mode - nothing was deleted.', 'info'); return; }
  const { error } = await sb.rpc('fg_delete_region', { p_id: id });
  if (error) { showMsg('regionMsg', error.message, 'err'); return; }
  showMsg('regionMsg', `Deleted "${r.name}".`, 'ok');
  resetRegionForm();
  await loadOverview();
}
window.deleteRegion = deleteRegion;

/* ── Things to check -> the thing itself ────────────────────────── */
function openIssue(kind, id) {
  if (kind === 'fair') { showSection('fairs'); openFair(id); return; }
  if (kind === 'region') { showSection('regions'); if (canEditRegions()) editRegion(id); return; }
  if (kind === 'judge') {
    showSection('judges');
    ['judgeSearch', 'judgeRegion', 'judgeStatus'].forEach(x => { document.getElementById(x).value = ''; });
    renderJudges();
    const tr = document.querySelector(`#judgesTbody tr[data-id="${CSS.escape(id)}"]`);
    if (tr) { tr.scrollIntoView({ behavior: 'smooth', block: 'center' }); tr.classList.add('sp-flash'); setTimeout(() => tr.classList.remove('sp-flash'), 2500); }
  }
}
window.openIssue = openIssue;

/* ── Fair editor ───────────────────────────────────────────────────
   Directors and admins edit; coordinators see the same form, read-only.
   Saving sends every field; the database keeps only the ones a director
   may change. "Save and mark verified" is what puts the page online. */
SP.fair = null;
function fairFields() { return [...document.querySelectorAll('#fairFields [data-f]')]; }

function openFair(id) {
  const f = id ? (SP.data.fairs || []).find(x => x.id === id) : { level: 'district', judges_needed: true, cycle_year: new Date().getFullYear() + (new Date().getMonth() >= 6 ? 1 : 0) };
  if (!f) return;
  SP.fair = f;
  const canEdit = canEditRegions();
  // County choices: this state's counties, keeping an unusual stored value.
  const sel = document.getElementById('ff_county');
  const names = [...SP.counties];
  if (f.county && !names.some(n => ck(n) === ck(f.county))) names.push(f.county);
  sel.innerHTML = '<option value="">Not set</option>' + names.sort((a, b) => a.localeCompare(b)).map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  fairFields().forEach(el => {
    const k = el.dataset.f;
    let v = f[k];
    if (el.type === 'checkbox') { el.checked = k === 'judges_needed' ? v !== false : !!v; return; }
    if (el.dataset.kind === 'list') v = (v || []).join(', ');
    if (el.type === 'time' && v) v = String(v).slice(0, 5);
    if (k === 'county' && v) v = names.find(n => ck(n) === ck(v)) || v;
    el.value = v ?? '';
  });
  document.getElementById('fairFields').disabled = !canEdit;
  document.getElementById('fairModalTitle').textContent = id ? f.name : 'Add a fair';
  const [, label] = STATUS_CHIP[f.verification_status] || [null, ''];
  document.getElementById('fairModalSub').textContent = id
    ? `${label}${f.last_verified_at ? ' · checked ' + fmtDate(f.last_verified_at) + (f.verified_by ? ' by ' + f.verified_by : '') : ''}`
    : `A new fair in ${stateName(SP.state)}. It stays off the public site until you mark it verified.`;
  const view = document.getElementById('fairViewBtn');
  view.style.display = f.slug ? '' : 'none';
  if (f.slug) { view.href = '/fair?f=' + encodeURIComponent(f.slug); view.textContent = f.verification_status === 'verified' ? 'View public page ↗' : 'Preview page ↗'; }
  document.getElementById('fairRetireBtn').style.display = id && canEdit ? '' : 'none';
  document.getElementById('fairVerifyBtn').textContent = f.verification_status === 'verified' ? 'Save and re-verify' : 'Save and mark verified';
  document.getElementById('fairMsg').className = 'msg-strip';
  openModal('fairModal');
  if (canEdit) setTimeout(() => document.getElementById('ff_name').focus(), 50);
}
window.openFair = openFair;
function closeFair() { closeModal('fairModal'); }
window.closeFair = closeFair;

function readFairForm() {
  const out = {};
  fairFields().forEach(el => {
    const k = el.dataset.f;
    if (el.type === 'checkbox') { out[k] = el.checked; return; }
    let v = el.value.trim();
    if (el.dataset.kind === 'list') { out[k] = v ? v.split(',').map(x => x.trim()).filter(Boolean) : []; return; }
    out[k] = v === '' ? null : v;
  });
  return out;
}

async function saveFair(verify) {
  const fields = readFairForm();
  if (!fields.name) { showMsg('fairMsg', 'Give the fair a name.', 'err'); return; }
  const bad = ['website_url', 'registration_url', 'judge_signup_url', 'rules_url'].find(k => fields[k] && !/^https?:\/\//i.test(fields[k]));
  if (bad) { showMsg('fairMsg', 'Links need to start with https:// (check ' + bad.replace(/_/g, ' ').replace(' url', '') + ').', 'err'); return; }
  if (fields.event_end_date && fields.event_start_date && fields.event_end_date < fields.event_start_date) { showMsg('fairMsg', 'The last day is before the fair date.', 'err'); return; }
  if (verify && !fields.event_start_date && !fields.judging_date &&
      !confirm('This fair has no date yet. Mark it verified anyway? Its public page will say the date is to be announced.')) return;
  if (!sb) {
    Object.assign(SP.fair, fields, verify ? { verification_status: 'verified', last_verified_at: new Date().toISOString() } : {});
    if (!SP.fair.id) { SP.fair.id = 'f' + Date.now(); SP.fair.slug = 'demo'; SP.data.fairs.push(SP.fair); }
    if (verify) SP.data.issues = SP.data.issues.filter(i => i.id !== SP.fair.id);
    closeFair(); renderAll(); fgToast('Preview mode - saved on this screen only.');
    return;
  }
  ['fairSaveBtn', 'fairVerifyBtn'].forEach(b => { document.getElementById(b).disabled = true; });
  const { data, error } = await sb.rpc('fg_save_fair', {
    p_id: SP.fair.id || null, p_state: SP.state, p_fields: fields, p_verify: !!verify,
  });
  ['fairSaveBtn', 'fairVerifyBtn'].forEach(b => { document.getElementById(b).disabled = false; });
  if (error) {
    showMsg('fairMsg', /function .* does not exist|schema cache/i.test(error.message) ? 'Run migration 20 first.' : error.message, 'err');
    return;
  }
  closeFair();
  fgToast(verify
    ? `${esc(fields.name)} is verified. <a href="/fair?f=${encodeURIComponent(data.slug)}" target="_blank" rel="noopener">See its public page ↗</a>`
    : `Saved ${esc(fields.name)}.`);
  await loadOverview();
}
window.saveFair = saveFair;

async function retireFair() {
  const f = SP.fair;
  if (!f?.id) return;
  if (!confirm(`Remove "${f.name}"?\n\nIts public page comes down and it leaves your lists. Use this for a fair that has closed or was listed twice. FairGame keeps the record, so it can be restored on request.`)) return;
  if (!sb) { SP.data.fairs = SP.data.fairs.filter(x => x.id !== f.id); closeFair(); renderAll(); return; }
  const { error } = await sb.rpc('fg_set_fair_active', { p_id: f.id, p_active: false });
  if (error) { showMsg('fairMsg', error.message, 'err'); return; }
  closeFair();
  fgToast(`Removed ${esc(f.name)}.`);
  await loadOverview();
}
window.retireFair = retireFair;

/* ── Team ──────────────────────────────────────────────────────── */
const INVITE_CHIP = { open: ['chip-interest', 'Waiting'], accepted: ['chip-active', 'Accepted'], expired: ['chip-inactive', 'Expired'], revoked: ['chip-declined', 'Withdrawn'] };
function renderTeam() {
  const d = SP.data;
  const regionName = id => (d.regions || []).find(r => r.id === id)?.name || '';
  const canEdit = !document.body.classList.contains('sp-readonly');

  const pt = document.getElementById('peopleTbody');
  const people = d.people || [];
  if (!people.length) fgEmpty(pt, 'Nobody has accepted an invitation yet.');
  else pt.innerHTML = people.map(p => {
    const removable = canEdit && (SP.role === 'admin' || p.role === 'regional_coordinator');
    return `<tr>
      <td class="col-name">${esc(p.full_name || '–')}</td>
      <td class="col-sm">${esc(p.email || '')}</td>
      <td class="col-sm">${esc(ROLE_LABEL[p.role] || p.role)}</td>
      <td class="col-sm">${esc(regionName(p.region_id))}</td>
      <td>${removable ? `<button class="btn-xs danger" type="button" onclick="removePerson('${esc(p.user_id)}','${esc(p.full_name || p.email)}')">Remove</button>` : ''}</td>
    </tr>`;
  }).join('');

  const it = document.getElementById('invitesTbody');
  const inv = d.invites || [];
  if (!inv.length) fgEmpty(it, 'No invitations yet.');
  else it.innerHTML = inv.map(i => {
    const [cls, label] = INVITE_CHIP[i.status] || ['chip-pending', i.status];
    const when = i.status === 'open' ? `Expires ${fmtDate(i.expires_at)}`
      : i.status === 'accepted' ? `Accepted ${fmtDate(i.accepted_at)}` : '';
    return `<tr>
      <td class="col-name">${esc(i.full_name || i.email)}<div class="text-xs text-muted">${esc(i.email)}</div></td>
      <td class="col-sm">${esc(ROLE_LABEL[i.role] || i.role)}</td>
      <td class="col-sm">${esc(regionName(i.region_id))}</td>
      <td class="col-sm">${esc(fmtDate(i.created_at))}${i.emailed_at ? '' : '<div class="text-xs text-muted">Not emailed</div>'}</td>
      <td><span class="chip ${cls}">${esc(label)}</span>${when ? `<div class="text-xs text-muted">${esc(when)}</div>` : ''}</td>
      <td>${canEdit && i.status === 'open' ? `<button class="btn-xs danger" type="button" onclick="revokeInvite('${esc(i.id)}')">Withdraw</button>` : ''}</td>
    </tr>`;
  }).join('');
}

/* Shows a fresh link once, with a copy button. It cannot be shown again. */
function showLink(boxId, res) {
  const box = document.getElementById(boxId);
  const inputId = boxId + 'Input';
  box.innerHTML = `
    <div class="text-sm mt-16"><strong>Invitation link for ${esc(res.email)}</strong> - copy it now. It will not be shown again.</div>
    <div class="sp-link-box">
      <input id="${inputId}" readonly value="${esc(res.link)}" onclick="this.select()"/>
      <button class="btn-primary" type="button" onclick="copyLink('${inputId}', this)">Copy</button>
    </div>
    <div class="form-hint">Works once, only for ${esc(res.email)}, until ${esc(fmtDate(res.expires_at))}.</div>`;
}
async function copyLink(inputId, btn) {
  const el = document.getElementById(inputId);
  try { await navigator.clipboard.writeText(el.value); }
  catch (_) { el.select(); document.execCommand('copy'); }
  btn.textContent = 'Copied';
  setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
}
window.copyLink = copyLink;

async function runInvite(prefix, params) {
  const email = document.getElementById(prefix + 'Email').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showMsg(prefix + 'Msg', 'Enter their email address.', 'err'); return; }
  if (!sb) { showMsg(prefix + 'Msg', 'Preview mode - no invitation was created.', 'info'); return; }
  // A browser still holding an older cached copy of portal-shared.js.
  if (typeof fgCreateInvite !== 'function') { showMsg(prefix + 'Msg', 'This page was updated while you had it open. Reload the page, then try again.', 'err'); return; }
  const btn = document.getElementById(prefix + 'Btn');
  btn.disabled = true; btn.textContent = 'Creating…';
  document.getElementById(prefix + 'Link').innerHTML = '';
  try {
    const res = await fgCreateInvite({
      ...params, email,
      full_name: document.getElementById(prefix + 'Name').value.trim(),
      send_email: document.getElementById(prefix + 'Send').checked,
    });
    showLink(prefix + 'Link', res);
    const sendWanted = document.getElementById(prefix + 'Send').checked;
    showMsg(prefix + 'Msg',
      res.emailed ? `Invitation emailed to ${res.email}.` : (sendWanted ? (res.email_error || 'Not emailed.') + ' Copy the link below and send it yourself.' : 'Invitation created. Copy the link below and send it yourself.'),
      res.emailed ? 'ok' : 'info');
    document.getElementById(prefix + 'Email').value = '';
    document.getElementById(prefix + 'Name').value = '';
    await loadOverview();
  } catch (e) {
    showMsg(prefix + 'Msg', e.message || 'Could not create the invitation.', 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Create invitation';
  }
}
function inviteCoordinator() {
  const region = document.getElementById('cRegion').value;
  if (!region) { showMsg('cMsg', 'Draw a region first, on the Regions tab.', 'err'); return; }
  return runInvite('c', { role: 'regional_coordinator', region_id: region });
}
function inviteDirector() { return runInvite('d', { role: 'state_director', state: SP.state }); }
window.inviteCoordinator = inviteCoordinator;
window.inviteDirector = inviteDirector;

async function revokeInvite(id) {
  if (!confirm('Withdraw this invitation? The link stops working straight away.')) return;
  if (!sb) return;
  const { error } = await sb.rpc('fg_revoke_invite', { p_id: id });
  if (error) { fgToast(esc(error.message), 'err'); return; }
  fgToast('Invitation withdrawn.');
  await loadOverview();
}
window.revokeInvite = revokeInvite;

async function removePerson(userId, name) {
  if (!confirm(`Remove ${name}? Their account stays, but they lose access to this page.`)) return;
  if (!sb) return;
  const { error } = await sb.rpc('fg_remove_state_role', { p_user_id: userId });
  if (error) { fgToast(esc(error.message), 'err'); return; }
  fgToast(`${esc(name)} removed.`);
  await loadOverview();
}
window.removePerson = removePerson;
