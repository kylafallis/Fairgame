/* ================================================================
   FairGame — portal-shared.js
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
} catch (e) { console.warn('[Portal] Supabase not configured — running in dev mode.'); }

const ROLE_ROUTES = {
  teacher:    '/portal-teacher.html',
  ambassador: '/portal-ambassador.html',
  student:    '/portal-student.html',
  judge:      '/portal-judge.html',
  admin:      '/portal-admin.html',
};
async function doSignOut() {
  if (sb) await sb.auth.signOut();
  window.location.reload();
}
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
      banner.textContent = 'Preview mode — data shown is sample only. Not connected to live database.';
      document.body.appendChild(banner);
    }
    if (typeof onReady === 'function') onReady(currentUser);
    return;
  }
  sb.auth.getSession().then(async ({ data: { session }, error }) => {
    if (error || !session?.user) { window.location.replace('/login.html'); return; }
    // Refresh token so user_metadata reflects any role changes made in the dashboard
    const { data: refreshed } = await sb.auth.refreshSession();
    const user = refreshed?.session?.user || session.user;
    const role = user.user_metadata?.role || user.app_metadata?.role || 'ambassador';
    if (role === 'admin' || role === expectedRole) {
      // Teacher and Ambassador accounts require admin approval before portal access
      if ((role === 'teacher' || role === 'ambassador') && role !== 'admin') {
        const { data: rows, error: reqErr } = await sb.from('portal_requests')
          .select('status').eq('email', user.email)
          .order('created_at', { ascending: false }).limit(1);
        const req = rows?.[0] || null;
        // If RLS blocked the query entirely, don't punish the user — let them through
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
          We review all ${role} accounts personally. You'll receive an email at <strong>${email}</strong> once approved — typically within 1–3 business days.
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

/* ── Section switcher ────────────────────────────────────────── */
const _loaders = {};
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
  if (_loaders[id]) { _loaders[id](); _loaders[id] = null; }
}
window.showSection = showSection;

function onSectionLoad(id, fn) { _loaders[id] = fn; }
window.onSectionLoad = onSectionLoad;

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