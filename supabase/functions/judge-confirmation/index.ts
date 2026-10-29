// FairGame - judge-confirmation
//
// Sends "we got your application" to a judge right after they apply.
// The signup page calls it with the email it just wrote; this looks the
// application up itself and only sends when there is one from the last
// 15 minutes that has not been confirmed yet. So it cannot be pointed at
// an arbitrary address, and it sends at most once per application.
//
// Mail goes through Resend from the verified fairgameinitiative.org
// domain, with replies routed to the Outlook inbox (see migration 03).

import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE      = 'https://fairgameinitiative.org';
const FROM      = Deno.env.get('JUDGE_FROM_EMAIL') ?? 'FairGame Initiative <judges@fairgameinitiative.org>';
const REPLY_TO  = 'fairgameinitiative@outlook.com';
const WINDOW_MS = 15 * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function firstName(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'there';
  if (/^(mr|mrs|ms|miss|mx|dr|prof|professor)\.?$/i.test(parts[0])) {
    return parts.length === 1 ? 'there' : parts[0] + ' ' + parts[parts.length - 1];
  }
  return parts[0];
}

function body(j: { name: string | null; code: string | null }): string {
  const share = j.code ? `${SITE}/volunteer.html?ref=${encodeURIComponent(j.code)}#judge` : `${SITE}/volunteer.html`;
  return [
    `Hi ${firstName(j.name)},`,
    '',
    'Thank you for applying to judge with FairGame. Your application is in.',
    '',
    'What happens next:',
    '  1. We review every judge personally, because judges see student work and school contact details. This usually takes 1 to 3 business days.',
    '  2. You will get a second email from us when you are approved.',
    `  3. Then sign in at ${SITE}/login.html with this email address and the password you chose.`,
    '',
    'You may also get a separate "confirm your email" message for your portal account. Please click it, so signing in works the first time.',
    '',
    j.code ? `Your judge code is ${j.code}.` : '',
    '',
    'Know someone who would make a good judge? This link is yours - anyone who applies through it is credited to you:',
    share,
    '',
    'Questions? Just reply to this email.',
    '',
    'Kyla Fallis',
    'FairGame Initiative',
    REPLY_TO,
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405);

  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return json({ sent: false, reason: 'RESEND_API_KEY is not set' }, 500);

  let email = '';
  try { email = String((await req.json()).email ?? '').trim(); } catch { /* fall through */ }
  if (!email || email.length > 320 || !email.includes('@')) return json({ sent: false, reason: 'bad email' }, 400);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const pattern = email.replace(/[\\%_]/g, (c) => '\\' + c);
  const { data: j, error } = await sb.from('judges')
    .select('id, name, email, code, created_at')
    .ilike('email', pattern)
    .is('confirmation_sent_at', null)
    .gte('created_at', new Date(Date.now() - WINDOW_MS).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return json({ sent: false, reason: error.message }, 500);
  // Nothing to confirm is the normal answer for a repeat call, not a fault.
  if (!j) return json({ sent: false, reason: 'no recent application' });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [j.email],
      reply_to: REPLY_TO,
      subject: 'We got your FairGame judge application',
      text: body(j),
    }),
  });
  if (!res.ok) return json({ sent: false, reason: 'resend ' + res.status + ' ' + (await res.text()).slice(0, 200) }, 502);

  await sb.from('judges').update({ confirmation_sent_at: new Date().toISOString() }).eq('id', j.id);
  return json({ sent: true });
});
