const SB_URL = 'https://buzcxrbjutexiofetgvn.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1emN4cmJqdXRleGlvZmV0Z3ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3Nzc1NTEsImV4cCI6MjA4OTM1MzU1MX0.ifMup4fCcfHaf7Q4TYfi1X1V-J8tQpu2JwaqvjBcsBQ';
let sb = null;
try { if (SB_URL !== 'YOUR_SUPABASE_URL') sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { detectSessionInUrl: true } }); } catch(e) {}

const ROUTES = { teacher:'/portal-teacher.html', ambassador:'/portal-ambassador.html', student:'/portal-student.html', judge:'/portal-judge.html', admin:'/portal-admin.html' };

// Roles that require admin approval before portal access
const APPROVAL_ROLES = ['teacher', 'ambassador'];

// Set to true during signup to prevent the onAuthStateChange listener from auto-redirecting
let suppressAutoRedirect = false;

// Guards re-entry: auth events can fire while we are already routing.
let routingGuard = false;

/* ── Pending-role stash ───────────────────────────────────────────
   Google OAuth cannot carry user_metadata through the redirect, so we
   remember the role the visitor picked and apply it when they come back. */
const PENDING_ROLE_KEY = 'fg_pending_role';
const PENDING_NAME_KEY = 'fg_pending_name';

function stashPendingRole(role, name) {
  try {
    localStorage.setItem(PENDING_ROLE_KEY, role);
    if (name) localStorage.setItem(PENDING_NAME_KEY, name);
  } catch (_) {}
}
function readPendingRole() { try { return localStorage.getItem(PENDING_ROLE_KEY); } catch (_) { return null; } }
function readPendingName() { try { return localStorage.getItem(PENDING_NAME_KEY); } catch (_) { return null; } }
function clearPendingRole() {
  try { localStorage.removeItem(PENDING_ROLE_KEY); localStorage.removeItem(PENDING_NAME_KEY); } catch (_) {}
}

/* ── portal_requests row (the admin approval queue) ───────────────
   Shared by the password and Google signup paths. Returns {ok}. A failure
   here means the request is invisible to the admin, so callers must say so
   rather than telling the user their account is under review. */
async function ensurePortalRequest(email, name, role) {
  if (!sb || !APPROVAL_ROLES.includes(role)) return { ok: true };
  const { data: existing, error: selErr } = await sb.from('portal_requests')
    .select('id,status').eq('email', email).eq('type', role).limit(1);
  if (!selErr && existing && existing.length) return { ok: true, existing: existing[0] };
  const { error: insErr } = await sb.from('portal_requests').insert([{
    name:   name || email,
    email:  email,
    school: '',
    type:   role,
    status: 'pending'
  }]);
  if (insErr) {
    console.error('[FairGame] portal_requests insert failed:', insErr.message || insErr);
    return { ok: false, error: insErr };
  }
  return { ok: true };
}

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
  if (routingGuard) return;
  routingGuard = true;
  try {
    let role = user.user_metadata?.role || user.app_metadata?.role || null;

    // Google sign-in creates the account with no role attached. Apply the role
    // chosen before the redirect, and ask rather than guess if we do not have one.
    if (!role) {
      const pending = readPendingRole();
      if (pending && pending !== 'judge') {
        role = await applyRole(user, pending);
        if (!role) return;
      } else {
        showRoleChooser(user);
        return;
      }
    }

    // Admin always goes straight through
    if (role === 'admin') {
      window.location.replace(ROUTES.admin);
      return;
    }

    // Teacher / Ambassador: check approval status in portal_requests
    if (APPROVAL_ROLES.includes(role) && sb) {
      const { data: rows, error: reqErr } = await sb.from('portal_requests')
        .select('status').eq('email', user.email).eq('type', role)
        .in('status', ['pending', 'active', 'rejected'])
        .order('created_at', { ascending: false }).limit(1);
      const req = rows?.[0] || null;
      // If RLS blocked the query, don't block the user - let them through
      if (!reqErr) {
        if (!req || req.status === 'pending') {
          showPendingScreen(user.email, role);
          return;
        }
        if (req.status === 'rejected') {
          showRejectedScreen(user.email);
          return;
        }
      }
      // status === 'active' (or RLS error) → fall through to redirect
    }

    window.location.replace(ROUTES[role] || '/portal-student.html');
  } finally {
    routingGuard = false;
  }
}

/* ── Attach a role to an account that has none (Google path) ──── */
async function applyRole(user, role, extra) {
  const name = user.user_metadata?.name
            || user.user_metadata?.full_name
            || readPendingName()
            || (user.email || '').split('@')[0];

  const { error } = await sb.auth.updateUser({
    data: {
      name,
      role,
      terms_accepted: true,
      terms_accepted_at: new Date().toISOString(),
      ...(APPROVAL_ROLES.includes(role) ? { account_status: 'pending_approval' } : {}),
      ...(extra || {})
    }
  });
  if (error) { showRoleError(error.message); return null; }

  const req = await ensurePortalRequest(user.email, name, role);
  clearPendingRole();
  await sb.auth.refreshSession();

  if (APPROVAL_ROLES.includes(role) && !req.ok) {
    showRequestFailedScreen(user.email, role);
    return null;
  }
  return role;
}

/* ── Role chooser for accounts that arrived without one ───────── */
function showRoleChooser(user) {
  suppressAutoRedirect = true;
  const card = document.querySelector('.login-card');
  if (!card) return;
  card.innerHTML = `
    <h2>One more thing</h2>
    <p class="login-sub" style="margin-bottom:18px;">Signed in as <strong>${user.email}</strong>. Tell us who you are so we can open the right portal.</p>
    <div class="age-confirm" id="chooserAgeBox">
      <div class="age-confirm-row">
        <input type="checkbox" id="chooserAge" onchange="handleChooserAge(this)"/>
        <label for="chooserAge">I confirm that I am <strong>13 years of age or older</strong>.</label>
      </div>
      <div class="under13-panel" id="chooserU13">
        <p><strong>Parental consent required.</strong> Because you are under 13, we need a parent or guardian to authorize your account.</p>
        <input type="email" id="chooserGuardian" placeholder="Parent / Guardian email address" autocomplete="off"/>
      </div>
    </div>
    <div class="role-grid" id="chooserGrid">
      <button type="button" class="role-card" onclick="chooseRole('student')">
        <span class="role-card-title">Student</span>
        <span class="role-card-desc">Science fair participant</span>
      </button>
      <button type="button" class="role-card" onclick="chooseRole('ambassador')">
        <span class="role-card-title">Student Ambassador</span>
        <span class="role-card-desc">Lead science fair at your school</span>
      </button>
      <button type="button" class="role-card" onclick="chooseRole('teacher')">
        <span class="role-card-title">Teacher</span>
        <span class="role-card-desc">Organize a school science fair</span>
      </button>
    </div>
    <div class="msg" id="chooserMsg"></div>
    <p style="font-size:.78rem;color:var(--gray-500);line-height:1.6;margin:14px 0 16px;">
      Teacher and Student Ambassador accounts are reviewed before portal access is granted.
      Judges and mentors register through the <a href="/volunteer.html">volunteer form</a>.
    </p>
    <button onclick="doSignOut()" style="width:100%;padding:10px;background:none;border:1.5px solid var(--gray-200);border-radius:3px;font-size:.82rem;color:var(--gray-500);cursor:pointer;">
      Sign out and switch accounts
    </button>
  `;
}

function handleChooserAge(cb) {
  const panel = document.getElementById('chooserU13');
  if (!panel) return;
  panel.style.display = cb.checked ? 'none' : 'block';
  if (cb.checked) { const g = document.getElementById('chooserGuardian'); if (g) g.value = ''; }
}
window.handleChooserAge = handleChooserAge;

async function chooseRole(role) {
  // Same COPPA gate the email signup uses - OAuth skips it otherwise.
  const ageOk    = document.getElementById('chooserAge')?.checked;
  const guardian = document.getElementById('chooserGuardian')?.value.trim() || '';
  let extra = { age_confirmed: true };
  if (!ageOk) {
    if (role !== 'student') {
      showRoleError('Teacher and Student Ambassador accounts must be held by someone 13 or older.');
      return;
    }
    if (!guardian || !guardian.includes('@')) {
      showRoleError('Please enter a parent or guardian email address so we can request consent.');
      return;
    }
    extra = {
      age_confirmed: false,
      guardian_consent_required: true,
      guardian_email: guardian,
      account_status: 'pending_parental_consent'
    };
  }

  const grid = document.getElementById('chooserGrid');
  if (grid) grid.querySelectorAll('button').forEach(b => b.disabled = true);
  msg('chooserMsg', 'Setting up your account…', 'ok');
  const { data } = await sb.auth.getUser();
  const user = data?.user;
  if (!user) { window.location.reload(); return; }
  const applied = await applyRole(user, role, extra);
  if (!applied) return;
  suppressAutoRedirect = false;
  const { data: fresh } = await sb.auth.getUser();
  await go(fresh?.user || user);
}
window.chooseRole = chooseRole;

function showRoleError(text) {
  const el = document.getElementById('chooserMsg');
  if (el) { el.textContent = text; el.className = 'msg err'; }
  else alert(text);
}

/* ── Shown when the approval request could not be filed ───────── */
function showRequestFailedScreen(email, role) {
  const card = document.querySelector('.login-card');
  if (!card) return;
  card.innerHTML = `
    <h2>Almost there</h2>
    <p class="login-sub" style="margin-bottom:18px;">Signed in as <strong>${email}</strong></p>
    <div style="background:#fef2f2;border:1.5px solid #dc2626;border-radius:4px;padding:14px 16px;font-size:.84rem;color:#7f1d1d;line-height:1.6;margin-bottom:18px;">
      <strong style="display:block;margin-bottom:4px;">We could not file your ${role} access request automatically.</strong>
      Your account exists, but it is not in our review queue yet. Please email
      <a href="mailto:fairgameinitiative@outlook.com?subject=Portal%20access%20request" style="color:#7f1d1d;">fairgameinitiative@outlook.com</a>
      with your name and school and we will approve you by hand.
    </div>
    <button onclick="doSignOut()" style="width:100%;padding:10px;background:none;border:1.5px solid var(--gray-200);border-radius:3px;font-size:.82rem;color:var(--gray-500);cursor:pointer;">
      Sign out
    </button>
  `;
}

function showPendingScreen(email, role) {
  const card = document.querySelector('.login-card');
  card.innerHTML = `
    <h2>Account Under Review</h2>
    <p class="login-sub" style="margin-bottom:18px;">Signed in as <strong>${email}</strong></p>
    <div style="background:#fff8e1;border:1.5px solid #f59e0b;border-radius:4px;padding:14px 16px;font-size:.84rem;color:#78350f;line-height:1.6;margin-bottom:18px;">
      <strong style="display:block;margin-bottom:4px;">Your ${role} account is pending approval.</strong>
      We review all ${role} accounts personally to ensure a safe environment for students. You'll receive an email at <strong>${email}</strong> once your account is approved - typically within 1–3 business days.
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

  // For teacher/ambassador: file the portal_requests row the admin queue reads.
  let requestOk = true;
  if (needsApproval && data?.user) {
    const res = await ensurePortalRequest(email, name, selectedRole);
    requestOk = res.ok;
  }

  setLoading('signupBtn', false);
  suppressAutoRedirect = false;

  if (needsApproval && !requestOk) {
    msg('signupMsg',
      'Your account was created, but we could not file your access request automatically. Please email fairgameinitiative@outlook.com with your name and school so we can approve you by hand.',
      'err');
  } else if (needsApproval) {
    msg('signupMsg',
      'Account created! Your request is now under review. We will contact you at ' + email + ' once your account has been approved - typically within 1–3 business days. Please also confirm your email address from the message we just sent.',
      'ok');
  } else if (isUnder13) {
    msg('signupMsg',
      'Account created! A consent request has been sent to your parent or guardian at ' + guardianEmail + '. Please also check ' + email + ' to confirm your email address.',
      'ok');
  } else {
    msg('signupMsg', 'Account created! Check your email to confirm your address, then sign in.', 'ok');
  }
}

/* ── Google OAuth ─────────────────────────────────────────────
   OAuth cannot carry metadata through the redirect, so a signup must stash
   the chosen role first - otherwise the account comes back role-less and
   teachers land in the student portal with no request in the queue. */
async function doGoogle(context) {
  if (!sb) { alert('Google sign-in is not configured yet.'); return; }

  if (context === 'signup') {
    if (!selectedRole) { msg('signupMsg','Please select your role above before continuing with Google.','err'); return; }
    if (selectedRole === 'judge') { msg('signupMsg','Judge and mentor accounts are created through the volunteer registration form.','err'); return; }
    if (!document.getElementById('termsCheck')?.checked) { msg('signupMsg','You must agree to the Terms of Service and Privacy Policy.','err'); return; }
    if (!document.getElementById('ageCheck')?.checked) {
      msg('signupMsg','If you are under 13, please use the email form above so we can collect a parent or guardian email address.','err');
      return;
    }
    stashPendingRole(selectedRole, document.getElementById('signupName')?.value.trim() || '');
  }

  await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/login.html' }
  });
}
window.doGoogle = doGoogle;

/* ── Forgot password ──────────────────────────────────────────── */
async function showForgot(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) { msg('loginMsg','Enter your email address above first.','err'); return; }
  if (!sb) return;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/login.html' });
  if (error) msg('loginMsg', error.message, 'err');
  else msg('loginMsg', 'Password reset email sent - check your inbox.', 'ok');
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
