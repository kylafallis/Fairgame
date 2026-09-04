/* ================================================================
   FairGame - portal-mentor.js

   The mentor side of the supervised channel. Deliberately narrow: a
   mentor can see the students they were matched with, message them on
   the record, log their hours, and sign the conduct policy. There is
   no student directory and no search - a mentor can only ever reach
   the one student an admin matched them to.
   ================================================================ */

'use strict';

let mentorPairs = [];
let policySignedAt = null;

const POLICY_VERSION = '2026-01';

requireAuth('mentor', async (user) => {
  document.getElementById('welcomeName').textContent =
    user.user_metadata?.name || user.email?.split('@')[0] || 'mentor';

  // The thread panel markup is shared with the student portal.
  const mount = document.getElementById('mentorThreadMount');
  if (mount) mount.innerHTML = mtThreadPanelHTML();

  await loadMentorHome();

  onSectionLoad('students', loadMentorStudents);
  onSectionLoad('sessions', loadSessionSection);
  onSectionLoad('policy',   loadPolicyState);
});

/* ── Home ──────────────────────────────────────────────────────── */
async function loadMentorHome() {
  if (!sb) { fgEmpty('homeMatchList', 'Connect Supabase to see your students.'); return; }

  try {
    mentorPairs = fgRows(await sb.from('mentorships').select('*')
      .eq('mentor_user_id', currentUser.id)
      .order('created_at', { ascending: false }));
  } catch (e) {
    console.warn('[Mentor] match read failed:', e.message);
    fgError('homeMatchList', loadMentorHome);
    return;
  }

  const active = mentorPairs.filter(m => m.status === 'active');
  document.getElementById('kStudents').textContent = active.length;
  document.getElementById('kHours').textContent    = mentorPairs.reduce((s, m) => s + Number(m.total_hours || 0), 0).toFixed(1);
  document.getElementById('kSessions').textContent = mentorPairs.reduce((s, m) => s + Number(m.session_count || 0), 0);

  // Attestation is per person, so it is read from mentor_attestations
  // and holds even for a mentor who has not been matched yet.
  try {
    const { data } = await sb.from('mentor_attestations')
      .select('signed_at').eq('user_id', currentUser.id).maybeSingle();
    policySignedAt = data?.signed_at || null;
  } catch (e) { policySignedAt = null; }

  document.getElementById('kPolicy').textContent = policySignedAt ? 'Yes' : 'No';
  document.getElementById('policyAlert').style.display = policySignedAt ? 'none' : 'flex';

  mtRenderMentorships('homeMatchList', mentorPairs, 'mentor');
  if (!mentorPairs.length) {
    fgEmpty('homeMatchList', 'You have not been matched with a student yet - check back later.');
  }
}

async function loadMentorStudents() {
  await mtLoadMentorships('mentorMatchList', 'mentor');
}

/* ── Session log ───────────────────────────────────────────────── */
async function loadSessionSection() {
  const sel = document.getElementById('sessPair');
  sel.innerHTML = '<option value="">– Choose –</option>' +
    mentorPairs.filter(m => m.status === 'active')
      .map(m => `<option value="${m.id}">${m.student_name}</option>`).join('');
  await loadSessionHistory();
}

async function loadSessionHistory() {
  if (!sb || !mentorPairs.length) {
    fgEmpty('sessionHistory', 'No sessions logged yet - check back later.');
    return;
  }
  const ids = mentorPairs.map(m => m.id);
  return fgLoad('sessionHistory',
    async () => fgRows(await sb.from('mentorship_sessions').select('*')
      .in('pair_id', ids).order('date', { ascending: false }).limit(25)),
    renderSessionHistory,
    { empty: 'No sessions logged yet - check back later.' });
}

function renderSessionHistory(rows) {
  const nameFor = id => mentorPairs.find(m => m.id === id)?.student_name || 'Student';
  document.getElementById('sessionHistory').innerHTML = rows.map(s => `
    <div class="flex items-center gap-12" style="padding:11px 16px;border-bottom:1px solid var(--gray-100,#eef1ee);">
      <div style="flex:1;">
        <div class="fw-500 text-sm" style="color:var(--g900);">${nameFor(s.pair_id)}</div>
        <div class="text-xs text-muted" style="line-height:1.5;margin-top:2px;">${s.notes || '–'}</div>
      </div>
      <div class="text-xs text-muted" style="white-space:nowrap;text-align:right;">
        ${new Date(s.date + 'T00:00').toLocaleDateString()}<br/>
        <strong style="color:var(--g700);">${s.hours}h</strong>
      </div>
    </div>`).join('');
}

async function logMentorSession() {
  const pairId = document.getElementById('sessPair').value;
  const date   = document.getElementById('sessDate').value;
  const hours  = parseFloat(document.getElementById('sessHours').value);
  const notes  = document.getElementById('sessNotes').value.trim();

  if (!pairId)         { showMsg('sessMsg', 'Choose a student.', 'err'); return; }
  if (!date || !hours) { showMsg('sessMsg', 'Date and hours are required.', 'err'); return; }

  showMsg('sessMsg', 'Saving…', 'info');
  const { error } = await sb.from('mentorship_sessions').insert([{
    pair_id: pairId, date, hours, notes, logged_by: currentUser.id
  }]);
  if (error) { showMsg('sessMsg', error.message, 'err'); return; }

  // Totals are recalculated by a database trigger, so re-reading the
  // pairs is what picks them up - the browser never does the arithmetic.
  showMsg('sessMsg', 'Session saved.', 'ok');
  document.getElementById('sessDate').value  = '';
  document.getElementById('sessHours').value = '';
  document.getElementById('sessNotes').value = '';
  await loadMentorHome();
  await loadSessionHistory();
}
window.logMentorSession = logMentorSession;

/* ── Conduct policy ────────────────────────────────────────────── */
async function loadPolicyState() {
  const el = document.getElementById('policySigned');
  if (policySignedAt) {
    el.textContent = 'Signed ' + new Date(policySignedAt).toLocaleString() + '.';
    document.getElementById('policyAgree').checked  = true;
    document.getElementById('policyAgree').disabled = true;
  } else {
    el.textContent = 'You can sign now. It applies to every student you are matched with.';
  }
}

async function signPolicy() {
  if (!document.getElementById('policyAgree').checked) {
    showMsg('policyMsg', 'Tick the box to confirm you agree.', 'err');
    return;
  }
  showMsg('policyMsg', 'Recording…', 'info');

  // Recorded per person, not per match, so signing once covers every
  // student this mentor is matched with now or later. mentorships is
  // admin-only under RLS, so this goes through a security-definer
  // function rather than a direct update.
  const { error } = await sb.rpc('fg_attest_conduct_policy', { p_version: POLICY_VERSION });
  if (error) { showMsg('policyMsg', error.message, 'err'); return; }

  showMsg('policyMsg', 'Signed. Thank you.', 'ok');
  portalLog('mentor_policy_attested', {});
  await loadMentorHome();
  await loadPolicyState();
}
window.signPolicy = signPolicy;
