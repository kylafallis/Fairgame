/* The Supabase client, getRole(), and claimRole() come from
   portal-shared.js, loaded first - classic scripts share one global
   scope, so `sb` declared there is usable here by name. */

const ROUTES = {
  teacher:    '/portal-teacher.html',
  ambassador: '/portal-ambassador.html',
  student:    '/portal-student.html',
  judge:      '/portal-judge.html',
  mentor:     '/portal-mentor.html',
  admin:      '/portal-admin.html',
};

/* Nothing on this page ever settles on its own - it either redirects or
   it does not. Anything that stops the redirect has to stop the
   spinner too, or the page sits there claiming to be working. */
function routerFail(html) {
  const sp = document.querySelector('.spinner');
  if (sp) sp.style.display = 'none';
  const h = document.querySelector('.box h2');
  const p = document.querySelector('.box p');
  if (h) h.textContent = 'We could not sign you in';
  if (p) p.style.display = 'none';
  const err = document.getElementById('errMsg');
  if (err) err.innerHTML = html;
}

let routed = false;
async function routeTo(role, user) {
  if (routed) return;
  routed = true;
  await window.fgTrack?.('login-success', {
    via: 'router', role: role || 'none', provider: user?.app_metadata?.provider || 'unknown'
  });
  window.location.replace(ROUTES[role] || '/portal-ambassador.html');
}

async function resolveRole(user) {
  // A standing admin grant is applied before anything else is read, so it
  // wins over a role the signup form self-provisioned on the way in.
  let role = await claimAdminRole();
  if (role) return role;

  role = await getRole(user.id);
  if (!role) {
    const claimed = user.user_metadata?.role;
    if (claimed && SELF_PROVISION_ROLES.includes(claimed)) role = await claimRole(claimed);
  }
  // An approved mentor arriving for the first time has no role until
  // they claim it, and the claim is gated on that admin approval.
  if (!role) role = await claimMentorRole();
  // The judge counterpart, gated on the admin's Activate click. The
  // portal pages have tried this since migration 12; this page never
  // did, so an activated judge who came in through a magic link was
  // told they had no portal access.
  if (!role) role = await claimJudgeRole();
  return role;
}

/* A dead link arrives as an error in the fragment, not as an auth event,
   so without this the spinner ran for the full 15 seconds before saying
   anything. Say it now, and point at the code that cannot be spent early. */
const linkErr = readAuthHashError();
if (linkErr) {
  routed = true;
  const expired = /expired|invalid/i.test(linkErr.code + ' ' + linkErr.description);
  window.fgTrack?.('login-link-failed', { code: linkErr.code, page: 'router' });
  routerFail(
    (expired
      ? 'This sign-in link has expired or was already used. If your school filters email, its scanner may have opened it first.'
      : 'Sign-in failed: ' + (linkErr.description || linkErr.code)) +
    '<br><a href="/login.html?code=1">Email me a sign-in code instead →</a>');
  try { history.replaceState(null, '', window.location.pathname); } catch (_) {}
}

// Supabase magic link puts the token in the URL hash
sb.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session?.user) {
    routeTo(await resolveRole(session.user), session.user);
  }
  if (event === 'SIGNED_OUT') {
    window.location.replace('/login.html');
  }
});

// Handle cases where the hash is already resolved
sb.auth.getSession().then(async ({ data: { session }, error }) => {
  if (error) {
    routerFail('Sign-in failed: ' + error.message + '<br><a href="/login.html">Try again →</a>');
    return;
  }
  if (session?.user) {
    const role = await resolveRole(session.user);
    if (!role) {
      // Signed in, but nothing grants them a portal. Bouncing to the
      // login page would loop; say what happened instead.
      console.warn('No role found in user_roles for', session.user.email);
      window.fgTrack?.('login-no-role', { provider: session.user.app_metadata?.provider || 'unknown' });
      routerFail(
        'Your account does not have portal access yet.<br>' +
        'If you applied recently we are still reviewing it - you will get an email once approved.<br>' +
        '<a href="/login.html">Back to sign in →</a>');
      return;
    }
    routeTo(role, session.user);
  }
  // No session and no error means we are waiting on the magic-link hash,
  // which onAuthStateChange will deliver. If it never arrives the
  // timeout below stops the spinner rather than leaving it forever.
});

setTimeout(() => {
  if (routed) return;
  window.fgTrack?.('login-link-failed', { code: 'timeout', page: 'router' });
  routerFail(
    'This sign-in link did not work. It may have expired or already been used.<br>' +
    '<a href="/login.html?code=1">Email me a sign-in code instead →</a>');
}, 15000);
