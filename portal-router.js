/* The Supabase client, getRole(), and claimRole() come from
   portal-shared.js, loaded first - classic scripts share one global
   scope, so `sb` declared there is usable here by name. */

const ROUTES = {
  teacher:    '/portal-teacher.html',
  ambassador: '/portal-ambassador.html',
  student:    '/portal-student.html',
  judge:      '/portal-judge.html',
  admin:      '/portal-admin.html',
};

async function resolveRole(user) {
  let role = await getRole(user.id);
  if (!role) {
    const claimed = user.user_metadata?.role;
    if (claimed && SELF_PROVISION_ROLES.includes(claimed)) role = await claimRole(claimed);
  }
  return role;
}

// Supabase magic link puts the token in the URL hash
sb.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session?.user) {
    const role = await resolveRole(session.user);
    window.location.replace(ROUTES[role] || '/portal-ambassador.html');
  }
  if (event === 'SIGNED_OUT') {
    window.location.replace('/login.html');
  }
});

// Handle cases where the hash is already resolved
sb.auth.getSession().then(async ({ data: { session }, error }) => {
  if (error) {
    document.getElementById('errMsg').innerHTML =
      'Sign-in failed: ' + error.message + '<br><a href="/login.html">Try again →</a>';
    document.querySelector('.spinner').style.display = 'none';
  } else if (session?.user) {
    const role = await resolveRole(session.user);
    if (!role) {
      console.warn('No role found in user_roles for', session.user.email);
    }
    window.location.replace(ROUTES[role] || '/portal-ambassador.html');
  }
});
