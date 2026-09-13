const SB_URL = 'https://buzcxrbjutexiofetgvn.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1emN4cmJqdXRleGlvZmV0Z3ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3Nzc1NTEsImV4cCI6MjA4OTM1MzU1MX0.ifMup4fCcfHaf7Q4TYfi1X1V-J8tQpu2JwaqvjBcsBQ';
let sb = null;
try { if (SB_URL !== 'YOUR_SUPABASE_URL') sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { detectSessionInUrl: true } }); } catch(e) {}

/* mentor was missing here, so a mentor signing in fell through to the
   student portal, which then bounced them back for having the wrong role. */
const ROUTES = { teacher:'/portal-teacher.html', ambassador:'/portal-ambassador.html', student:'/portal-student.html', judge:'/portal-judge.html', mentor:'/portal-mentor.html', admin:'/portal-admin.html' };

// Roles that require admin approval before portal access
const APPROVAL_ROLES = ['teacher', 'ambassador'];

/* Roles that must sign up with a school address. Ambassadors are left
   out deliberately - a student ambassador is often organising a club
   before the district has issued them anything. */
const SCHOOL_EMAIL_ROLES = ['student', 'teacher'];

/* Mirrors fg_is_school_email() in migration 10. This copy exists to tell
   someone what is wrong while they are still typing; the database is
   what actually enforces it, so the two disagreeing is a UX problem
   rather than a hole. .edu alone would turn away almost every US K-12
   school, which is why the K-12 patterns are here too. */
function looksLikeSchoolEmail(email) {
  const domain = String(email || '').trim().toLowerCase().split('@')[1];
  if (!domain) return false;
  if (domain.endsWith('.edu')) return true;               // US higher ed
  if (/\.k12\.[a-z]{2}\.us$/.test(domain)) return true;    // columbus.k12.oh.us
  if (/(^|[.-])k12([.-]|$)/.test(domain)) return true;    // cps-k12.org
  if (/\.(ac|edu|sch)\.[a-z]{2}$/.test(domain)) return true; // ac.uk, edu.au
  return false;
}

/* The allowlist lives in the database so an admin can add a district
   without a deploy. Unreachable here means we let the signup proceed and
   leave the decision to the server, rather than blocking on a lookup. */
async function isAllowlistedDomain(email) {
  const domain = String(email || '').trim().toLowerCase().split('@')[1];
  if (!domain || !sb) return false;
  try {
    const { data } = await sb.from('school_email_domains').select('domain');
    return (data || []).some(d => {
      const allowed = String(d.domain).toLowerCase();
      return domain === allowed || domain.endsWith('.' + allowed);
    });
  } catch (_) { return false; }
}

// Roles the signup form lets a person pick without review. These are the
// only roles fg_self_provision_role() will write.
const SELF_PROVISION_ROLES = ['student', 'ambassador', 'teacher'];

/* Holds why the last claim was refused. fg_self_provision_role raises for
   a non-school address, and discarding that was what put Google signups
   in a loop: the chooser accepted the role, wrote it to metadata, the
   database refused it, and the chooser came back with nothing said. */
let lastProvisionError = null;

/* Role lives in user_roles, not user_metadata - a signed-in user can
   rewrite their own metadata from the browser, so it is never trusted
   for routing. A first login after signup has no user_roles row yet,
   so claim one from whatever they picked on the signup form. */
async function fetchOrProvisionRole(user) {
  lastProvisionError = null;

  /* An admin grant recorded against this address before the account
     existed. Tried first, not last: the signup form has no admin option,
     so someone arriving to claim one may have picked teacher or student
     on the way in, and the grant has to outrank that. It is spent on the
     first claim, so this is a one-time upgrade, not a standing override. */
  const { data: adminRole } = await sb.rpc('fg_claim_admin_role');
  if (adminRole) return adminRole;

  const { data: row } = await sb.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
  if (row?.role) return row.role;
  const claimed = user.user_metadata?.role;
  if (claimed && SELF_PROVISION_ROLES.includes(claimed)) {
    const { data, error } = await sb.rpc('fg_self_provision_role', { p_role: claimed });
    if (error) lastProvisionError = error.message || String(error);
    if (!error && data) return data;
  }

  /* Judge and mentor cannot be self-provisioned - both are granted only
     against an approval an admin has already given. The portal pages have
     always tried these; this page never did, so a judge or mentor signing
     in here was handed the student/teacher/ambassador role chooser
     instead of their portal. */
  const { data: judgeRole } = await sb.rpc('fg_claim_judge_role');
  if (judgeRole) return judgeRole;

  const { data: mentorRole } = await sb.rpc('fg_claim_mentor_role');
  if (mentorRole) return mentorRole;

  return null;
}

/* Distinguishes a judge waiting on approval from someone who never
   applied, so the former is told to wait rather than being asked which
   kind of student they are. */
async function pendingJudgeStatus() {
  const { data } = await sb.rpc('fg_judge_status');
  return data || null;
}

// Set to true during signup to prevent the onAuthStateChange listener from auto-redirecting
let suppressAutoRedirect = false;

// Guards re-entry: auth events can fire while we are already routing.
let routingGuard = false;

/* ── What the email link left in the fragment ─────────────────────
   Supabase reports both outcomes in the URL fragment and neither one
   reaches us through getSession(): a failure is not raised as an error,
   and a recovery token looks exactly like an ordinary sign-in. Both have
   to be read here, synchronously, before any auth event fires - a
   recovery arriving as SIGNED_IN would otherwise be routed straight into
   a portal, which is why "Forgot password?" never once let anyone
   change their password. */
function readAuthHash() {
  const raw = (window.location.hash || '').replace(/^#/, '');
  if (!raw) return {};
  const p = new URLSearchParams(raw);
  const code = p.get('error_code') || p.get('error');
  return {
    type: p.get('type'),
    error: code ? { code, description: (p.get('error_description') || '').replace(/\+/g, ' ') } : null
  };
}

const authHash = readAuthHash();

/* A recovery link must land on the new-password form, not a portal. */
let pendingRecovery = authHash.type === 'recovery';
if (pendingRecovery) suppressAutoRedirect = true;

/* ── Dead sign-in link ────────────────────────────────────────── */
function showLinkError(err) {
  const box = document.getElementById('linkErrorBox');
  if (!box) return;
  const expired = /expired|invalid/i.test(err.code + ' ' + err.description);
  box.innerHTML = expired
    ? `<strong>That sign-in link has already expired.</strong>
       Links work once and only for a short while. If your school or workplace filters
       email, its security scanner may also have opened the link before you did, which
       uses it up. Ask for a <a href="#" onclick="showCodeStep(event)">6-digit code</a>
       instead - a code is typed in, so nothing can spend it before you do.`
    : `<strong>We could not complete that sign-in.</strong>
       ${err.description || err.code}`;
  box.style.display = 'block';
  // Leaving the fragment in place means a refresh re-reports a failure
  // that has already been explained.
  try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (_) {}
}

if (authHash.error) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => showLinkError(authHash.error));
  } else {
    showLinkError(authHash.error);
  }
}

/* ── Pending-role stash ───────────────────────────────────────────
   Google OAuth cannot carry user_metadata through the redirect, so we
   remember the role the visitor picked and apply it when they come back. */
const PENDING_ROLE_KEY    = 'fg_pending_role';
const PENDING_NAME_KEY    = 'fg_pending_name';
const PENDING_DETAILS_KEY = 'fg_pending_details';

function stashPendingRole(role, name, details) {
  try {
    localStorage.setItem(PENDING_ROLE_KEY, role);
    if (name) localStorage.setItem(PENDING_NAME_KEY, name);
    // The school fields are filled in before the redirect and would
    // otherwise be lost on the way back, leaving the queue row blank.
    if (details) localStorage.setItem(PENDING_DETAILS_KEY, JSON.stringify(details));
  } catch (_) {}
}
function readPendingRole() { try { return localStorage.getItem(PENDING_ROLE_KEY); } catch (_) { return null; } }
function readPendingName() { try { return localStorage.getItem(PENDING_NAME_KEY); } catch (_) { return null; } }
function readPendingDetails() {
  try { return JSON.parse(localStorage.getItem(PENDING_DETAILS_KEY) || 'null'); } catch (_) { return null; }
}
function clearPendingRole() {
  try {
    localStorage.removeItem(PENDING_ROLE_KEY);
    localStorage.removeItem(PENDING_NAME_KEY);
    localStorage.removeItem(PENDING_DETAILS_KEY);
  } catch (_) {}
}

/* Accepts a district address typed the way people actually type one -
   "bathschools.org", "www.bathschools.org/", with or without a scheme.
   Returns null when it is not a web address at all. */
function normalizeWebsite(raw) {
  const typed  = (raw || '').trim().replace(/\s+/g, '');
  const scheme = /^http:\/\//i.test(typed) ? 'http://' : 'https://';
  const bare   = typed.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!/^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(bare)) return null;
  // Some district sites are still http-only, so an address typed that way
  // is left alone rather than upgraded into a link that will not open.
  return scheme + bare;
}

/* ── portal_requests row (the admin approval queue) ───────────────
   Shared by the password and Google signup paths. Returns {ok}. A failure
   here means the request is invisible to the admin, so callers must say so
   rather than telling the user their account is under review. */
async function ensurePortalRequest(email, name, role, details) {
  if (!sb || !APPROVAL_ROLES.includes(role)) return { ok: true };
  const { data: existing, error: selErr } = await sb.from('portal_requests')
    .select('id,status').eq('email', email).eq('type', role).limit(1);
  if (!selErr && existing && existing.length) return { ok: true, existing: existing[0] };
  const d = details || {};
  const { error: insErr } = await sb.from('portal_requests').insert([{
    name:   name || email,
    email:  email,
    school: d.school || '',
    type:   role,
    status: 'pending',
    // The admin reviews these by hand, so everything the person told us
    // travels with the request rather than sitting only on the auth user.
    data:   {
      school: d.school || '',
      ...(d.district_website ? { district_website: d.district_website } : {}),
      source: d.source || 'signup_form'
    }
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
    // A recovery link also produces a session. Routing on it is what
    // sent people into their portal with the old password still live.
    if (pendingRecovery) { showNewPasswordStep(session.user); return; }
    const { data: refreshed } = await sb.auth.refreshSession();
    const user = refreshed?.session?.user || session.user;
    await go(user);
  }
});

/* ── Auth state listener ──────────────────────────────────────── */
if (sb) sb.auth.onAuthStateChange(async (event, session) => {
  // Supabase raises this for a recovery token whether it arrived as a
  // link or a typed code. Either way the only correct next screen is the
  // new-password form.
  if (event === 'PASSWORD_RECOVERY' && session?.user) {
    pendingRecovery = true;
    suppressAutoRedirect = true;
    showNewPasswordStep(session.user);
    return;
  }
  if (suppressAutoRedirect || pendingRecovery) return;
  if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
    await go(session.user);
  }
});

/* ── Route after login ───────────────────────────────────────── */
async function go(user) {
  if (routingGuard) return;
  routingGuard = true;
  try {
    let role = await fetchOrProvisionRole(user);

    // Google sign-in creates the account with no role attached. Apply the role
    // chosen before the redirect, and ask rather than guess if we do not have one.
    if (!role) {
      /* An approved judge already has their role by now, so an application
         still on file means it has not been activated yet. Say so - the
         role chooser only offers student, ambassador and teacher, and
         offering it to a waiting judge is how this looked like a failed
         sign-in rather than a queue. */
      const jStatus = await pendingJudgeStatus();
      if (jStatus) { showPendingScreen(user.email, 'judge'); return; }

      const pending = readPendingRole();
      if (pending && pending !== 'judge') {
        // No school on file means the stash predates the school fields, or
        // was never written. Ask rather than create another account with a
        // blank school on it.
        const stashed = readPendingDetails();
        if (!stashed?.school) {
          showRoleChooser(user);
          return;
        }
        role = await applyRole(user, pending, {
          school: stashed.school,
          ...(stashed.district_website ? { district_website: stashed.district_website } : {})
        }, stashed);
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
async function applyRole(user, role, extra, details) {
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

  const req = await ensurePortalRequest(user.email, name, role, {
    ...(details || {}), source: 'google_signup'
  });
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
      <button type="button" class="role-card" onclick="chooseRole('student',this)">
        <span class="role-card-title">Student</span>
        <span class="role-card-desc">Science fair participant</span>
      </button>
      <button type="button" class="role-card" onclick="chooseRole('ambassador',this)">
        <span class="role-card-title">Student Ambassador</span>
        <span class="role-card-desc">Lead science fair at your school</span>
      </button>
      <button type="button" class="role-card" onclick="chooseRole('teacher',this)">
        <span class="role-card-title">Teacher</span>
        <span class="role-card-desc">Organize a school science fair</span>
      </button>
    </div>
    <div id="chooserDetails" style="display:none;margin-top:16px;">
      <p class="form-hint" style="margin-bottom:12px;">Both fields are required.</p>
      <div class="form-group">
        <label class="form-label">School name</label>
        <input type="text" id="chooserSchool" placeholder="Bath High School" autocomplete="organization"/>
      </div>
      <div class="form-group" id="chooserDistrictGroup" style="display:none;">
        <label class="form-label">School district website</label>
        <input type="url" id="chooserDistrict" placeholder="https://www.bathschools.org"/>
        <span class="form-hint">The district or school site that lists your school - we use it to confirm you teach there before approving the account.</span>
      </div>
      <button class="btn-main" id="chooserContinue" onclick="confirmChooserRole()">Continue &rarr;</button>
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

  /* Second and later visits to this screen mean a claim was refused.
     Saying so is the whole difference between a form and a loop. */
  if (lastProvisionError) {
    showRoleError(lastProvisionError.replace(/^[A-Z_]+:\s*/, ''));
    lastProvisionError = null;
  }
}

function handleChooserAge(cb) {
  const panel = document.getElementById('chooserU13');
  if (!panel) return;
  panel.style.display = cb.checked ? 'none' : 'block';
  if (cb.checked) { const g = document.getElementById('chooserGuardian'); if (g) g.value = ''; }
}
window.handleChooserAge = handleChooserAge;

/* Picking a card only opens the second step. OAuth accounts used to be
   created straight from the click, which is how they arrived with no
   school on them - the queue then had nothing to review. */
let chooserRole = null;

function chooseRole(role, el) {
  chooserRole = role;
  document.querySelectorAll('#chooserGrid .role-card').forEach(c => c.classList.remove('selected'));
  if (el) el.classList.add('selected');

  const details = document.getElementById('chooserDetails');
  if (details) details.style.display = 'block';
  const districtGroup = document.getElementById('chooserDistrictGroup');
  if (districtGroup) {
    districtGroup.style.display = role === 'teacher' ? 'block' : 'none';
    if (role !== 'teacher') { const d = document.getElementById('chooserDistrict'); if (d) d.value = ''; }
  }
  const el2 = document.getElementById('chooserMsg');
  if (el2) { el2.textContent = ''; el2.className = 'msg'; }
  document.getElementById('chooserSchool')?.focus();
}
window.chooseRole = chooseRole;

async function confirmChooserRole() {
  const role = chooserRole;
  if (!role) { showRoleError('Please choose which one you are first.'); return; }

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

  const school = document.getElementById('chooserSchool')?.value.trim() || '';
  if (!school) {
    showRoleError('Please enter your school name - we cannot place an account without it.');
    return;
  }
  extra.school = school;

  /* The same check the email signup form has always made. Without it the
     Google path let a personal address through, and the refusal only
     surfaced from the database afterwards - where it was discarded. The
     address is fixed by the time we get here, so the only useful thing
     to do is say which account they need to use. */
  const { data: whoami } = await sb.auth.getUser();
  const addr = whoami?.user?.email || '';
  if (SCHOOL_EMAIL_ROLES.includes(role)
      && !looksLikeSchoolEmail(addr)
      && !(await isAllowlistedDomain(addr))) {
    showRoleError(
      'A ' + role + ' account needs a school email address, and ' + addr + ' is not one we recognise. '
      + 'Sign out and continue with your school Google account instead. If that is your school address, '
      + 'email fairgameinitiative@outlook.com and we will add your school.');
    return;
  }

  let districtWebsite = '';
  if (role === 'teacher') {
    const districtRaw = document.getElementById('chooserDistrict')?.value.trim() || '';
    if (!districtRaw) {
      showRoleError('Please add your school district website so we can confirm you teach there.');
      return;
    }
    districtWebsite = normalizeWebsite(districtRaw);
    if (!districtWebsite) {
      showRoleError('That district website does not look like a web address. It should look like https://www.bathschools.org');
      return;
    }
    extra.district_website = districtWebsite;
  }

  const grid = document.getElementById('chooserGrid');
  if (grid) grid.querySelectorAll('button').forEach(b => b.disabled = true);
  const cont = document.getElementById('chooserContinue');
  if (cont) { cont.disabled = true; cont.textContent = 'Please wait…'; }
  msg('chooserMsg', 'Setting up your account…', 'ok');
  const { data } = await sb.auth.getUser();
  const user = data?.user;
  if (!user) { window.location.reload(); return; }
  const applied = await applyRole(user, role, extra, { school, district_website: districtWebsite });
  if (!applied) {
    // applyRole has already said what went wrong; hand the form back so
    // the person can fix it rather than leaving them on a dead screen.
    if (grid) grid.querySelectorAll('button').forEach(b => b.disabled = false);
    if (cont) { cont.disabled = false; cont.textContent = 'Continue →'; }
    return;
  }
  suppressAutoRedirect = false;
  const { data: fresh } = await sb.auth.getUser();
  await go(fresh?.user || user);
}
window.confirmChooserRole = confirmChooserRole;

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

  // Only a teacher can be checked against a district site, so only a
  // teacher is asked for one.
  const districtGroup = document.getElementById('districtGroup');
  if (districtGroup) {
    districtGroup.style.display = role === 'teacher' ? 'block' : 'none';
    if (role !== 'teacher') { const d = document.getElementById('signupDistrict'); if (d) d.value = ''; }
  }
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
  const school       = document.getElementById('signupSchool')?.value.trim() || '';
  const districtRaw  = document.getElementById('signupDistrict')?.value.trim() || '';
  const ageChecked   = document.getElementById('ageCheck').checked;
  const termsChecked = document.getElementById('termsCheck').checked;
  const guardianEmail= document.getElementById('guardianEmail')?.value.trim() || '';

  if (!name || !email || !pw) { msg('signupMsg','All fields are required.','err'); return; }
  if (pw.length < 8) { msg('signupMsg','Password must be at least 8 characters.','err'); return; }

  // Accounts kept arriving with no school on them, which leaves the
  // approval queue with nothing to check and no way to place the person.
  if (!school) {
    msg('signupMsg','Please enter your school name - we cannot place an account without it.','err');
    return;
  }

  let districtWebsite = '';
  if (selectedRole === 'teacher') {
    if (!districtRaw) {
      msg('signupMsg','Please add your school district website so we can confirm you teach there.','err');
      return;
    }
    districtWebsite = normalizeWebsite(districtRaw);
    if (!districtWebsite) {
      msg('signupMsg','That district website does not look like a web address. It should look like https://www.bathschools.org','err');
      return;
    }
  }

  if (SCHOOL_EMAIL_ROLES.includes(selectedRole)
      && !looksLikeSchoolEmail(email)
      && !(await isAllowlistedDomain(email))) {
    msg('signupMsg',
      'Please use your school email address - a personal address like Gmail or Outlook will not work for a '
      + selectedRole + ' account. If you are using your school address and still see this, email '
      + 'fairgameinitiative@outlook.com and we will add your school.',
      'err');
    return;
  }
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
    school,
    ...(districtWebsite ? { district_website: districtWebsite } : {}),
    age_confirmed: ageChecked,
    terms_accepted: true,
    terms_accepted_at: new Date().toISOString(),
    ...(needsApproval ? { account_status: 'pending_approval' } : {}),
    ...(isUnder13 ? { guardian_consent_required: true, guardian_email: guardianEmail, account_status: 'pending_parental_consent' } : {})
  };

  const { data, error } = await sb.auth.signUp({
    email, password: pw,
    options: {
      data: metadata,
      // Only used when the project requires email confirmation. Without
      // it the link lands on whatever Site URL happens to be set, which
      // is rarely the page that can complete the sign-in.
      emailRedirectTo: window.location.origin + '/portal-router.html',
    }
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
    const res = await ensurePortalRequest(email, name, selectedRole, {
      school, district_website: districtWebsite
    });
    requestOk = res.ok;
  }

  setLoading('signupBtn', false);
  suppressAutoRedirect = false;

  if (needsApproval && !requestOk) {
    msg('signupMsg',
      'Your account was created, but we could not file your access request automatically. Please email fairgameinitiative@outlook.com with your name and school so we can approve you by hand.',
      'err');
    return;
  }

  // A session on the signUp result means the project does not require
  // email confirmation, so the account is usable this second. No session
  // means Supabase has sent a confirmation link and is waiting on it.
  const signedInNow = !!data?.session;

  if (isUnder13) {
    msg('signupMsg',
      'Account created! A consent request has been sent to your parent or guardian at ' + guardianEmail + '.'
      + (signedInNow ? '' : ' Please also check ' + email + ' to confirm your email address.'),
      'ok');
    return;
  }

  if (signedInNow) {
    // Hand straight to the router. For a teacher or ambassador that lands
    // on the under-review screen, which is the only gate they should meet;
    // for anyone else it opens their portal.
    msg('signupMsg',
      needsApproval
        ? 'Account created. Taking you to your account status…'
        : 'Account created. Signing you in…',
      'ok');
    await go(data.user);
    return;
  }

  msg('signupMsg',
    needsApproval
      ? 'Account created! Confirm your email address using the link we just sent to ' + email
        + ', then sign in. Your access request is already in our review queue - typically 1–3 business days.'
      : 'Account created! Check your email to confirm your address, then sign in.',
    'ok');
}

/* ── Google OAuth ─────────────────────────────────────────────
   OAuth cannot carry metadata through the redirect, so a signup must stash
   the chosen role first - otherwise the account comes back role-less and
   teachers land in the student portal with no request in the queue. */
async function doGoogle(context) {
  if (!sb) { alert('Google sign-in is not configured yet.'); return; }

  if (context === 'signup') {
    if (!selectedRole) { msg('signupMsg','Please select your role above before continuing with Google.','err'); return; }
    if (SCHOOL_EMAIL_ROLES.includes(selectedRole)) {
      // The address is not known until after the redirect, so this is a
      // heads-up rather than a check. fg_self_provision_role refuses on
      // the way back if the account turns out not to be a school one.
      msg('signupMsg', 'Choose your school Google account on the next screen - a personal one will not be accepted.', 'info');
    }
    if (selectedRole === 'judge') { msg('signupMsg','Judge and mentor accounts are created through the volunteer registration form.','err'); return; }
    if (!document.getElementById('termsCheck')?.checked) { msg('signupMsg','You must agree to the Terms of Service and Privacy Policy.','err'); return; }
    if (!document.getElementById('ageCheck')?.checked) {
      msg('signupMsg','If you are under 13, please use the email form above so we can collect a parent or guardian email address.','err');
      return;
    }
    const gSchool = document.getElementById('signupSchool')?.value.trim() || '';
    if (!gSchool) { msg('signupMsg','Please enter your school name before continuing with Google.','err'); return; }
    let gDistrict = '';
    if (selectedRole === 'teacher') {
      const raw = document.getElementById('signupDistrict')?.value.trim() || '';
      if (!raw) { msg('signupMsg','Please add your school district website before continuing with Google.','err'); return; }
      gDistrict = normalizeWebsite(raw);
      if (!gDistrict) { msg('signupMsg','That district website does not look like a web address. It should look like https://www.bathschools.org','err'); return; }
    }
    stashPendingRole(selectedRole, document.getElementById('signupName')?.value.trim() || '', {
      school: gSchool,
      ...(gDistrict ? { district_website: gDistrict } : {}),
      source: 'google_signup'
    });
  }

  await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/login.html' }
  });
}
window.doGoogle = doGoogle;

/* ── Sign-in codes ────────────────────────────────────────────────
   A clicked link is spent by whoever opens it first, and for addresses
   behind a mail security gateway that is routinely the scanner rather
   than the person. A typed code cannot be spent that way, so this is the
   path we point people at when a link has failed - and the only path a
   judge or anyone else without a password has.

   One panel serves sign-in and password recovery; they differ only in
   the OTP type, so the mode is tracked rather than duplicated. */
let codeMode = 'email';   // 'email' | 'recovery'

function showPanel(name) {
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + name)?.classList.add('active');
  // The tabs only address sign-in and signup; the code and new-password
  // steps are mid-flow and a tab click would abandon them silently.
  const tabs = document.querySelector('.auth-tabs');
  if (tabs) tabs.style.display = (name === 'login' || name === 'signup') ? '' : 'none';
}

function showCodeStep(e) {
  if (e) e.preventDefault();
  codeMode = 'email';
  // Carry over whatever they already typed rather than asking twice.
  const typed = document.getElementById('loginEmail')?.value.trim();
  if (typed) { const f = document.getElementById('codeEmail'); if (f) f.value = typed; }
  showPanel('code');
  document.getElementById('codeEmail')?.focus();
}
window.showCodeStep = showCodeStep;

function showPasswordStep(e) {
  if (e) e.preventDefault();
  showPanel('login');
}
window.showPasswordStep = showPasswordStep;

async function sendSignInCode() {
  const email = document.getElementById('codeEmail').value.trim();
  if (!email) { msg('codeMsg','Enter your email address first.','err'); return; }
  if (!sb) { msg('codeMsg','Auth not configured.','err'); return; }

  const btn = document.getElementById('codeSendBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  const { error } = codeMode === 'recovery'
    ? await sb.auth.resetPasswordForEmail(email)
    /* shouldCreateUser:false so a mistyped address reports itself rather
       than quietly standing up an account nobody asked for. */
    : await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });

  if (btn) { btn.disabled = false; btn.textContent = 'Email me a code →'; }

  if (error) {
    // Supabase rate-limits one of these per address per minute, and the
    // raw message for that does not say so.
    const m = /rate|seconds|60/i.test(error.message || '')
      ? 'We have already sent a code to that address in the last minute. Check your inbox, then try again shortly.'
      : /signups not allowed|not found/i.test(error.message || '')
        ? 'We could not find an account for that address. Check the spelling, or create an account instead.'
        : error.message;
    msg('codeMsg', m, 'err');
    return;
  }

  const entry = document.getElementById('codeEntry');
  if (entry) entry.style.display = 'block';
  msg('codeMsg', 'Code sent to ' + email + '. It is a 6-digit number - enter it below.', 'ok');
  document.getElementById('codeToken')?.focus();
}
window.sendSignInCode = sendSignInCode;

async function verifySignInCode() {
  const email = document.getElementById('codeEmail').value.trim();
  const token = (document.getElementById('codeToken').value || '').replace(/\s/g, '');
  if (!token) { msg('codeMsg','Enter the code from your email.','err'); return; }
  if (!sb) return;

  const btn = document.getElementById('codeVerifyBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Please wait…'; }

  /* A recovery code produces a session just like a sign-in one, so the
     routing listener has to be held off before it is redeemed or the
     new-password form is skipped again. */
  if (codeMode === 'recovery') { pendingRecovery = true; suppressAutoRedirect = true; }

  const { data, error } = await sb.auth.verifyOtp({
    email, token, type: codeMode === 'recovery' ? 'recovery' : 'email'
  });

  if (btn) { btn.disabled = false; btn.textContent = 'Sign in →'; }

  if (error) {
    if (codeMode === 'recovery') { pendingRecovery = false; suppressAutoRedirect = false; }
    msg('codeMsg',
      /expired|invalid/i.test(error.message || '')
        ? 'That code is not valid, or it has expired. Request another one below.'
        : error.message,
      'err');
    return;
  }

  if (codeMode === 'recovery') {
    showNewPasswordStep(data?.user);
    return;
  }
  // Sign-in codes hand off to the same routing everything else uses.
  if (data?.user) await go(data.user);
}
window.verifySignInCode = verifySignInCode;

/* ── Set a new password ───────────────────────────────────────────
   The step the reset flow never had. resetPasswordForEmail signed the
   person in and the routing listener sent them to their portal, so the
   password they came to change stayed exactly as it was. */
function showNewPasswordStep(user) {
  pendingRecovery = true;
  suppressAutoRedirect = true;
  const el = document.getElementById('newPwEmail');
  if (el) el.textContent = user?.email || 'your account';
  showPanel('newpw');
  // A recovery token in the fragment is spent; leaving it there means a
  // refresh looks like a fresh recovery.
  try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (_) {}
  document.getElementById('resetPw')?.focus();
}

async function submitNewPassword() {
  const pw      = document.getElementById('resetPw').value;
  const confirm = document.getElementById('resetPwConfirm').value;
  if (pw.length < 8)  { msg('resetPwMsg','Password must be at least 8 characters.','err'); return; }
  if (pw !== confirm) { msg('resetPwMsg','Those two passwords do not match.','err'); return; }
  if (!sb) return;

  const btn = document.getElementById('resetPwBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  const { error } = await sb.auth.updateUser({ password: pw });
  if (btn) { btn.disabled = false; btn.textContent = 'Save password and continue →'; }

  if (error) { msg('resetPwMsg', error.message, 'err'); return; }

  msg('resetPwMsg', 'Password saved. Opening your portal…', 'ok');
  // The gate is lifted only now that the password is actually changed.
  pendingRecovery = false;
  suppressAutoRedirect = false;
  const { data } = await sb.auth.getUser();
  if (data?.user) await go(data.user);
}
window.submitNewPassword = submitNewPassword;

/* ── Forgot password ──────────────────────────────────────────── */
async function showForgot(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) { msg('loginMsg','Enter your email address above first.','err'); return; }
  if (!sb) return;
  // Recovery runs through the same typed-code panel as sign-in, for the
  // same reason: a link in a filtered inbox may be spent before it is read.
  codeMode = 'recovery';
  const f = document.getElementById('codeEmail');
  if (f) f.value = email;
  showPanel('code');
  await sendSignInCode();
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

/* Enter should submit the step the person is actually looking at. */
document.getElementById('codeEmail')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendSignInCode(); });
document.getElementById('codeToken')?.addEventListener('keydown', e => { if (e.key === 'Enter') verifySignInCode(); });
['resetPw','resetPwConfirm'].forEach(id =>
  document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') submitNewPassword(); }));

/* A code is digits; pasting one out of an email often brings spaces with it. */
document.getElementById('codeToken')?.addEventListener('input', e => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
});

/* The portal's expired-link screen sends people here with ?code=1, and a
   dead link has already been explained by then - open the code step
   rather than a password form they cannot fill. Runs last so the module's
   own declarations are all initialised. */
if (new URLSearchParams(window.location.search).get('code') === '1' && !pendingRecovery) {
  showCodeStep();
}
