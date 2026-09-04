/* ================================================================
   FairGame - portal-shared.js
   Auth (email/password + Google OAuth), session, nav, file utils.
   Load FIRST on every portal page via <script src="/portal-shared.js">
   ================================================================ */

'use strict';

const SB_URL = 'https://buzcxrbjutexiofetgvn.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1emN4cmJqdXRleGlvZmV0Z3ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3Nzc1NTEsImV4cCI6MjA4OTM1MzU1MX0.ifMup4fCcfHaf7Q4TYfi1X1V-J8tQpu2JwaqvjBcsBQ';

let sb = null;
let currentUser = null;
let currentRole = null;

try {
  if (window.supabase && SB_URL !== 'YOUR_SUPABASE_URL') {
    sb = window.supabase.createClient(SB_URL, SB_KEY, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
    });
  }
} catch (e) { console.warn('[Portal] Supabase not configured - running in dev mode.'); }

const ROLE_ROUTES = {
  teacher:    '/portal-teacher.html',
  ambassador: '/portal-ambassador.html',
  student:    '/portal-student.html',
  judge:      '/portal-judge.html',
  mentor:     '/portal-mentor.html',
  admin:      '/portal-admin.html',
};
async function doSignOut() {
  if (sb) await sb.auth.signOut();
  window.location.reload();
}

/* ── Role lookup ─────────────────────────────────────────────────
   user_roles is the only source of truth for access control. It can
   only be written by an admin session or the service key, unlike
   user_metadata, which a signed-in user can rewrite on themselves from
   the browser. user_metadata still holds the display name only. */
const SELF_PROVISION_ROLES = ['student', 'ambassador', 'teacher'];

async function getRole(userId) {
  if (!sb || !userId) return null;
  const { data, error } = await sb.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
  if (error) { console.warn('[Portal] getRole failed:', error.message); return null; }
  return data?.role || null;
}
window.getRole = getRole;

/* Claims a user_roles row for the three roles the signup form lets a
   person pick without review. Writes once - the underlying function
   does nothing on conflict - so it can never change a role that is
   already on file. */
async function claimRole(role) {
  if (!sb || !SELF_PROVISION_ROLES.includes(role)) return null;
  const { data, error } = await sb.rpc('fg_self_provision_role', { p_role: role });
  if (error) { console.warn('[Portal] claimRole failed:', error.message); return null; }
  return data;
}
window.claimRole = claimRole;

/* Mentors cannot self-provision the way a student can - the role is
   granted only when an admin has already approved a mentor application
   on this exact email. The approval is the human decision; this just
   delivers its effect on first sign-in, so an approved mentor is not
   stuck at the login page waiting for someone to run a query by hand. */
async function claimMentorRole() {
  if (!sb) return null;
  const { data, error } = await sb.rpc('fg_claim_mentor_role');
  if (error) { console.warn('[Portal] claimMentorRole failed:', error.message); return null; }
  return data;
}
window.claimMentorRole = claimMentorRole;

/* ── Auth guard ──────────────────────────────────────────────── */
function requireAuth(expectedRole, onReady) {
  const isDemo = new URLSearchParams(window.location.search).get('demo') === 'true';
  if (!sb || isDemo) {
    currentUser = { id: 'demo', email: 'demo@fairgame.dev', user_metadata: { role: expectedRole, name: 'Preview Mode' } };
    currentRole = expectedRole;
    document.body.classList.add('ready');
    _populateNav();
    // Show a banner so it's clear this is a preview
    if (isDemo) {
      const banner = document.createElement('div');
      banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#1a3a1a;color:rgba(255,255,255,0.8);text-align:center;padding:10px 16px;font-size:0.82rem;z-index:9999;border-top:1px solid rgba(255,255,255,0.1);';
      banner.textContent = 'Preview mode - data shown is sample only. Not connected to live database.';
      document.body.appendChild(banner);
    }
    if (typeof onReady === 'function') onReady(currentUser);
    return;
  }
  sb.auth.getSession().then(async ({ data: { session }, error }) => {
    if (error || !session?.user) { window.location.replace('/login.html'); return; }
    // Refresh token so a fresh session is on hand before we look up the role
    const { data: refreshed } = await sb.auth.refreshSession();
    const user = refreshed?.session?.user || session.user;
    // Role comes from user_roles, never from user_metadata. A brand new
    // self-serve signup has no row there yet, so try to claim one from
    // whatever they picked on the signup form before giving up.
    let role = await getRole(user.id);
    if (!role) {
      const claimed = user.user_metadata?.role;
      if (claimed && SELF_PROVISION_ROLES.includes(claimed)) role = await claimRole(claimed);
    }
    // Approved mentor with no role yet - the application was reviewed
    // before they ever created an account.
    if (!role) role = await claimMentorRole();
    if (!role) { window.location.replace('/login.html'); return; }
    if (role === 'admin' || role === expectedRole) {
      // Teacher and Ambassador accounts require admin approval before portal access
      if ((role === 'teacher' || role === 'ambassador') && role !== 'admin') {
        const { data: rows, error: reqErr } = await sb.from('portal_requests')
          .select('status').eq('email', user.email).eq('type', role)
          .in('status', ['pending', 'active', 'rejected'])
          .order('created_at', { ascending: false }).limit(1);
        const req = rows?.[0] || null;
        // If RLS blocked the query entirely, don't punish the user - let them through
        if (!reqErr) {
          if (!req || req.status === 'pending') { _showPortalPending(user.email, role); return; }
          if (req.status === 'rejected')        { _showPortalRejected(user.email);      return; }
        }
      }
      currentUser = user; currentRole = role;
      document.body.classList.add('ready');
      _populateNav();
      if (typeof onReady === 'function') onReady(user);
    } else {
      window.location.replace(ROLE_ROUTES[role] || '/login.html');
    }
  });
}

function _showPortalPending(email, role) {
  document.body.style.opacity = '1';
  document.body.innerHTML = `
    <div style="font-family:'DM Sans',system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f1faf2;padding:24px;">
      <div style="max-width:440px;width:100%;background:#fff;padding:36px 40px;border-top:3px solid #357a38;box-shadow:0 4px 20px rgba(0,0,0,.1);">
        <div style="font-size:1.3rem;font-family:'Playfair Display',serif;font-weight:600;color:#1a1e1a;margin-bottom:8px;">Account Under Review</div>
        <p style="font-size:.84rem;color:#6b756b;margin-bottom:20px;">Signed in as <strong>${email}</strong></p>
        <div style="background:#fff8e1;border:1.5px solid #f59e0b;border-radius:4px;padding:14px 16px;font-size:.84rem;color:#78350f;line-height:1.6;margin-bottom:20px;">
          <strong style="display:block;margin-bottom:4px;">Your ${role} account is pending approval.</strong>
          We review all ${role} accounts personally. You'll receive an email at <strong>${email}</strong> once approved - typically within 1–3 business days.
        </div>
        <button onclick="portalLogout()" style="width:100%;padding:10px;background:none;border:1.5px solid #c8cec8;border-radius:3px;font-size:.82rem;color:#6b756b;cursor:pointer;">Sign out</button>
      </div>
    </div>`;
}

function _showPortalRejected(email) {
  document.body.style.opacity = '1';
  document.body.innerHTML = `
    <div style="font-family:'DM Sans',system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f1faf2;padding:24px;">
      <div style="max-width:440px;width:100%;background:#fff;padding:36px 40px;border-top:3px solid #dc2626;box-shadow:0 4px 20px rgba(0,0,0,.1);">
        <div style="font-size:1.3rem;font-family:'Playfair Display',serif;font-weight:600;color:#1a1e1a;margin-bottom:8px;">Account Not Approved</div>
        <p style="font-size:.84rem;color:#6b756b;margin-bottom:20px;">Signed in as <strong>${email}</strong></p>
        <div style="background:#fef2f2;border:1.5px solid #dc2626;border-radius:4px;padding:14px 16px;font-size:.84rem;color:#7f1d1d;line-height:1.6;margin-bottom:20px;">
          Your account request was not approved. If you believe this is an error, please <a href="/#contact" style="color:#7f1d1d;">contact us</a>.
        </div>
        <button onclick="portalLogout()" style="width:100%;padding:10px;background:none;border:1.5px solid #c8cec8;border-radius:3px;font-size:.82rem;color:#6b756b;cursor:pointer;">Sign out</button>
      </div>
    </div>`;
}

function _populateNav() {
  const nameEl  = document.getElementById('navUserName');
  const emailEl = document.getElementById('navUserEmail');
  if (!currentUser) return;
  const name = currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || 'User';
  if (nameEl)  nameEl.textContent  = name;
  if (emailEl) emailEl.textContent = currentUser.email || '';
}

async function portalLogout() {
  if (sb) await sb.auth.signOut();
  window.location.replace('/login.html');
}
window.portalLogout = portalLogout;

/* ── Load-state helpers ────────────────────────────
   A spinner is a promise that something is coming. Every path out of a
   fetch has to keep that promise ─ rows, "nothing yet", or a stated
   error ─ so nothing is left spinning forever. fgLoad() is the only
   thing that should ever paint a spinner: it owns the whole lifecycle. */

const FG_EMPTY_TEXT = 'Nothing here yet ─ check back later.';
const FG_LOAD_TIMEOUT_MS = 12000;

/* Wraps whatever the caller renders so a <tbody> gets a full-width row
   and a plain container gets a plain div. */
function _fgWrap(el, inner) {
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'tbody') {
    const cols = el.closest('table')?.querySelectorAll('thead th').length || 1;
    return `<tr><td colspan="${cols}">${inner}</td></tr>`;
  }
  if (tag === 'select') return inner;
  return inner;
}

function fgSpinner(el) {
  if (!el) return;
  el.innerHTML = _fgWrap(el, '<div class="spinner-wrap"><div class="spinner"></div></div>');
}
window.fgSpinner = fgSpinner;

function fgEmpty(el, text) {
  if (!el) return;
  el.innerHTML = _fgWrap(el, `<div class="empty-state"><p>${text || FG_EMPTY_TEXT}</p></div>`);
}
window.fgEmpty = fgEmpty;

function fgError(el, retryFn) {
  if (!el) return;
  const id = 'fgr' + Math.random().toString(36).slice(2, 8);
  el.innerHTML = _fgWrap(el, `<div class="empty-state"><p>We couldn’t load this just now. <button id="${id}" class="btn-xs" type="button">Try again</button></p></div>`);
  const btn = document.getElementById(id);
  if (btn && typeof retryFn === 'function') btn.addEventListener('click', retryFn);
}
window.fgError = fgError;

/* Rejects a hung request instead of letting it spin. Supabase queries are
   thenable but not real promises, so Promise.race needs the resolve(). */
function _fgTimeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

/* The single entry point for "fetch something and put it on screen".
     elId    ─ container to own for the whole cycle
     fetchFn ─ async () => rows (array) or any value
     renderFn─ (rows) => void, only called when there is something to show
     opts    ─ { empty: 'custom text', timeout: ms }
   Empty result → empty text. Thrown/rejected → error + Try again.
   Either way the spinner is gone. */
async function fgLoad(elId, fetchFn, renderFn, opts = {}) {
  const el = typeof elId === 'string' ? document.getElementById(elId) : elId;
  if (!el) return;
  const retry = () => fgLoad(elId, fetchFn, renderFn, opts);
  fgSpinner(el);
  try {
    const rows = await Promise.race([
      Promise.resolve(fetchFn()),
      _fgTimeout(opts.timeout || FG_LOAD_TIMEOUT_MS),
    ]);
    const isEmpty = rows == null || (Array.isArray(rows) && rows.length === 0);
    if (isEmpty) { fgEmpty(el, opts.empty); return; }
    renderFn(rows);
  } catch (err) {
    console.warn('[Portal] fgLoad failed for', elId, err?.message || err);
    fgError(el, retry);
  }
}
window.fgLoad = fgLoad;

/* Unwraps a Supabase result. Throws on a real error so fgLoad can show
   the retry path, but treats "table does not exist" as simply empty ─
   an unbuilt feature should read as "nothing yet", not as a failure. */
function fgRows(res) {
  if (res?.error) {
    const code = res.error.code || '';
    const msg  = res.error.message || '';
    if (code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(msg)) return [];
    throw new Error(msg || 'query failed');
  }
  return res?.data || [];
}
window.fgRows = fgRows;

/* ── Section switcher ────────────────────────────
   Loaders stay registered and re-run every time their section is opened,
   so a section is never showing data from an hour ago. _inFlight stops a
   double-click from firing the same fetch twice. */
const _loaders  = {};
const _inFlight = {};

function showSection(id, linkEl) {
  document.querySelectorAll('.portal-section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('sec-' + id);
  if (target) target.classList.add('active');
  document.querySelectorAll('.pnav-link[data-section]').forEach(l => l.classList.remove('active'));
  const navLink = linkEl || document.querySelector(`.pnav-link[data-section="${id}"]`);
  if (navLink) navLink.classList.add('active');
  const titleEl = document.getElementById('topbarTitle');
  if (titleEl && navLink) titleEl.textContent = navLink.dataset.label || navLink.textContent.trim();
  closeMobileNav();
  document.querySelector('.portal-main')?.scrollTo(0, 0);
  runSectionLoader(id);
}
window.showSection = showSection;

async function runSectionLoader(id) {
  const fn = _loaders[id];
  if (!fn || _inFlight[id]) return;
  _inFlight[id] = true;
  try { await fn(); }
  catch (e) { console.warn('[Portal] section loader failed:', id, e?.message || e); }
  finally { _inFlight[id] = false; }
}
window.runSectionLoader = runSectionLoader;

function onSectionLoad(id, fn) {
  _loaders[id] = fn;
  // If this section is already the visible one, load it now rather than
  // waiting for a nav click that may never come.
  if (document.getElementById('sec-' + id)?.classList.contains('active')) runSectionLoader(id);
}
window.onSectionLoad = onSectionLoad;

/* Re-runs the visible section when the tab regains focus, so a portal
   left open in a background tab is not showing stale rows. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  const active = document.querySelector('.portal-section.active');
  if (active?.id?.startsWith('sec-')) runSectionLoader(active.id.slice(4));
});

/* ── Mobile nav ──────────────────────────────────────────────── */
function openMobileNav()  { document.querySelector('.pnav')?.classList.add('open'); document.querySelector('.pnav-overlay')?.classList.add('open'); }
function closeMobileNav() { document.querySelector('.pnav')?.classList.remove('open'); document.querySelector('.pnav-overlay')?.classList.remove('open'); }
window.openMobileNav  = openMobileNav;
window.closeMobileNav = closeMobileNav;

/* ── Modal helpers ───────────────────────────────────────────── */
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
window.openModal  = openModal;
window.closeModal = closeModal;

/* ── Message strip ───────────────────────────────────────────── */
function showMsg(elId, text, type = 'ok') {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text;
  el.className = 'msg-strip show ' + type;
  if (type === 'ok') setTimeout(() => { el.textContent = ''; el.className = 'msg-strip'; }, 4000);
}
window.showMsg = showMsg;

/* ── File helpers ────────────────────────────────────────────── */
async function getSignedUrl(bucket, path, expiresIn = 3600) {
  if (!sb) return null;
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, expiresIn);
  return error ? null : data.signedUrl;
}
async function uploadPortalFile(bucket, path, file) {
  if (!sb) return { error: 'Supabase not configured' };
  return sb.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type });
}
window.getSignedUrl     = getSignedUrl;
window.uploadPortalFile = uploadPortalFile;

/* ── Analytics ───────────────────────────────────────────────── */
async function portalLog(event, data = {}) {
  if (!sb || !currentUser) return;
  try { await sb.from('events').insert([{ event, data: { ...data, user_id: currentUser.id, role: currentRole }, page: window.location.pathname, ts: new Date().toISOString() }]); }
  catch (_) {}
}
window.portalLog = portalLog;

/* ── Judge code generator ────────────────────────────────────── */
function generateJudgeCode(expertise = [], county = '') {
  const P = { Biology:'BI', Chemistry:'CH', Physics:'PH', Environmental:'EN', Computer:'CS', Medicine:'ME' };
  const D = { allen:'1', cuyahoga:'2', franklin:'4', hamilton:'3', lucas:'1', montgomery:'5', stark:'6', summit:'7' };
  const first = expertise[0] || '';
  const prefix = Object.entries(P).find(([k]) => first.includes(k))?.[1] || 'GN';
  const cl = county.toLowerCase();
  const dist = Object.entries(D).find(([k]) => cl.includes(k))?.[1] || '9';
  const fips = String(Math.floor(Math.random() * 90) + 10);
  const rnd  = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `${prefix}-${dist}${fips}-${rnd}`;
}
window.generateJudgeCode = generateJudgeCode;