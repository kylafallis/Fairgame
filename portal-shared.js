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
  if (!sb) {
    currentUser = { id: 'dev', email: 'dev@fairgame.dev', user_metadata: { role: expectedRole, name: 'Dev User' } };
    currentRole = expectedRole;
    document.body.classList.add('ready');
    _populateNav();
    if (typeof onReady === 'function') onReady(currentUser);
    return;
  }
  sb.auth.getSession().then(async ({ data: { session }, error }) => {
    if (error || !session?.user) { window.location.replace('/login.html'); return; }
    // Refresh token so user_metadata reflects any role changes made in the dashboard
    const { data: refreshed } = await sb.auth.refreshSession();
    const user = refreshed?.session?.user || session.user;
    const role = user.user_metadata?.role || 'ambassador';
    if (role === 'admin' || role === expectedRole) {
      currentUser = user; currentRole = role;
      document.body.classList.add('ready');
      _populateNav();
      if (typeof onReady === 'function') onReady(user);
    } else {
      window.location.replace(ROLE_ROUTES[role] || '/login.html');
    }
  });
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