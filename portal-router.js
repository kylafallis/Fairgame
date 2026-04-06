const SB_URL = 'https://buzcxrbjutexiofetgvn.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1emN4cmJqdXRleGlvZmV0Z3ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3Nzc1NTEsImV4cCI6MjA4OTM1MzU1MX0.ifMup4fCcfHaf7Q4TYfi1X1V-J8tQpu2JwaqvjBcsBQ';
const sb = window.supabase.createClient(SB_URL, SB_KEY);

const ROUTES = {
  teacher:    '/portal-teacher.html',
  ambassador: '/portal-ambassador.html',
  student:    '/portal-student.html',
  judge:      '/portal-judge.html',
  admin:      '/portal-admin.html',
};

// Supabase magic link puts the token in the URL hash
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session?.user) {
    const role = session.user.user_metadata?.role || session.user.app_metadata?.role;
    window.location.replace(ROUTES[role] || '/portal-ambassador.html');
  }
  if (event === 'SIGNED_OUT') {
    window.location.replace('/login.html');
  }
});

// Handle cases where the hash is already resolved
sb.auth.getSession().then(({ data: { session }, error }) => {
  if (error) {
    document.getElementById('errMsg').innerHTML =
      'Sign-in failed: ' + error.message + '<br><a href="/login.html">Try again →</a>';
    document.querySelector('.spinner').style.display = 'none';
  } else if (session?.user) {
    const role = session.user.user_metadata?.role || session.user.app_metadata?.role;
    if (!role) {
      console.warn('No role found in user_metadata:', session.user.user_metadata);
    }
    const dest = ROUTES[role] || '/portal-ambassador.html';
    window.location.replace(dest);
  }
});
