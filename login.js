const SB_URL = 'https://buzcxrbjutexiofetgvn.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1emN4cmJqdXRleGlvZmV0Z3ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3Nzc1NTEsImV4cCI6MjA4OTM1MzU1MX0.ifMup4fCcfHaf7Q4TYfi1X1V-J8tQpu2JwaqvjBcsBQ';
let sb = null;
try { if (SB_URL !== 'YOUR_SUPABASE_URL') sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { detectSessionInUrl: true } }); } catch(e) {}

const ROUTES = { teacher:'/portal-teacher.html', ambassador:'/portal-ambassador.html', student:'/portal-student.html', judge:'/portal-judge.html', admin:'/portal-admin.html' };

if (sb) sb.auth.getSession().then(async ({ data: { session } }) => {
  if (session?.user) {
    // Refresh the token so user_metadata reflects any changes made in the dashboard
    const { data: refreshed } = await sb.auth.refreshSession();
    const user = refreshed?.session?.user || session.user;
    const role = user.user_metadata?.role || user.app_metadata?.role || 'ambassador';
    const card = document.querySelector('.login-card');
    card.innerHTML = `
      <h2>You're signed in</h2>
      <p class="login-sub" style="margin-bottom:20px;">
        Signed in as <strong>${user.email}</strong> (${role})
      </p>
      <a href="${ROUTES[role] || '/portal-ambassador.html'}"
         class="btn-main" style="display:block;text-align:center;padding:12px;
         background:#357a38;color:#fff;font-family:'Playfair Display',serif;
         font-style:italic;font-size:.96rem;text-decoration:none;">
        Go to my portal →
      </a>
      <div style="margin-top:14px;text-align:center;">
        <button onclick="doSignOut()" style="background:none;border:none;
          font-size:.78rem;color:#a0a8a0;cursor:pointer;text-decoration:underline;">
          Sign out and switch accounts
        </button>
      </div>
    `;
  }
});

if (sb) sb.auth.onAuthStateChange((event, session) => {
  if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) go(session.user);
});

function go(user) {
  const role = user.user_metadata?.role || user.app_metadata?.role || 'ambassador';
  window.location.replace(ROUTES[role] || '/portal-ambassador.html');
}

function switchTab(tab, btn) {
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-' + tab).classList.add('active');
}

function msg(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text; el.className = 'msg ' + type;
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  btn.disabled = loading;
  btn.textContent = loading ? 'Please wait…' : (btnId === 'loginBtn' ? 'Sign in →' : 'Create Account →');
}

// ─── Age checkbox handler ───────────────────────────────────────────────────
// The checkbox is checked = "I am 13 or older."
// If user unchecks it, show the parental consent panel.
function handleAgeCheck(checkbox) {
  const panel = document.getElementById('under13Panel');
  if (!checkbox.checked) {
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
    document.getElementById('guardianEmail').value = '';
  }
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pw = document.getElementById('loginPw').value;
  if (!email || !pw) { msg('loginMsg','Please fill in both fields.','err'); return; }
  if (!sb) { msg('loginMsg','Auth not configured — add your Supabase credentials to login.html','err'); return; }
  setLoading('loginBtn', true);
  const { error } = await sb.auth.signInWithPassword({ email, password: pw });
  setLoading('loginBtn', false);
  if (error) msg('loginMsg', error.message, 'err');
}

async function doSignup() {
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const pw = document.getElementById('signupPw').value;
  const ageChecked = document.getElementById('ageCheck').checked;
  const termsChecked = document.getElementById('termsCheck').checked;
  const guardianEmail = document.getElementById('guardianEmail').value.trim();

  // Validate basic fields
  if (!name || !email || !pw) { msg('signupMsg','All fields are required.','err'); return; }
  if (pw.length < 8) { msg('signupMsg','Password must be at least 8 characters.','err'); return; }

  // Validate legal consent
  if (!termsChecked) {
    msg('signupMsg','You must agree to the Terms of Service and Privacy Policy to create an account.','err');
    return;
  }

  // Under-13 flow: if age checkbox is unchecked, require guardian email
  const isUnder13 = !ageChecked;
  if (isUnder13) {
    if (!guardianEmail) {
      msg('signupMsg','Please provide a parent or guardian email address. Accounts for users under 13 require parental consent before activation.','err');
      return;
    }
    if (!guardianEmail.includes('@')) {
      msg('signupMsg','Please provide a valid parent or guardian email address.','err');
      return;
    }
  }

  if (!sb) { msg('signupMsg','Auth not configured.','err'); return; }
  setLoading('signupBtn', true);

  const metadata = {
    name,
    role: 'ambassador',         // default role; admin upgrades after approval
    age_confirmed: ageChecked,  // stored for audit trail
    terms_accepted: true,
    terms_accepted_at: new Date().toISOString()
  };
  if (isUnder13) {
    metadata.guardian_consent_required = true;
    metadata.guardian_email = guardianEmail;
    metadata.account_status = 'pending_parental_consent';
  }

  const { error } = await sb.auth.signUp({
    email, password: pw,
    options: { data: metadata }
  });
  setLoading('signupBtn', false);

  if (error) {
    msg('signupMsg', error.message, 'err');
  } else if (isUnder13) {
    msg('signupMsg',
      'Account created! Because you indicated you are under 13, we have sent a consent request to your parent or guardian at ' + guardianEmail + '. Your account will be activated once they approve. Please also check your own email to confirm your address.',
      'ok');
  } else {
    msg('signupMsg', 'Account created! Check your email to confirm, then sign in.', 'ok');
  }
}

async function doGoogle() {
  if (!sb) { alert('Google OAuth not configured — add Supabase credentials first.'); return; }
  await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/login.html' }
  });
}

async function showForgot(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) { msg('loginMsg','Enter your email address above first.','err'); return; }
  if (!sb) return;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/login.html' });
  if (error) msg('loginMsg', error.message, 'err');
  else msg('loginMsg', 'Password reset email sent — check your inbox.', 'ok');
}

function togglePw(inputId, btn) {
  const inp = document.getElementById(inputId);
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.textContent = show ? 'Hide' : 'Show';
}

['loginPw','loginEmail'].forEach(id => document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); }));
document.getElementById('signupPw')?.addEventListener('keydown', e => { if (e.key === 'Enter') doSignup(); });
