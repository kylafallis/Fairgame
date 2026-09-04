/* ================================================================
   FairGame - mentor-thread.js

   The supervised mentoring channel, shared by the student portal and
   the mentor portal. Load AFTER portal-shared.js.

   The whole design rests on one rule: there is no private channel to a
   minor on this platform. That rule is enforced by RLS and by the
   insert-only mentor_messages table (migration 07), not by this file -
   a browser cannot be trusted with a safety guarantee. What this file
   does is make the rule visible, so neither party is under any illusion
   about who can read what they write.
   ================================================================ */

'use strict';

const MT_POLL_MS = 20000;
let   _mtTimer   = null;
let   _mtActive  = null;   // mentorship id currently on screen
let   _mtRole    = null;   // 'student' | 'mentor'
let   _mtLastId  = null;   // newest message already rendered

function mtEsc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ── The notice that sits above every thread ──────────────────────
   Worded plainly and shown to both sides. A student who does not know
   an adult is reading cannot make an informed choice about what to
   say, and a mentor who does not know is more likely to drift into a
   conversation that should never have happened. */
function mtSupervisionNotice(role) {
  const who = role === 'student'
    ? 'Your teacher and the FairGame team can read everything in here.'
    : 'The student’s teacher and the FairGame team can read everything in here.';
  return `<div style="background:#eff6ff;border:1.5px solid #3b82f6;padding:11px 14px;margin-bottom:14px;font-size:.8rem;color:#1e3a8a;line-height:1.55;">
    <strong>This conversation is supervised.</strong> ${who}
    Nothing here is private, and messages cannot be edited or deleted once sent.
    ${role === 'mentor'
      ? 'Keep all contact inside FairGame - never share or ask for a phone number, personal email, or social account.'
      : 'You never have to share your phone number, personal email, or social accounts. If anyone asks, tell your teacher or use Ask for Help.'}
  </div>`;
}

/* ── Load the signed-in person's mentorships ───────────────────── */
async function mtLoadMentorships(elId, role, onPick) {
  _mtRole = role;
  if (!sb) { fgEmpty(elId, 'Connect Supabase to see your mentoring.'); return; }

  return fgLoad(elId,
    async () => {
      const col = role === 'student' ? 'student_user_id' : 'mentor_user_id';
      // RLS already limits this to rows the caller participates in; the
      // filter is here so a mentor who is also a parent sees the right
      // list rather than both.
      return fgRows(await sb.from('mentorships').select('*')
        .eq(col, currentUser.id)
        .order('created_at', { ascending: false }));
    },
    (rows) => mtRenderMentorships(elId, rows, role, onPick),
    { empty: role === 'student'
        ? 'You have not been matched with a mentor yet - check back later.'
        : 'You have not been matched with a student yet - check back later.' });
}
window.mtLoadMentorships = mtLoadMentorships;

function mtRenderMentorships(elId, rows, role, onPick) {
  const el = typeof elId === 'string' ? document.getElementById(elId) : elId;
  el.innerHTML = rows.map(m => {
    const other  = role === 'student' ? m.mentor_name : m.student_name;
    const open   = m.status === 'active';
    // A pending or paused match is shown, not hidden. Someone waiting
    // on a channel deserves to know it exists and why it is shut.
    const state  = open ? 'Open'
                 : m.status === 'pending' ? 'Not open yet'
                 : m.status === 'paused'  ? 'Paused'
                 : m.status;
    return `<div class="card" style="margin:0 0 10px;">
      <div class="card-body" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
        <div style="flex:1;min-width:160px;">
          <div class="text-serif fw-600" style="font-size:.95rem;color:var(--g900);">${mtEsc(other)}</div>
          <div class="text-sm text-muted">${mtEsc(m.topic || m.field || 'Topic not set')}</div>
        </div>
        <span class="chip chip-${open ? 'active' : 'interest'}">${mtEsc(state)}</span>
        ${open
          ? `<button class="btn-primary" style="font-size:.78rem;padding:7px 14px;" onclick="mtOpenThread('${mtEsc(m.id)}','${mtEsc(other)}')">Open messages</button>`
          : `<span class="text-xs text-muted" style="max-width:230px;">${
              m.status === 'pending'
                ? 'Messaging opens once FairGame has guardian consent and the mentor’s paperwork on file.'
                : 'Messaging is paused. Contact the FairGame team.'
            }</span>`}
      </div>
    </div>`;
  }).join('');
}

/* ── Open one thread ───────────────────────────────────────────── */
async function mtOpenThread(mentorshipId, otherName) {
  _mtActive = mentorshipId;
  _mtLastId = null;

  const panel = document.getElementById('mtThreadPanel');
  if (!panel) return;
  panel.style.display = 'block';
  document.getElementById('mtThreadWith').textContent = otherName || '';

  const notice = document.getElementById('mtNotice');
  if (notice) notice.innerHTML = mtSupervisionNotice(_mtRole);

  await mtLoadMessages();

  // Poll rather than subscribe: the volume here is a handful of
  // messages a week, and a realtime channel is one more thing that can
  // silently stop working without anyone noticing.
  if (_mtTimer) clearInterval(_mtTimer);
  _mtTimer = setInterval(() => { if (!document.hidden) mtLoadMessages(true); }, MT_POLL_MS);
}
window.mtOpenThread = mtOpenThread;

function mtCloseThread() {
  _mtActive = null;
  if (_mtTimer) { clearInterval(_mtTimer); _mtTimer = null; }
  const panel = document.getElementById('mtThreadPanel');
  if (panel) panel.style.display = 'none';
}
window.mtCloseThread = mtCloseThread;

async function mtLoadMessages(quiet) {
  if (!_mtActive) return;
  const listEl = document.getElementById('mtMessages');
  if (!listEl) return;

  // A background poll must not blow away a rendered thread with a
  // spinner, so only the first load shows one.
  if (!quiet) fgSpinner(listEl);

  let rows;
  try {
    rows = fgRows(await sb.from('mentor_messages').select('*')
      .eq('mentorship_id', _mtActive)
      .order('created_at', { ascending: true }));
  } catch (e) {
    console.warn('[Thread] read failed:', e.message);
    if (!quiet) fgError(listEl, () => mtLoadMessages());
    return;
  }

  if (!rows.length) {
    fgEmpty(listEl, _mtRole === 'mentor'
      ? 'No messages yet. Introduce yourself and ask what they are working on.'
      : 'No messages yet - check back later, or say hello below.');
    return;
  }

  const newest = rows[rows.length - 1].id;
  if (quiet && newest === _mtLastId) return;   // nothing changed
  _mtLastId = newest;

  listEl.innerHTML = rows.map(m => {
    const mine = m.sender_id === currentUser.id;
    return `<div style="display:flex;flex-direction:column;align-items:${mine ? 'flex-end' : 'flex-start'};margin-bottom:12px;">
      <div style="max-width:78%;padding:10px 13px;background:${mine ? 'var(--g600,#357a38)' : 'var(--gray-100,#eef1ee)'};color:${mine ? '#fff' : 'var(--gray-700,#3d453d)'};font-size:.84rem;line-height:1.55;white-space:pre-wrap;">${mtEsc(m.body)}</div>
      <div class="text-xs text-muted" style="margin-top:3px;">
        ${mtEsc(m.sender_name || m.sender_role)} &middot; ${new Date(m.created_at).toLocaleString()}
        ${m.flagged ? ' &middot; <span style="color:#b45309;font-weight:600;">flagged for review</span>' : ''}
      </div>
    </div>`;
  }).join('');

  listEl.scrollTop = listEl.scrollHeight;
}
window.mtLoadMessages = mtLoadMessages;

/* ── Send ──────────────────────────────────────────────────────── */
async function mtSend() {
  const box  = document.getElementById('mtCompose');
  const body = box.value.trim();
  if (!body)      { showMsg('mtMsg', 'Write a message first.', 'err'); return; }
  if (!_mtActive) { showMsg('mtMsg', 'No conversation is open.', 'err'); return; }

  // Warn before sending, not after. The message is still recorded if
  // they go ahead - a mentor pushing for off-platform contact is
  // exactly what a reviewer needs to see - but a student who typed
  // their number without thinking gets a chance to take it back.
  if (/(\+?\d[\s.-]?){7,}|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|instagram|snapchat|tiktok|whatsapp/i.test(body)) {
    const ok = confirm(
      'This looks like it contains contact details (a phone number, email, or social account).\n\n' +
      'Mentoring is meant to stay inside FairGame. If you send this, it will be flagged and reviewed by the FairGame team.\n\n' +
      'Send anyway?');
    if (!ok) return;
  }

  const btn = document.getElementById('mtSendBtn');
  btn.disabled = true;
  showMsg('mtMsg', 'Sending…', 'info');

  const { error } = await sb.from('mentor_messages').insert([{
    mentorship_id: _mtActive,
    sender_id:     currentUser.id,
    sender_role:   _mtRole,
    sender_name:   currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || _mtRole,
    body,
  }]);

  btn.disabled = false;

  if (error) {
    // The most likely cause is a gate closing mid-session - consent
    // revoked, or the match paused. Say so rather than showing a raw
    // policy error.
    const closed = /row-level security|policy/i.test(error.message);
    showMsg('mtMsg', closed
      ? 'This conversation is no longer open. Contact the FairGame team.'
      : error.message, 'err');
    return;
  }

  box.value = '';
  showMsg('mtMsg', 'Sent.', 'ok');
  await mtLoadMessages(true);
}
window.mtSend = mtSend;

/* Markup for the thread panel, so both portals stay identical without
   the HTML being maintained twice. */
function mtThreadPanelHTML() {
  return `
  <div class="card" id="mtThreadPanel" style="display:none;margin-top:16px;">
    <div class="card-header">
      <h3>Messages with <span id="mtThreadWith">–</span></h3>
      <button class="btn-xs" onclick="mtCloseThread()">Close</button>
    </div>
    <div class="card-body">
      <div id="mtNotice"></div>
      <div id="mtMessages" style="max-height:420px;overflow-y:auto;padding:4px 2px;margin-bottom:14px;"></div>
      <div class="form-group">
        <textarea id="mtCompose" rows="3" placeholder="Write a message…" style="width:100%;"></textarea>
      </div>
      <div style="display:flex;gap:10px;align-items:center;">
        <button class="btn-primary" id="mtSendBtn" onclick="mtSend()" style="font-size:.8rem;padding:9px 18px;">Send</button>
        <span class="text-xs text-muted">Everything here is on the record.</span>
      </div>
      <div class="msg-strip" id="mtMsg"></div>
    </div>
  </div>`;
}
window.mtThreadPanelHTML = mtThreadPanelHTML;
