// FairGame - judge-request-notify
//
// Emails a judge when a teacher sends a match request from the public
// judge map. The map no longer has judges' addresses (migration 16), so
// this looks the judge up itself. It only acts on a request made in the
// last 15 minutes that has not been notified yet, so it cannot be used
// to mail anyone else or to send the same request twice.
//
// The teacher's address goes in Reply-To, so the judge answers them
// directly - the same thing the old mailto link did, minus exposing the
// judge's address to every visitor.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE      = 'https://fairgameinitiative.org';
const FROM      = Deno.env.get('JUDGE_FROM_EMAIL') ?? 'FairGame Initiative <judges@fairgameinitiative.org>';
const WINDOW_MS = 15 * 60 * 1000;
const UUID_RE   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405);

  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return json({ sent: false, reason: 'RESEND_API_KEY is not set' }, 500);

  let id = '';
  try { id = String((await req.json()).id ?? ''); } catch { /* fall through */ }
  if (!UUID_RE.test(id)) return json({ sent: false, reason: 'bad id' }, 400);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: r, error } = await sb.from('judge_requests')
    .select('id, judge_id, teacher_name, teacher_email, school, fair_date, message, created_at, notified_at')
    .eq('id', id).maybeSingle();
  if (error) return json({ sent: false, reason: error.message }, 500);
  if (!r || r.notified_at || Date.parse(r.created_at) < Date.now() - WINDOW_MS) {
    return json({ sent: false, reason: 'nothing to send' });
  }

  const { data: j } = await sb.from('judges').select('name, email, status').eq('id', r.judge_id).maybeSingle();
  if (!j?.email || j.status !== 'active') return json({ sent: false, reason: 'judge not available' });

  const replyTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.teacher_email ?? '') ? r.teacher_email : undefined;
  const first = (j.name ?? '').trim().split(/\s+/)[0] || 'there';
  const text = [
    `Hi ${first},`,
    '',
    `${r.teacher_name} is coordinating the science fair at ${r.school} and would like you to judge.`,
    '',
    `Fair date: ${r.fair_date}`,
    r.message ? `\nTheir note:\n${r.message}\n` : '',
    replyTo
      ? `Reply to this email to answer ${r.teacher_name} directly, or accept or decline in your portal:`
      : 'Accept or decline in your portal:',
    `${SITE}/login.html`,
    '',
    'Thank you for judging with FairGame.',
    '',
    'FairGame Initiative',
    'fairgameinitiative@outlook.com',
  ].join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [j.email],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject: `Judge request: ${r.school}, ${r.fair_date}`,
      text,
    }),
  });
  if (!res.ok) return json({ sent: false, reason: 'resend ' + res.status }, 502);

  await sb.from('judge_requests').update({ notified_at: new Date().toISOString(), judge_email: j.email }).eq('id', r.id);
  return json({ sent: true });
});
