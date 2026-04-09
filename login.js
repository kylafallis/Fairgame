const SB_URL = 'https://buzcxrbjutexiofetgvn.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1emN4cmJqdXRleGlvZmV0Z3ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3Nzc1NTEsImV4cCI6MjA4OTM1MzU1MX0.ifMup4fCcfHaf7Q4TYfi1X1V-J8tQpu2JwaqvjBcsBQ';
let sb = null;
try { if (SB_URL !== 'YOUR_SUPABASE_URL') sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { detectSessionInUrl: true } }); } catch(e) {}

const ROUTES = { teacher:'/portal-teacher.html', ambassador:'/portal-ambassador.html', student:'/portal-student.html', judge:'/portal-judge.html', admin:'/portal-admin.html' };

// Roles that require admin approval before portal access
const APPROVAL_ROLES = ['teacher', 'ambassador'];

// Set to true during signup to prevent the onAuthStateChange listener from auto-redirecting
let suppressAutoRedirect = false;

/* ── Already signed-in check ──────────────────────────────────── */
if (sb) sb.auth.getSession().then(async ({ data: { session } }) => {
  if (session?.user) {
    const { data: refreshed } = await sb.auth.refreshSession();
    const user = refreshed?.session?.user || session.user;
    await go(user);
  }
});

/* ── Auth state listener ──────────────────────────────────────── */
if (sb) sb.auth.onAuthStateChange(async (event, session) => {
  if (suppressAutoRedirect) return;
  if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
    await go(session.user);
  }
});

/* ── Route after login ───────────────────────────────────────── */
async function go(user) {
  const role = user.user_metadata?.role || user.app_metadata?.role || 'student';

  // Admin always goes straight through
  if (role === 'admin') {
    window.location.replace(ROUTES.admin);
    return;
  }

  // Teacher / Ambassador: check approval status in portal_requests
  if (APPROVAL_ROLES.includes(role) && sb) {
    const { data: req } = await sb.from('portal_requests').select('status').eq('email', user.email).maybeSingle();
    if (!req || req.status === 'pending') {
      showPendingScreen(user.email, role);
      return;
    }
    if (req.status === 'rejected') {
      showRejectedScreen(user.email);
      return;
    }
    // status === 'active' → fall through to redirect
  }

  window.location.replace(ROUTES[role] || '/portal-student.html');
}

function showPendingScreen(email, role) {
  const card = document.querySelector('.login-card');
  card.innerHTML = `
    <h2>Account Under Review</h2>
    <p class="login-sub" style="margin-bottom:18px;">Signed in as <strong>${email}</strong></p>
    <div style="background:#fff8e1;border:1.5px solid #f59e0b;border-radius:4px;padding:14px 16px;font-size:.84rem;color:#78350f;line-height:1.6;margin-bottom:18px;">
      <strong style="display:block;margin-bottom:4px;">Your ${role} account is pending approval.</strong>
      We review all ${role} accounts personally to ensure a safe environment for students. You'll receive an email at <strong>${email}</strong> once your account is approved — typically within 1–3 business days.
    </div>
    <button onclick="doSignOut()" style="width:100%;padding:10px;background:none;border:1.5px solid var(--gray-200);border-radius:3px;font-size:.82rem;color:var(--gray-500);cursor:pointer;">
      Sign out and switch accounts
    </button>
  `;
}

function showRejectedScreen(email) {
  const card = document.querySelector('.login-card');
  card.innerHTML = `
    <h2>Account Not Approved</h2>
    <p class="login-sub" style="margin-bottom:18px;">Signed in as <strong>${email}</strong></p>
    <div style="background:#fef2f2;border:1.5px solid #dc2626;border-radius:4px;padding:14px 16px;font-size:.84rem;color:#7f1d1d;line-height:1.6;margin-bottom:18px;">
      Your account request was not approved at this time. If you believe this is an error or would like to discuss further, please <a href="/#contact" style="color:#7f1d1d;">contact us</a>.
    </div>
    <button onclick="doSignOut()" style="width:100%;padding:10px;background:none;border:1.5px solid var(--gray-200);border-radius:3px;font-size:.82rem;color:var(--gray-500);cursor:pointer;">
      Sign out
    </button>
  `;
}

/* ── Tab switcher ─────────────────────────────────────────────── */
function switchTab(tab, btn) {
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-' + tab).classList.add('active');
}

/* ── Role selection ───────────────────────────────────────────── */
let selectedRole = null;

function selectRole(role, el) {
  selectedRole = role;
  document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');

  const approvalNotice = document.getElementById('approvalNotice');
  const judgeRedirect  = document.getElementById('judgeRedirect');
  const formFields     = document.getElementById('signupFormFields');

  approvalNotice.style.display = APPROVAL_ROLES.includes(role) ? 'block' : 'none';
  judgeRedirect.style.display  = role === 'judge' ? 'block' : 'none';
  formFields.style.display     = role === 'judge' ? 'none' : 'block';
}
window.selectRole = selectRole;

/* ── Message helpers ──────────────────────────────────────────── */
function msg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text; el.className = 'msg ' + type;
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? 'Please wait…' : (btnId === 'loginBtn' ? 'Sign in →' : 'Create Account →');
}

/* ── Age checkbox ─────────────────────────────────────────────── */
function handleAgeCheck(checkbox) {
  const panel = document.getElementById('under13Panel');
  if (!checkbox.checked) {
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
    const ge = document.getElementById('guardianEmail');
    if (ge) ge.value = '';
  }
}

/* ── Sign In ──────────────────────────────────────────────────── */
async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pw = document.getElementById('loginPw').value;
  if (!email || !pw) { msg('loginMsg','Please fill in both fields.','err'); return; }
  if (!sb) { msg('loginMsg','Auth not configured.','err'); return; }
  setLoading('loginBtn', true);
  const { error } = await sb.auth.signInWithPassword({ email, password: pw });
  setLoading('loginBtn', false);
  if (error) msg('loginMsg', error.message, 'err');
  // On success, onAuthStateChange fires and calls go()
}

/* ── Sign Up ──────────────────────────────────────────────────── */
async function doSignup() {
  if (!selectedRole) { msg('signupMsg','Please select your role above.','err'); return; }
  if (selectedRole === 'judge') { msg('signupMsg','Please use the volunteer registration form to create a judge account.','err'); return; }

  const name         = document.getElementById('signupName').value.trim();
  const email        = document.getElementById('signupEmail').value.trim();
  const pw           = document.getElementById('signupPw').value;
  const ageChecked   = document.getElementById('ageCheck').checked;
  const termsChecked = document.getElementById('termsCheck').checked;
  const guardianEmail= document.getElementById('guardianEmail')?.value.trim() || '';

  if (!name || !email || !pw) { msg('signupMsg','All fields are required.','err'); return; }
  if (pw.length < 8) { msg('signupMsg','Password must be at least 8 characters.','err'); return; }
  if (!termsChecked) { msg('signupMsg','You must agree to the Terms of Service and Privacy Policy.','err'); return; }

  const isUnder13 = !ageChecked;
  if (isUnder13) {
    if (!guardianEmail) { msg('signupMsg','Please provide a parent or guardian email address.','err'); return; }
    if (!guardianEmail.includes('@')) { msg('signupMsg','Please provide a valid parent or guardian email address.','err'); return; }
  }

  if (!sb) { msg('signupMsg','Auth not configured.','err'); return; }

  // Suppress the auto-redirect listener while we handle this manually
  suppressAutoRedirect = true;
  setLoading('signupBtn', true);

  const needsApproval = APPROVAL_ROLES.includes(selectedRole);

  const metadata = {
    name,
    role: selectedRole,
    age_confirmed: ageChecked,
    terms_accepted: true,
    terms_accepted_at: new Date().toISOString(),
    ...(needsApproval ? { account_status: 'pending_approval' } : {}),
    ...(isUnder13 ? { guardian_consent_required: true, guardian_email: guardianEmail, account_status: 'pending_parental_consent' } : {})
  };

  const { data, error } = await sb.auth.signUp({
    email, password: pw,
    options: { data: metadata }
  });

  if (error) {
    setLoading('signupBtn', false);
    suppressAutoRedirect = false;
    msg('signupMsg', error.message, 'err');
    return;
  }

  // For teacher/ambassador: insert a portal_requests row so admin can review
  if (needsApproval && data?.user) {
    await sb.from('portal_requests').insert([{
      name,
      email,
      school: '',
      type:   selectedRole,
      status: 'pending'
    }]).then(() => {}).catch(() => {}); // non-fatal if insert fails
  }

  setLoading('signupBtn', false);
  suppressAutoRedirect = false;

  if (needsApproval) {
    msg('signupMsg',
      'Account created! Your request is now under review. We will contact you at ' + email + ' once your account has been approved — typically within 1–3 business days. Please also confirm your email address from the message we just sent.',
      'ok');
  } else if (isUnder13) {
    msg('signupMsg',
      'Account created! A consent request has been sent to your parent or guardian at ' + guardianEmail + '. Please also check ' + email + ' to confirm your email address.',
      'ok');
  } else {
    msg('signupMsg', 'Account created! Check your email to confirm your address, then sign in.', 'ok');
  }
}

/* ── Google OAuth ─────────────────────────────────────────────── */
async function doGoogle() {
  if (!sb) { alert('Google OAuth not configured.'); return; }
  await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/login.html' }
  });
}

/* ── Forgot password ──────────────────────────────────────────── */
async function showForgot(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) { msg('loginMsg','Enter your email address above first.','err'); return; }
  if (!sb) return;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/login.html' });
  if (error) msg('loginMsg', error.message, 'err');
  else msg('loginMsg', 'Password reset email sent — check your inbox.', 'ok');
}

/* ── Sign Out ─────────────────────────────────────────────────── */
async function doSignOut() {
  if (sb) await sb.auth.signOut();
  window.location.reload();
}
window.doSignOut = doSignOut;

/* ── Utilities ────────────────────────────────────────────────── */
function togglePw(inputId, btn) {
  const inp = document.getElementById(inputId);
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.textContent = show ? 'Hide' : 'Show';
}

['loginPw','loginEmail'].forEach(id => document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); }));
document.getElementById('signupPw')?.addEventListener('keydown', e => { if (e.key === 'Enter') doSignup(); });
