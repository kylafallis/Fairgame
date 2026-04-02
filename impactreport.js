/* ── IMPACT REPORT LOGIC ─────────────────────────────────── */

// Chart.js global defaults
Chart.defaults.font.family = "'DM Sans', system-ui, sans-serif";
Chart.defaults.font.size   = 12;
Chart.defaults.color       = '#6b756b';
const GREEN = '#357a38', LIGHT_GREEN = '#6ab86e', GRAY = '#c8cec8';

/* Demo / fallback data when Supabase isn't connected */
const DEMO = {
  schools: [
    { name:'Bath High School', city:'Lima', status:'active', students_est:40, program:'Full Fair' },
    { name:'Lima Senior High School', city:'Lima', status:'active', students_est:55, program:'Full Fair' },
    { name:'Linden-McKinley STEM', city:'Columbus', status:'active', students_est:60, program:'Club Launch' },
    { name:'Reynoldsburg HS', city:'Reynoldsburg', status:'pending', students_est:0, program:'Outreach' },
    { name:'Ashtabula HS', city:'Ashtabula', status:'pending', students_est:0, program:'Early Stage' },
    { name:'Whitehall-Yearling HS', city:'Whitehall', status:'active', students_est:45, program:'Club Launch' },
  ],
  monthly_events: [
    { month:'Sep', views:180, quiz:12 }, { month:'Oct', views:240, quiz:18 },
    { month:'Nov', views:310, quiz:25 }, { month:'Dec', views:220, quiz:14 },
    { month:'Jan', views:420, quiz:38 }, { month:'Feb', views:510, quiz:47 },
    { month:'Mar', views:380, quiz:34 },
  ],
  downloads: [
    { resource:'Setup Guide',          count:124 },
    { resource:'State Resources',       count:89  },
    { resource:'Research Guide',        count:76  },
    { resource:'Teacher Resources',     count:58  },
    { resource:'Judging Score Cards',   count:47  },
    { resource:'Judge Request Email',   count:31  },
  ],
  roles: { student:44, teacher:31, admin:12, judge:9, company:4 },
  portal: { teacher:28, ambassador:19, judge:14, mentor:11 },
  mentorships: { active:6, completed:2, total_hours:58, avg_milestones:3.2 },
  judge_requests: { sent:23, accepted:18, pending:5 },
  subscribers: 94,
};

function setKPI(id, val, delta) {
  const el = document.getElementById(id);
  if (el) el.textContent = typeof val === 'number' ? val.toLocaleString() : val;
  if (delta) {
    const dEl = document.getElementById(id + 'Delta');
    if (dEl) { dEl.textContent = delta; dEl.style.color = delta.startsWith('+') ? 'var(--green-600)' : 'var(--gray-400)'; }
  }
}

async function buildReport() {
  // Try Supabase, fall back to demo
  let data = DEMO;

  if (sb) {
    try {
      const [
        { count: schools },
        { count: downloads },
        { count: judges },
        { count: mentors },
        { count: portal },
        { count: subscribers },
        { data: mentorHoursData },
      ] = await Promise.all([
        sb.from('stats').select('value').eq('key','schools_supported').single().then(r => ({ count: r.data?.value || 12 })),
        sb.from('resource_downloads').select('id', { count:'exact', head:true }),
        sb.from('judges').select('id', { count:'exact', head:true }).eq('status','active'),
        sb.from('mentorships').select('id', { count:'exact', head:true }).eq('status','active'),
        sb.from('portal_requests').select('id', { count:'exact', head:true }),
        sb.from('email_subscribers').select('id', { count:'exact', head:true }),
        sb.from('mentorships').select('total_hours'),
      ]);
      const totalMentorHours = (mentorHoursData || []).reduce((s, r) => s + (r.total_hours || 0), 0);
      setKPI('kpiSchools',     schools);
      setKPI('kpiStudents',    schools * 47);
      setKPI('kpiDownloads',   downloads || 0);
      setKPI('kpiJudges',      judges || 0);
      setKPI('kpiMentors',     mentors || 0);
      setKPI('kpiMentorHours', Math.round(totalMentorHours));
      setKPI('kpiPortal',      portal || 0);
      setKPI('kpiSubscribers', subscribers || 0);
    } catch (e) { useDemoKPIs(data); }
  } else { useDemoKPIs(data); }

  buildCharts(data);
  buildSchoolTable(data.schools);
  buildDownloadBars(data.downloads);
  buildMentorshipSummary(data.mentorships);
  buildJudgeActivity(data.judge_requests);
  buildGoalsTable();
}

function useDemoKPIs(d) {
  setKPI('kpiSchools',     d.schools.filter(s => s.status==='active').length, '+6 this year');
  setKPI('kpiStudents',    d.schools.reduce((s,x) => s + (x.students_est||0), 0) + '+', 'est.');
  setKPI('kpiDownloads',   d.downloads.reduce((s,x) => s + x.count, 0));
  setKPI('kpiJudges',      28);
  setKPI('kpiMentors',     d.mentorships.active, 'active pairs');
  setKPI('kpiMentorHours', d.mentorships.total_hours);
  setKPI('kpiPortal',      d.portal.teacher + d.portal.ambassador + d.portal.judge + d.portal.mentor);
  setKPI('kpiSubscribers', d.subscribers);
}

function buildCharts(d) {
  // Monthly activity
  const actCtx = document.getElementById('activityChart')?.getContext('2d');
  if (actCtx) new Chart(actCtx, { type:'bar', data:{
    labels: d.monthly_events.map(m => m.month),
    datasets:[
      { label:'Page Views', data: d.monthly_events.map(m => m.views), backgroundColor: GREEN + '55', borderColor: GREEN, borderWidth: 1.5 },
      { label:'Quiz Completions', data: d.monthly_events.map(m => m.quiz), backgroundColor: LIGHT_GREEN + '99', borderColor: LIGHT_GREEN, borderWidth: 1.5 },
    ]}, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, padding:12 } } }, scales:{ x:{ grid:{ display:false } }, y:{ beginAtZero:true, grid:{ color:'rgba(0,0,0,0.04)' } } } }});

  // Roles donut
  const rolesCtx = document.getElementById('rolesChart')?.getContext('2d');
  if (rolesCtx) new Chart(rolesCtx, { type:'doughnut', data:{
    labels: Object.keys(d.roles).map(r => r.charAt(0).toUpperCase() + r.slice(1)),
    datasets:[{ data: Object.values(d.roles), backgroundColor:['#357a38','#4a9e4e','#6ab86e','#9dca8a','#c0dd97'], borderWidth:0 }]
  }, options:{ responsive:true, maintainAspectRatio:false, cutout:'60%', plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, padding:10 } } } }});

  // Portal signups donut
  const portalCtx = document.getElementById('portalChart')?.getContext('2d');
  if (portalCtx) new Chart(portalCtx, { type:'doughnut', data:{
    labels: ['Teachers','Students','Judges','Mentors'],
    datasets:[{ data: Object.values(d.portal), backgroundColor:['#357a38','#6ab86e','#1c3a1c','#9dca8a'], borderWidth:0 }]
  }, options:{ responsive:true, maintainAspectRatio:false, cutout:'60%', plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, padding:10 } } } }});
}

function buildDownloadBars(downloads) {
  const container = document.getElementById('downloadBars');
  if (!container) return;
  const max = Math.max(...downloads.map(d => d.count));
  container.innerHTML = downloads.map(d => `
    <div class="bar-row">
      <div class="bar-label">${d.resource}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(d.count/max*100)}%"></div></div>
      <div class="bar-val">${d.count}</div>
    </div>`).join('');
}

function buildSchoolTable(schools) {
  const container = document.getElementById('schoolTable');
  if (!container) return;
  container.innerHTML = `<table class="table-simple">
    <thead><tr><th>School</th><th>City</th><th>Program</th><th>Students</th><th>Status</th></tr></thead>
    <tbody>${schools.map(s => `
      <tr>
        <td style="font-weight:500;color:var(--green-900);">${s.name}</td>
        <td>${s.city}</td>
        <td style="font-size:0.78rem;">${s.program}</td>
        <td>${s.students_est || '—'}</td>
        <td><span class="status-pill ${s.status}">${s.status}</span></td>
      </tr>`).join('')}
    </tbody></table>`;
}

function buildMentorshipSummary(m) {
  const el = document.getElementById('mentorshipSummary');
  if (!el) return;
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
      <div style="border:var(--border);padding:14px;text-align:center;">
        <div style="font-family:var(--ff-serif);font-size:1.8rem;font-weight:700;color:var(--green-700);">${m.active}</div>
        <div style="font-size:0.72rem;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.08em;">Active Pairs</div>
      </div>
      <div style="border:var(--border);padding:14px;text-align:center;">
        <div style="font-family:var(--ff-serif);font-size:1.8rem;font-weight:700;color:var(--green-700);">${m.total_hours}h</div>
        <div style="font-size:0.72rem;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.08em;">Total Hours</div>
      </div>
    </div>
    <div style="font-size:0.84rem;color:var(--gray-700);margin-bottom:8px;">Avg. milestones completed per pair: <strong style="color:var(--green-700);">${m.avg_milestones} / 6</strong></div>
    <div style="font-size:0.84rem;color:var(--gray-700);">Completed pairs: <strong style="color:var(--green-700);">${m.completed}</strong></div>
    <a href="/mentorlog.html" class="btn btn-outline" style="margin-top:16px;font-size:0.78rem;padding:8px 16px;">View Full Mentor Log →</a>`;
}

function buildJudgeActivity(j) {
  const el = document.getElementById('judgeActivity');
  if (!el) return;
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
      <div style="border:var(--border);padding:12px;text-align:center;">
        <div style="font-family:var(--ff-serif);font-size:1.6rem;font-weight:700;color:var(--green-700);">${j.sent}</div>
        <div style="font-size:0.68rem;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.08em;">Requests Sent</div>
      </div>
      <div style="border:var(--border);padding:12px;text-align:center;">
        <div style="font-family:var(--ff-serif);font-size:1.6rem;font-weight:700;color:var(--green-700);">${j.accepted}</div>
        <div style="font-size:0.68rem;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.08em;">Accepted</div>
      </div>
      <div style="border:var(--border);padding:12px;text-align:center;">
        <div style="font-family:var(--ff-serif);font-size:1.6rem;font-weight:700;color:var(--green-700);">${Math.round(j.accepted/j.sent*100)}%</div>
        <div style="font-size:0.68rem;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.08em;">Response Rate</div>
      </div>
    </div>
    <a href="/judgemap.html" class="btn btn-outline" style="font-size:0.78rem;padding:8px 16px;">View Judge Map →</a>`;
}

function buildGoalsTable() {
  const el = document.getElementById('goalsTable');
  if (!el) return;
  const goals = [
    { metric:'Schools supported',    current:'12',    target:'25',   progress:48  },
    { metric:'Judges registered',    current:'28',    target:'100',  progress:28  },
    { metric:'Mentor pairs',         current:'8',     target:'25',   progress:32  },
    { metric:'Resources downloaded', current:'425',   target:'2,000',progress:21  },
    { metric:'Portal members',       current:'72',    target:'300',  progress:24  },
    { metric:'Email subscribers',    current:'94',    target:'500',  progress:19  },
    { metric:'States covered',       current:'1',     target:'5',    progress:20  },
    { metric:'Funding raised',       current:'$0',    target:'$100K',progress:0   },
  ];
  el.innerHTML = `<table class="table-simple">
    <thead><tr><th>Goal</th><th>Now</th><th>Target</th><th>Progress</th></tr></thead>
    <tbody>${goals.map(g => `
      <tr>
        <td style="font-size:0.82rem;">${g.metric}</td>
        <td style="font-weight:500;color:var(--green-700);">${g.current}</td>
        <td style="color:var(--gray-500);">${g.target}</td>
        <td><div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;height:6px;background:var(--gray-100);">
            <div style="height:100%;width:${g.progress}%;background:var(--green-600);"></div>
          </div>
          <span style="font-size:0.72rem;color:var(--gray-500);min-width:28px;">${g.progress}%</span>
        </div></td>
      </tr>`).join('')}
    </tbody></table>`;
}

document.addEventListener('DOMContentLoaded', buildReport);
