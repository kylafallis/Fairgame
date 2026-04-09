/* ============================================================
   FairGame Initiative — site.js
   All interactivity for every page on fairgameinitiative.org
   ============================================================ */

'use strict';

/* ─────────────────────────────────────────────────────────────
   SUPABASE
   Replace SB_URL and SB_KEY with your project credentials.
   Dashboard → Settings → API
   ───────────────────────────────────────────────────────────── */
const SB_URL = 'https://buzcxrbjutexiofetgvn.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1emN4cmJqdXRleGlvZmV0Z3ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3Nzc1NTEsImV4cCI6MjA4OTM1MzU1MX0.ifMup4fCcfHaf7Q4TYfi1X1V-J8tQpu2JwaqvjBcsBQ';

let sb = null;
try {
  if (window.supabase && SB_URL !== 'YOUR_SUPABASE_URL') {
    sb = window.supabase.createClient(SB_URL, SB_KEY);
  }
} catch (e) {
  console.warn('[FairGame] Supabase not initialised:', e.message);
}


/* ─────────────────────────────────────────────────────────────
   ANALYTICS HELPERS
   ───────────────────────────────────────────────────────────── */
async function logEvent(event, data = {}) {
  if (!sb) return;
  try {
    await sb.from('events').insert([{
      event,
      data,
      page: window.location.pathname,
      ts: new Date().toISOString()
    }]);
  } catch (e) { /* non-blocking */ }
}

async function trackDownload(resource, userType) {
  if (!sb) return;
  try {
    await sb.from('resource_downloads').insert([{
      resource,
      user_type: userType || 'guest',
      page: window.location.pathname,
      ts: new Date().toISOString()
    }]);
  } catch (e) { /* non-blocking */ }
}

// Expose globally so inline onclick handlers can call them
window.logEvent   = logEvent;
window.trackDL    = trackDownload;


/* ─────────────────────────────────────────────────────────────
   NAV — transparent over hero, solid green on scroll
   ───────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────
   NAV AUTH STATE — update user icon based on session
   ───────────────────────────────────────────────────────────── */
function updateNavAuthState() {
  const btn = document.getElementById('navUserBtn');
  if (!btn) return;
  if (!sb) return;
  sb.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) {
      btn.classList.add('logged-in');
      btn.setAttribute('title', session.user.email);
      // Route to the right dashboard based on role stored in user metadata
      const role = session.user.user_metadata?.role || 'student';
      const dashMap = { teacher: '/portal-teacher.html', ambassador: '/portal-ambassador.html', student: '/portal-student.html', admin: '/portal-admin.html' };
      btn.href = dashMap[role] || '/portal-student.html';
    }
  });
}

function initNav() {
  const nav = document.querySelector('nav');
  if (!nav) return;

  // Scroll behaviour: add/remove .scrolled
  function updateNav() {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  }
  window.addEventListener('scroll', updateNav, { passive: true });
  updateNav(); // run once on load in case page is already scrolled

  // Mobile hamburger toggle
  const hamburger = nav.querySelector('.nav-hamburger');
  const navLinks  = nav.querySelector('.nav-links');
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      const isOpen = navLinks.classList.contains('mobile-open');
      if (isOpen) {
        navLinks.classList.remove('mobile-open');
        Object.assign(navLinks.style, { display: '' });
      } else {
        navLinks.classList.add('mobile-open');
        Object.assign(navLinks.style, {
          display:       'flex',
          flexDirection: 'column',
          position:      'fixed',
          top:           '68px',
          left:          '0',
          right:         '0',
          background:    'var(--green-900)',
          padding:       '8px 0 16px',
          borderBottom:  '1px solid rgba(255,255,255,0.08)',
          boxShadow:     'var(--shadow-md)',
          zIndex:        '99'
        });
      }
    });

    // Close mobile nav when any link is clicked
    navLinks.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        navLinks.classList.remove('mobile-open');
        Object.assign(navLinks.style, { display: '' });
      });
    });

    // Close mobile nav on outside click
    document.addEventListener('click', e => {
      if (!nav.contains(e.target) && navLinks.classList.contains('mobile-open')) {
        navLinks.classList.remove('mobile-open');
        Object.assign(navLinks.style, { display: '' });
      }
    });
  }
}


/* ─────────────────────────────────────────────────────────────
   SCROLL REVEAL
   Elements with class .reveal become visible when they enter
   the viewport. JS adds .vis which triggers the CSS transition.
   ───────────────────────────────────────────────────────────── */
function initScrollReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('vis');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });

  items.forEach(el => observer.observe(el));
}


/* ─────────────────────────────────────────────────────────────
   COUNT-UP ANIMATION
   Elements with class .cu and data-t="<number>" count up from
   zero when they scroll into view.
   ───────────────────────────────────────────────────────────── */
function countUp(el, target, durationMs = 1200) {
  const start = performance.now();
  function tick(now) {
    const progress = Math.min((now - start) / durationMs, 1);
    const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = Math.round(eased * target);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function initCountUp() {
  const triggers = document.querySelectorAll('.cu');
  if (!triggers.length) return;

  // Find a container element to observe — fall back to first .cu element itself
  const container = document.querySelector('.hero-stats') || triggers[0].parentElement;

  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      triggers.forEach(el => countUp(el, parseInt(el.dataset.t, 10)));
      observer.disconnect();
    }
  }, { threshold: 0.3 });

  observer.observe(container);
}


/* ─────────────────────────────────────────────────────────────
   HERO MINI QUIZ  (index.html only)
   Quick role picker on the hero card that pre-selects the main
   quiz's step-1 option and scrolls to it.
   ───────────────────────────────────────────────────────────── */
let heroRole = null;

function heroQuizPick(el, role) {
  heroRole = role;
  el.closest('.hero-quiz-opts')
    .querySelectorAll('.hero-quiz-opt')
    .forEach(o => o.classList.remove('active'));
  el.classList.add('active');

  const ctaEl  = document.getElementById('heroQuizCTA');
  const linkEl = document.getElementById('heroQuizLink');
  if (ctaEl)  ctaEl.style.display = 'block';
  if (linkEl) linkEl.href = '#quiz';

  // Pre-load step 1 selection in the full quiz below
  qRole = role;
  // Visually select the matching button in the full quiz step 1
  document.querySelectorAll('#qs1 .quiz-opt').forEach(btn => {
    btn.classList.toggle('sel', btn.getAttribute('onclick')?.includes(`'${role}'`));
  });
  enable('qNext1');

  logEvent('hero_quiz_pick', { role });
}

window.heroQuizPick = heroQuizPick;


/* ─────────────────────────────────────────────────────────────
   MAIN QUIZ  (index.html only)
   Two-step role × need quiz that surfaces personalised resources.
   ───────────────────────────────────────────────────────────── */

/* ── Quiz data ─────────────────────────────────────────────── */
const QD = {
  student: {
    q: 'What do you need most right now?',
    opts: [
      { l: 'Help choosing a project topic',           k: 'topic'      },
      { l: 'Designing my experiment',                 k: 'experiment' },
      { l: 'Building my display board',               k: 'display'    },
      { l: 'Competition info: ISEF, state, local',   k: 'compete'    },
      { l: 'A mentor to guide me',                    k: 'mentor'     },
    ],
    results: {
      topic: {
        role: 'Student: Project Planning',
        title: "Let's find your project idea",
        links: [
          { t: 'Research Guide: Choosing a Topic',  d: 'Step-by-step topic selection framework',      h: '/researchguide.html'          },
          { t: 'Winning Project Examples',           d: 'What ISEF winners actually researched',       h: '/researchguide.html#examples' },
          { t: 'Get a Mentor Match',                 d: "We'll connect you with a STEM professional",  h: '#portal'                      },
        ],
        cta: [
          { t: 'Start Research Guide →', h: '/researchguide.html' },
          { t: 'Get Mentor →',           h: '#portal', o: true     },
        ]
      },
      experiment: {
        role: 'Student: Experimental Design',
        title: 'Build a solid experiment',
        links: [
          { t: 'Experimental Design Guide',    d: 'Hypothesis, variables, controls explained',   h: '/researchguide.html#design' },
          { t: 'Data Collection Templates',    d: 'Printable lab notebooks & data sheets',       h: '/researchguide.html#data'   },
        ],
        cta: [{ t: 'Open Research Guide →', h: '/researchguide.html' }]
      },
      display: {
        role: 'Student: Presentation',
        title: 'Create a winning display',
        links: [
          { t: 'Display Board Template', d: 'Downloadable layout with all required sections', h: '/researchguide.html#display'  },
          { t: 'Presentation Tips',      d: 'What judges actually look for',                  h: '/researchguide.html#present'  },
        ],
        cta: [{ t: 'Get Display Templates →', h: '/researchguide.html' }]
      },
      compete: {
        role: 'Student: Competitions',
        title: 'Navigate the competition path',
        links: [
          { t: 'Ohio Competition Pathway', d: 'School → District → State → ISEF',         h: '/stateresources.html'          },
          { t: 'Key Deadlines 2025–26',    d: 'Registration dates & requirements',         h: '/stateresources.html#ohio'     },
          { t: 'National Competition List',d: 'ISEF, Broadcom, and more',                  h: '/stateresources.html#national' },
        ],
        cta: [
          { t: 'Browse State Resources →', h: '/stateresources.html' },
          { t: 'Start Here →',             h: '/starthere.html', o: true },
        ]
      },
      mentor: {
        role: 'Student: Mentorship',
        title: 'Get matched with a mentor',
        links: [
          { t: 'Ambassador Matching',       d: 'Apply for a personal student ambassador',    h: '#portal'          },
          { t: 'STEM Professional Network', d: 'Scientists & engineers who can help',        h: '/volunteer.html'  },
        ],
        cta: [{ t: 'Apply for Mentorship →', h: '#portal' }]
      },
    }
  },

  teacher: {
    q: 'Where are you in the process?',
    opts: [
      { l: 'Starting a science fair from scratch', k: 'setup'      },
      { l: 'Improving an existing fair',           k: 'improve'    },
      { l: 'Recruiting judges',                    k: 'judges'     },
      { l: 'Finding funding & grants',             k: 'funding'    },
    ],
    results: {
      setup: {
        role: 'Teacher: Fair Setup',
        title: "Start your school's science fair",
        links: [
          { t: 'Complete Science Fair Setup Guide',   d: 'Month-by-month planning timeline',        h: '/setupguide.html'       },
          { t: 'Administrator Proposal Template',     d: 'Make the case to your principal',         h: '/#portal'               },
          { t: '12-Month Planning Checklist',         d: 'Printable step-by-step timeline',         h: '/#portal'               },
        ],
        cta: [
          { t: 'Full Setup Guide →',       h: '/setupguide.html' },
          { t: 'Access Teacher Portal →',  h: '/#portal', o: true },
        ]
      },
      improve: {
        role: 'Teacher: Fair Improvement',
        title: 'Level up your fair',
        links: [
          { t: 'Best Practices from Top Schools', d: 'What high-participation fairs do differently', h: '/setupguide.html'      },
          { t: 'Affiliate Registration Guide',      d: 'Connect to district & state competitions',    h: '/stateresources.html'  },
        ],
        cta: [{ t: 'Teacher Resources →', h: '/teachers-professionals.html' }]
      },
      judges: {
        role: 'Teacher: Judge Recruitment',
        title: 'Build your judge roster',
        links: [
          { t: 'Judge Recruitment Email Template', d: 'Tested cold email that gets responses',    h: '/#portal'                      },
          { t: 'Judge Training Materials',         d: 'OAS-approved orientation packet',         h: '/#portal'                      },
          { t: 'Where to Find Judges',             d: 'Universities, industry partners, alumni', h: '/setupguide.html#judges'       },
        ],
        cta: [
          { t: 'Get Judge Templates →',    h: '/#portal'           },
          { t: 'Post a Judge Request →',   h: '/volunteer.html', o: true },
        ]
      },
      funding: {
        role: 'Teacher: Funding',
        title: 'Find money for your fair',
        links: [
          { t: 'Ohio Science Fair Grant List',    d: 'Ohio-specific & national opportunities',          h: '/setupguide.html#funding' },
          { t: 'Sponsorship Outreach Letter',     d: 'Tested template for local businesses',            h: '/#portal'                 },
          { t: 'Budget Template',                 d: 'Full cost breakdown for a $500–$5K fair',         h: '/#portal'                 },
        ],
        cta: [{ t: 'Open Teacher Portal →', h: '/#portal' }]
      },
    }
  },

  admin: {
    q: "What's your biggest concern?",
    opts: [
      { l: 'Cost and budget requirements',               k: 'cost'   },
      { l: 'Time commitment from teachers',              k: 'time'   },
      { l: 'Academic impact and standards alignment',    k: 'impact' },
      { l: 'Where to start / pilot program options',     k: 'start'  },
    ],
    results: {
      cost: {
        role: 'Administrator: Budget',
        title: 'The numbers behind science fairs',
        links: [
          { t: 'Science Fair Cost Breakdown', d: 'Real numbers: $300–$5K by scale',       h: '/setupguide.html#cost'    },
          { t: 'Funding Sources Guide',       d: 'Grants, sponsors, PTA, in-kind',        h: '/setupguide.html#funding' },
        ],
        cta: [{ t: 'Full Setup Guide →', h: '/setupguide.html' }]
      },
      time: {
        role: 'Administrator: Planning',
        title: 'Realistic time investment',
        links: [
          { t: '12-Month Timeline',        d: 'Teacher hours by phase (avg 5 hrs/month)',      h: '/setupguide.html'            },
          { t: 'Committee Structure Guide',d: 'Distribute the load across multiple teachers',  h: '/setupguide.html#committee'  },
        ],
        cta: [{ t: 'Contact Us →', h: 'mailto:fairgameinitiative@outlook.com' }]
      },
      impact: {
        role: 'Administrator: Outcomes',
        title: 'Academic impact evidence',
        links: [
          { t: 'Research on Science Fair Benefits', d: 'College prep, critical thinking, STEM identity', h: '/setupguide.html'          },
          { t: 'Student Success Stories',           d: 'Outcomes from FairGame-supported schools',      h: '/successstories.html'      },
        ],
        cta: [{ t: 'Read Success Stories →', h: '/successstories.html' }]
      },
      start: {
        role: 'Administrator: Getting Started',
        title: 'Pilot program options',
        links: [
          { t: 'One-Grade Pilot Guide',    d: 'Start with 8th grade, expand from there',  h: '/setupguide.html'                          },
          { t: 'Schedule a Consultation', d: '30-min free call with our team', h: 'mailto:fairgameinitiative@outlook.com' },
        ],
        cta: [{ t: 'Schedule Consultation →', h: 'mailto:fairgameinitiative@outlook.com' }]
      },
    }
  },

  judge: {
    q: 'How would you like to contribute?',
    opts: [
      { l: 'Judge at a local or district fair',    k: 'judge'  },
      { l: 'Mentor a student long-term',           k: 'mentor' },
      { l: 'Guest speak or give facility tours',   k: 'speak'  },
    ],
    results: {
      judge: {
        role: 'STEM Professional: Judging',
        title: 'Sign up to judge',
        links: [
          { t: 'Judge Application Form', d: 'Register your expertise & availability', h: '/volunteer.html' },
          { t: 'What to Expect',         d: '3–5 hour commitment, rubric provided',   h: '/volunteer.html' },
        ],
        cta: [{ t: 'Sign Up to Judge →', h: '/volunteer.html' }]
      },
      mentor: {
        role: 'STEM Professional: Mentorship',
        title: 'Become a student mentor',
        links: [
          { t: 'Mentor Program Overview',   d: 'What the commitment looks like',         h: '/volunteer.html' },
          { t: 'Mentor Training Materials', d: 'How to guide without doing the work',    h: '/volunteer.html' },
        ],
        cta: [{ t: 'Apply to Mentor →', h: '/volunteer.html' }]
      },
      speak: {
        role: 'STEM Professional: Outreach',
        title: 'Share your expertise',
        links: [
          { t: 'Speaking Request Form', d: 'Tell us your topic and availability', h: 'mailto:fairgameinitiative@outlook.com' },
        ],
        cta: [{ t: 'Get in Touch →', h: 'mailto:fairgameinitiative@outlook.com' }]
      },
    }
  },

  company: {
    q: 'How would your organization like to engage?',
    opts: [
      { l: 'Sponsor a school or program',          k: 'sponsor'    },
      { l: 'Provide employee volunteers / judges', k: 'volunteers' },
      { l: 'Formal partnership / MOU',             k: 'partner'    },
    ],
    results: {
      sponsor: {
        role: 'Corporate: Sponsorship',
        title: 'Sponsor a school program',
        links: [
          { t: 'Sponsorship Tiers Overview', d: 'What your contribution funds',               h: 'mailto:fairgameinitiative@outlook.com' },
          { t: 'Adopt a School',             d: "Name-sponsor a specific school's fair",      h: 'mailto:fairgameinitiative@outlook.com' },
        ],
        cta: [{ t: 'Contact Us →', h: 'mailto:fairgameinitiative@outlook.com' }]
      },
      volunteers: {
        role: 'Corporate: Volunteers',
        title: 'Employee volunteer program',
        links: [
          { t: 'Corporate Judge Program', d: 'Counts toward employee volunteer hours', h: '/volunteer.html' },
          { t: 'Mentorship Program',      d: 'Employees mentor students 1-on-1',       h: '/volunteer.html' },
        ],
        cta: [{ t: 'Explore Volunteer Program →', h: '/volunteer.html' }]
      },
      partner: {
        role: 'Corporate: Partnership',
        title: 'Formal organizational partnership',
        links: [
          { t: 'Partnership Overview Deck', d: 'Full overview of FairGame and our impact', h: 'mailto:fairgameinitiative@outlook.com' },
        ],
        cta: [{ t: 'Reach Out →', h: 'mailto:fairgameinitiative@outlook.com' }]
      },
    }
  }
};

/* ── Quiz state ────────────────────────────────────────────── */
let qRole = null;
let qNeed = null;

function enable(id) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.removeAttribute('disabled');
  btn.style.opacity = '1';
}
function disable(id) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.setAttribute('disabled', '');
  btn.style.opacity = '0.4';
}

function qPick(el, val) {
  el.closest('.quiz-opts').querySelectorAll('.quiz-opt').forEach(o => o.classList.remove('sel'));
  el.classList.add('sel');
  if (el.closest('#qs1')) { qRole = val; enable('qNext1'); }
  else                    { qNeed = val; enable('qNext2'); }
}

function qStep2() {
  if (!qRole) return;
  const d = QD[qRole];
  const q2el = document.getElementById('qs2Q');
  const optsEl = document.getElementById('qs2Opts');
  if (!q2el || !optsEl) return;

  q2el.textContent = d.q;
  optsEl.innerHTML = d.opts.map(o =>
    `<button class="quiz-opt" onclick="qPick(this,'${o.k}')">${o.l}</button>`
  ).join('');

  qNeed = null;
  disable('qNext2');
  document.getElementById('qs1').classList.remove('active');
  document.getElementById('qs2').classList.add('active');
  document.getElementById('qProgress').style.width = '50%';
  logEvent('quiz_step2', { role: qRole });
}

function qBack() {
  document.getElementById('qs2').classList.remove('active');
  document.getElementById('qs1').classList.add('active');
  document.getElementById('qProgress').style.width = '0%';
}

function qResult() {
  if (!qRole || !qNeed) return;
  const res = QD[qRole].results[qNeed];
  if (!res) return;

  document.getElementById('rRole').textContent  = res.role;
  document.getElementById('rTitle').textContent = res.title;

  document.getElementById('rLinks').innerHTML = res.links.map(l =>
    `<a href="${l.h}" class="result-link" onclick="trackDL('${l.t}','${qRole}')">
      <div><strong>${l.t}</strong><span>${l.d}</span></div>
      <span class="result-link-arrow">&rarr;</span>
    </a>`
  ).join('');

  document.getElementById('rCTA').innerHTML = res.cta.map(c =>
    `<a href="${c.h}" class="btn ${c.o ? 'btn-outline' : 'btn-primary'}">${c.t}</a>`
  ).join('');

  document.getElementById('qs2').classList.remove('active');
  document.getElementById('qResult').classList.add('active');
  document.getElementById('qProgress').style.width = '100%';
  logEvent('quiz_complete', { role: qRole, need: qNeed });
}

function qReset() {
  qRole = null;
  qNeed = null;
  document.getElementById('qResult').classList.remove('active');
  document.getElementById('qs1').classList.add('active');
  document.getElementById('qProgress').style.width = '0%';
  document.querySelectorAll('.quiz-opt').forEach(o => o.classList.remove('sel'));
  disable('qNext1');
}

// Expose quiz functions globally for inline onclick attributes
Object.assign(window, { qPick, qStep2, qBack, qResult, qReset, enable, disable });

function initQuiz() {
  if (!document.getElementById('qs1')) return;
  disable('qNext1');
  disable('qNext2');
}


/* ─────────────────────────────────────────────────────────────
   EMAIL SUBSCRIBE  (quiz result panel)
   ───────────────────────────────────────────────────────────── */
async function doSubscribe() {
  const emailEl = document.getElementById('subEmail');
  const msgEl   = document.getElementById('subMsg');
  if (!emailEl || !msgEl) return;

  const email = emailEl.value.trim();
  if (!email || !email.includes('@')) {
    msgEl.textContent = 'Please enter a valid email address.';
    msgEl.className   = 'msg-err';
    return;
  }

  msgEl.textContent = 'Subscribing...';
  msgEl.className   = '';

  if (sb) {
    const { error } = await sb.from('email_subscribers').insert([{
      email,
      role:   qRole,
      source: 'quiz'
    }]);
    // code 23505 = duplicate — still treat as success
    if (error && error.code !== '23505') {
      msgEl.textContent = 'Something went wrong. Please try again.';
      msgEl.className   = 'msg-err';
      return;
    }
  }

  msgEl.textContent = 'Subscribed! Check your inbox for a welcome message.';
  msgEl.className   = 'msg-ok';
  emailEl.value     = '';
  logEvent('email_subscribe', { role: qRole, source: 'quiz' });
}

window.doSubscribe = doSubscribe;


/* ─────────────────────────────────────────────────────────────
   PORTAL FORMS  (index.html — teacher & ambassador sign-up)
   ───────────────────────────────────────────────────────────── */
async function regTeacher() {
  const name   = (document.getElementById('tName')   || {}).value?.trim();
  const email  = (document.getElementById('tEmail')  || {}).value?.trim();
  const school = (document.getElementById('tSchool') || {}).value?.trim();
  const msgEl  = document.getElementById('tMsg');
  if (!msgEl) return;

  if (!name || !email || !school) {
    msgEl.textContent = 'Please fill out all fields.';
    msgEl.className   = 'portal-msg msg-err';
    return;
  }

  msgEl.textContent = 'Submitting...';
  msgEl.className   = 'portal-msg';

  if (sb) {
    const { error } = await sb.from('portal_requests').insert([{
      name, email, school, type: 'teacher'
    }]);
    if (error) {
      msgEl.textContent = 'Error — please email fairgameinitiative@outlook.com';
      msgEl.className   = 'portal-msg msg-err';
      return;
    }
  }

  msgEl.textContent = "Request received! We'll send your access link within 24 hours.";
  msgEl.className   = 'portal-msg msg-ok';
  logEvent('portal_request', { type: 'teacher' });
}

async function regAmbassador() {
  const name   = (document.getElementById('aName')   || {}).value?.trim();
  const email  = (document.getElementById('aEmail')  || {}).value?.trim();
  const school = (document.getElementById('aSchool') || {}).value?.trim();
  const msgEl  = document.getElementById('aMsg');
  if (!msgEl) return;

  if (!name || !email || !school) {
    msgEl.textContent = 'Please fill out all fields.';
    msgEl.className   = 'portal-msg msg-err';
    return;
  }

  msgEl.textContent = 'Submitting...';
  msgEl.className   = 'portal-msg';

  if (sb) {
    const { error } = await sb.from('portal_requests').insert([{
      name, email, school, type: 'ambassador'
    }]);
    if (error) {
      msgEl.textContent = 'Error — please email fairgameinitiative@outlook.com';
      msgEl.className   = 'portal-msg msg-err';
      return;
    }
  }

  msgEl.textContent = "Application received! We'll be in touch within 48 hours.";
  msgEl.className   = 'portal-msg msg-ok';
  logEvent('portal_request', { type: 'ambassador' });
}

async function magicLink(e) {
  e.preventDefault();
  const email = prompt('Enter your registered email address:');
  if (!email) return;
  if (sb) {
    const { error } = await sb.auth.signInWithOtp({ email });
    alert(error
      ? 'Error: ' + error.message
      : 'Magic link sent to ' + email + '! Check your inbox.'
    );
  } else {
    alert('Portal coming soon! Email fairgameinitiative@outlook.com for early access.');
  }
}

Object.assign(window, { regTeacher, regAmbassador, magicLink });


/* ─────────────────────────────────────────────────────────────
   VOLUNTEER PAGE — judge & mentor application forms
   ───────────────────────────────────────────────────────────── */
function getExpertise() {
  const map = {
    je1: 'Biology / Life Sciences',
    je2: 'Chemistry / Biochemistry',
    je3: 'Physics / Engineering',
    je4: 'Environmental Science',
    je5: 'Computer Science / Math',
    je6: 'Medicine / Health Sciences',
  };
  return Object.entries(map)
    .filter(([id]) => document.getElementById(id)?.checked)
    .map(([, label]) => label);
}

async function submitJudge() {
  const name      = document.getElementById('jName')?.value.trim();
  const email     = document.getElementById('jEmail')?.value.trim();
  const org       = document.getElementById('jOrg')?.value.trim();
  const level     = document.getElementById('jLevel')?.value;
  const notes     = document.getElementById('jNotes')?.value.trim();
  const expertise = getExpertise();
  const msgEl     = document.getElementById('judgeMsg');
  if (!msgEl) return;

  if (!name || !email) {
    msgEl.textContent = 'Please fill out all required fields.';
    msgEl.className   = 'msg-err';
    return;
  }

  msgEl.textContent = 'Submitting…';
  msgEl.className   = '';

  // Generate judge code using same logic as portal-shared.js generateJudgeCode
  const P = { Biology:'BI', Chemistry:'CH', Physics:'PH', Environmental:'EN', Computer:'CS', Medicine:'ME' };
  const first  = expertise[0] || '';
  const prefix = Object.entries(P).find(([k]) => first.includes(k))?.[1] || 'GN';
  const fips   = String(Math.floor(Math.random() * 90) + 10);
  const rnd    = Math.random().toString(36).slice(2, 4).toUpperCase();
  const code   = `${prefix}-${fips}-${rnd}`;

  if (sb) {
    // 1. Store judge record in judges table
    const { error: judgeErr } = await sb.from('judges').insert([{
      code,
      name,
      email,
      expertise,
      city:            org || '',
      available_level: level || 'Any level',
      notes:           notes || '',
      status:          'unverified',
      created_at:      new Date().toISOString()
    }]);

    if (judgeErr) {
      console.warn('[submitJudge] judges insert:', judgeErr.message);
      // Non-fatal — continue to send the magic link
    }

    // 2. Send a magic link that creates (or signs in) their judge account
    const { error: otpErr } = await sb.auth.signInWithOtp({
      email,
      options: {
        data: { name, role: 'judge' },
        emailRedirectTo: window.location.origin + '/portal-judge.html'
      }
    });

    if (otpErr) {
      msgEl.textContent = 'Application saved but email error: ' + otpErr.message + '. Contact fairgameinitiative@outlook.com';
      msgEl.className   = 'msg-err';
      logEvent('judge_application', { level, expertise, error: otpErr.message });
      return;
    }
  }

  // Clear form
  ['jName','jEmail','jOrg','jNotes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['je1','je2','je3','je4','je5','je6'].forEach(id => { const el = document.getElementById(id); if (el) el.checked = false; });
  const lvl = document.getElementById('jLevel'); if (lvl) lvl.value = '';

  msgEl.textContent = "Application received! Check your email for a sign-in link to access your judge portal. Your judge code is: " + code;
  msgEl.className   = 'msg-ok';
  logEvent('judge_application', { level, expertise, code });
}

async function submitMentor() {
  const name   = document.getElementById('mName')?.value.trim();
  const email  = document.getElementById('mEmail')?.value.trim();
  const role   = document.getElementById('mRole')?.value.trim();
  const field  = document.getElementById('mField')?.value.trim();
  const hours  = document.getElementById('mHours')?.value;
  const format = document.getElementById('mFormat')?.value;
  const bio    = document.getElementById('mBio')?.value.trim();
  const msgEl  = document.getElementById('mentorMsg');
  if (!msgEl) return;

  if (!name || !email || !field) {
    msgEl.textContent = 'Please fill out all required fields.';
    msgEl.className   = 'msg-err';
    return;
  }

  msgEl.textContent = 'Submitting...';
  msgEl.className   = '';

  if (sb) {
    const { error } = await sb.from('portal_requests').insert([{
      name, email,
      school: role,
      type:   'mentor',
      data:   { field, hours, format, bio }
    }]);
    if (error) {
      msgEl.textContent = 'Error — please email fairgameinitiative@outlook.com';
      msgEl.className   = 'msg-err';
      return;
    }
  }

  msgEl.textContent = "Application received! We'll match you with a student within a week.";
  msgEl.className   = 'msg-ok';
  logEvent('mentor_application', { field, hours });
}

Object.assign(window, { getExpertise, submitJudge, submitMentor });


/* ─────────────────────────────────────────────────────────────
   DONATE PAGE — amount selector & frequency toggle
   ───────────────────────────────────────────────────────────── */
function initDonate() {
  const customInput = document.getElementById('customAmt');
  const btnAmtEl    = document.getElementById('btnAmt');
  if (!customInput) return;

  customInput.addEventListener('input', () => {
    if (btnAmtEl) btnAmtEl.textContent = customInput.value || '0';
  });
}

function setAmt(btn, val) {
  document.querySelectorAll('.amt-btn').forEach(b => {
    if (['$25','$50','$100','$250','$500','Other'].includes(b.textContent.trim())) {
      b.classList.remove('active');
    }
  });
  btn.classList.add('active');
  const customInput = document.getElementById('customAmt');
  const btnAmtEl    = document.getElementById('btnAmt');
  if (val !== 'other' && customInput) {
    customInput.value = val;
    if (btnAmtEl) btnAmtEl.textContent = val;
  }
}

function setFreq(freq, btn) {
  document.querySelectorAll('#freqOnce, #freqMonthly').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function goToDonate() {
  const amt = document.getElementById('customAmt')?.value || '50';
  // TODO: replace with live Stripe/PayPal link when configured
  alert(
    `Donation processing coming soon!\n\n` +
    `Intended amount: $${amt}\n\n` +
    `For now, please email fairgameinitiative@outlook.com or use our ` +
    `PayPal link (to be added here).`
  );
}

Object.assign(window, { setAmt, setFreq, goToDonate });


/* ─────────────────────────────────────────────────────────────
   SETUP GUIDE PAGE — FAQ accordion & active TOC highlight
   ───────────────────────────────────────────────────────────── */
function initFAQ() {
  document.querySelectorAll('.faq-q').forEach(q => {
    q.addEventListener('click', () => {
      const item = q.closest('.faq-item');
      // Optionally close other open items
      // document.querySelectorAll('.faq-item.open').forEach(i => { if (i !== item) i.classList.remove('open'); });
      item.classList.toggle('open');
    });
  });
}

function initTOC() {
  const sections = document.querySelectorAll('[id]');
  const links    = document.querySelectorAll('.toc-list a');
  if (!links.length) return;

  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(section => {
      if (window.scrollY >= section.offsetTop - 130) current = section.id;
    });
    links.forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === '#' + current);
    });
  }, { passive: true });
}


/* ─────────────────────────────────────────────────────────────
   TEACHERS PAGE — tab switcher
   ───────────────────────────────────────────────────────────── */
function showTab(id, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('tab-' + id);
  if (panel) panel.classList.add('active');
  btn.classList.add('active');
}

window.showTab = showTab;


/* ─────────────────────────────────────────────────────────────
   SMOOTH ANCHOR SCROLLING
   Overrides default jump-to-anchor behaviour site-wide, accounts
   for the fixed nav height.
   ───────────────────────────────────────────────────────────── */
function initSmoothScroll() {
  const NAV_H = 68;
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const hash   = link.getAttribute('href');
      if (hash === '#') return;
      const target = document.querySelector(hash);
      if (!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - NAV_H - 16;
      window.scrollTo({ top, behavior: 'smooth' });
      // Update URL without jumping
      history.pushState(null, '', hash);
    });
  });
}


/* ─────────────────────────────────────────────────────────────
   PORTAL DOWNLOAD BUTTONS
   Buttons with class .dl-btn.locked redirect to the portal section
   rather than doing nothing.
   ───────────────────────────────────────────────────────────── */
function initLockedDownloads() {
  document.querySelectorAll('.dl-btn.locked, .dl-card-btn.locked').forEach(btn => {
    btn.addEventListener('click', () => {
      const portalEl = document.getElementById('portal');
      const portalPage = '/#portal';
      if (portalEl) {
        // On pages that have the portal section inline
        const top = portalEl.getBoundingClientRect().top + window.scrollY - 84;
        window.scrollTo({ top, behavior: 'smooth' });
      } else {
        // On inner pages, go to homepage portal
        window.location.href = portalPage;
      }
    });
  });
}


/* ─────────────────────────────────────────────────────────────
   PAGE-SPECIFIC BOOT
   Each init function checks for the relevant DOM elements before
   doing anything, so this file is safe to load on every page.
   ───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  updateNavAuthState();
  initScrollReveal();
  initCountUp();
  initQuiz();
  initFAQ();
  initTOC();
  initDonate();
  initSmoothScroll();
  initLockedDownloads();

  // Log page view
  logEvent('page_view', { page: window.location.pathname });
});


/* ─────────────────────────────────────────────────────────────
   FAIR REGISTRATION  (fairregister.html)
   Teachers register their fair — writes to 'fairs' table
   ───────────────────────────────────────────────────────────── */
async function submitFair() {
  const school   = document.getElementById('fSchool')?.value.trim();
  const teacher  = document.getElementById('fTeacher')?.value.trim();
  const email    = document.getElementById('fEmail')?.value.trim();
  const city     = document.getElementById('fCity')?.value.trim();
  const county   = document.getElementById('fCounty')?.value.trim();
  const date     = document.getElementById('fDate')?.value;
  const students = parseInt(document.getElementById('fStudents')?.value || '0');
  const program  = document.getElementById('fProgram')?.value;
  const msgEl    = document.getElementById('fairMsg');
  if (!msgEl) return;

  if (!school || !teacher || !email) {
    msgEl.textContent = 'School name, teacher name, and email are required.';
    msgEl.style.color = '#c0392b'; return;
  }
  msgEl.textContent = 'Registering your fair...'; msgEl.style.color = 'var(--gray-500)';

  if (sb) {
    const { data: fair, error } = await sb.from('fairs').insert([{
      school_name: school, teacher_name: teacher, teacher_email: email,
      city, county, fair_date: date, student_count: students,
      program_type: program, status: 'planning'
    }]).select().single();

    if (error) { msgEl.textContent = 'Error — please try again or email us.'; msgEl.style.color = '#c0392b'; return; }

    // Auto-match: find judges in same county
    if (fair && county) {
      const { data: nearbyJudges } = await sb.from('judges')
        .select('*')
        .eq('status', 'active')
        .ilike('city', `%${county}%`);

      if (nearbyJudges?.length) {
        msgEl.textContent = `Fair registered! Found ${nearbyJudges.length} potential judge${nearbyJudges.length > 1 ? 's' : ''} in your area. Check the judge map to send requests.`;
        msgEl.style.color = 'var(--green-600)';
      } else {
        msgEl.textContent = 'Fair registered! Visit the judge map to browse and request judges in your district.';
        msgEl.style.color = 'var(--green-600)';
      }
    } else {
      msgEl.textContent = 'Fair registered successfully!';
      msgEl.style.color = 'var(--green-600)';
    }
  } else {
    msgEl.textContent = 'Fair registered! (Supabase not connected — add credentials to script.js)';
    msgEl.style.color = 'var(--green-600)';
  }

  logEvent('fair_registered', { school, program, county });
}

window.submitFair = submitFair;


/* ─────────────────────────────────────────────────────────────
   JUDGE ACCEPT / DECLINE  (linked from email)
   When a judge receives a match request email, they click a
   link that goes to ?request=<id>&action=accept|decline
   ───────────────────────────────────────────────────────────── */
async function handleJudgeResponse() {
  const params  = new URLSearchParams(window.location.search);
  const reqId   = params.get('request');
  const action  = params.get('action');
  const banner  = document.getElementById('judgeResponseBanner');
  if (!reqId || !action || !banner) return;

  banner.style.display = 'block';

  if (!sb) {
    banner.textContent = action === 'accept'
      ? 'Thank you for accepting! The teacher will be in touch shortly.'
      : 'Response recorded. Thank you for letting us know.';
    return;
  }

  const status = action === 'accept' ? 'accepted' : 'declined';
  const { error } = await sb.from('judge_requests')
    .update({ status, responded_at: new Date().toISOString() })
    .eq('id', reqId);

  if (error) { banner.textContent = 'Error updating response. Please email fairgameinitiative@outlook.com'; return; }

  banner.textContent = action === 'accept'
    ? 'You\'re confirmed as a judge! The teacher will contact you with details.'
    : 'No problem — your response has been recorded. Thank you for considering it.';
  banner.style.background = action === 'accept' ? 'var(--green-50)' : 'var(--gray-50)';
  banner.style.borderColor = action === 'accept' ? 'var(--green-500)' : 'var(--gray-300)';
}

window.handleJudgeResponse = handleJudgeResponse;


/* ─────────────────────────────────────────────────────────────
   CONTACT / INTEREST FORMS  (index.html contact section)
   ───────────────────────────────────────────────────────────── */
function switchContactTab(btn, type) {
  document.querySelectorAll('.contact-tab').forEach(b => {
    b.style.color = 'var(--gray-500)';
    b.style.borderBottomColor = 'transparent';
    b.classList.remove('active');
  });
  btn.style.color = 'var(--green-700)';
  btn.style.borderBottomColor = 'var(--green-600)';
  btn.classList.add('active');
  document.getElementById('contactSchool').style.display  = type === 'school'  ? 'block' : 'none';
  document.getElementById('contactStudent').style.display = type === 'student' ? 'block' : 'none';
}
window.switchContactTab = switchContactTab;

async function submitContactForm(type) {
  const msgEl = document.getElementById('contactFormMsg');
  let name, email, school, message;
  if (type === 'school') {
    name    = document.getElementById('csName')?.value.trim();
    email   = document.getElementById('csEmail')?.value.trim();
    school  = document.getElementById('csSchool')?.value.trim();
    message = document.getElementById('csMsg')?.value.trim();
  } else {
    name    = document.getElementById('ctName')?.value.trim();
    email   = document.getElementById('ctEmail')?.value.trim();
    school  = document.getElementById('ctSchool')?.value.trim();
    message = document.getElementById('ctMsg')?.value.trim();
  }
  if (!name || !email) { msgEl.textContent = 'Name and email are required.'; msgEl.style.color = '#c0392b'; return; }
  msgEl.textContent = 'Sending...'; msgEl.style.color = 'var(--gray-500)';

  if (sb) {
    const { error } = await sb.from('portal_requests').insert([{
      name, email, school: school || '', type: type === 'school' ? 'teacher' : 'student',
      status: 'interest', data: { message, source: 'contact_form' }
    }]);
    if (error) { msgEl.textContent = 'Something went wrong — email us at fairgameinitiative@outlook.com'; msgEl.style.color = '#c0392b'; return; }
  }

  // Send email notification via EmailJS
  // To activate: sign up at emailjs.com, create a service + template, paste IDs below.
  // Template variables available: {{from_name}}, {{from_email}}, {{school}}, {{contact_type}}, {{message}}
  const EMAILJS_SERVICE  = 'YOUR_SERVICE_ID';   // e.g. 'service_abc123'
  const EMAILJS_TEMPLATE = 'YOUR_TEMPLATE_ID';  // e.g. 'template_xyz456'
  const EMAILJS_KEY      = 'YOUR_PUBLIC_KEY';   // found under Account > API Keys
  if (EMAILJS_SERVICE !== 'YOUR_SERVICE_ID' && typeof emailjs !== 'undefined') {
    emailjs.send(EMAILJS_SERVICE, EMAILJS_TEMPLATE, {
      from_name:    name,
      from_email:   email,
      school:       school || '(not provided)',
      contact_type: type === 'school' ? 'School / Teacher' : 'Student',
      message:      message || '(no message)'
    }, EMAILJS_KEY).catch(() => {}); // fire-and-forget; don't block on email failure
  }

  msgEl.textContent = "Got it! We'll be in touch within 48 hours.";
  msgEl.style.color = 'var(--green-600)';
  logEvent('contact_form', { type, school });
}
window.submitContactForm = submitContactForm;

/* === index.html === */
(function() {
  const SB_URL = 'https://buzcxrbjutexiofetgvn.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1emN4cmJqdXRleGlvZmV0Z3ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3Nzc1NTEsImV4cCI6MjA4OTM1MzU1MX0.ifMup4fCcfHaf7Q4TYfi1X1V-J8tQpu2JwaqvjBcsBQ';
  const ROUTES = {
    teacher: '/portal-teacher.html',
    ambassador: '/portal-ambassador.html',
    student: '/portal-student.html',
    judge: '/portal-judge.html',
    admin: '/portal-admin.html'
  };
  try {
    const sb = window.supabase
      ? window.supabase.createClient(SB_URL, SB_KEY)
      : null;
    if (sb) {
      sb.auth.getSession().then(({ data: { session } }) => {
        const btn = document.getElementById('navUserBtn');
        if (session?.user && btn) {
          const role = session.user.user_metadata?.role || 'ambassador';
          btn.href = ROUTES[role] || '/portal-ambassador.html';
          btn.title = 'Go to my portal';
          btn.classList.add('logged-in');
        }
      });
    }
  } catch(e) {}
})();
