// FairGame - create-invite
//
// Creates a state director or regional coordinator invitation, emails the
// link, and hands the link back to the person who made it - once.
//
// Who may invite whom is decided in the database, not here: this calls
// fg_create_invite (migration 18) as the signed-in caller, with their own
// token, so the same rules apply whether the invitation comes through this
// function or not. An admin can invite a director for any state; a state
// director can invite coordinators for regions in their own state.
//
// The database keeps only a SHA-256 fingerprint of the secret in the link.
// The link in this response, and in the email, are the only copies.
//
// If RESEND_API_KEY is not set the invitation is still created and the
// link returned with emailed:false, so the inviter can send it themselves.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = Deno.env.get('SITE_URL') ?? 'https://fairgameinitiative.org';
const FROM = Deno.env.get('INVITE_FROM_EMAIL') ?? 'FairGame Initiative <team@fairgameinitiative.org>';
const REPLY_TO = 'fairgameinitiative@outlook.com';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const STATE_NAMES: Record<string, string> = {
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California', CO:'Colorado', CT:'Connecticut',
  DE:'Delaware', DC:'District of Columbia', FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois',
  IN:'Indiana', IA:'Iowa', KS:'Kansas', KY:'Kentucky', LA:'Louisiana', ME:'Maine', MD:'Maryland',
  MA:'Massachusetts', MI:'Michigan', MN:'Minnesota', MS:'Mississippi', MO:'Missouri', MT:'Montana',
  NE:'Nebraska', NV:'Nevada', NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico', NY:'New York',
  NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania',
  RI:'Rhode Island', SC:'South Carolina', SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah',
  VT:'Vermont', VA:'Virginia', WA:'Washington', WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming',
  PR:'Puerto Rico', GU:'Guam', VI:'U.S. Virgin Islands', AS:'American Samoa', MP:'Northern Mariana Islands',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Sign in first.' }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: 'Bad request.' }, 400); }

  const role     = String(body.role ?? '');
  const email    = String(body.email ?? '').trim();
  const fullName = String(body.full_name ?? '').trim();
  const state    = body.state ? String(body.state).toUpperCase() : null;
  const regionId = body.region_id ? String(body.region_id) : null;
  const sendMail = body.send_email !== false;

  // Acts as the caller. Every permission check happens inside the function.
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });

  const { data: inv, error } = await sb.rpc('fg_create_invite', {
    p_role: role, p_email: email, p_full_name: fullName, p_state: state, p_region_id: regionId,
  });
  if (error) return json({ error: error.message }, 400);

  const link = `${SITE}/accept-invite.html?token=${encodeURIComponent(inv.token)}`;
  const stateName = STATE_NAMES[inv.state_code] ?? inv.state_code;
  const expires = new Date(inv.expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Who sent it, for the email's first line.
  const { data: { user } } = await sb.auth.getUser();
  const inviter = (user?.user_metadata?.name as string | undefined)?.trim() || 'The FairGame team';

  let emailed = false;
  let emailError: string | null = null;
  const key = Deno.env.get('RESEND_API_KEY');

  if (sendMail && key) {
    const first = (inv.full_name ?? '').trim().split(/\s+/)[0] || 'there';
    const what = inv.role === 'state_director'
      ? `the FairGame state director for ${stateName}`
      : `the FairGame regional coordinator for ${inv.region_name ?? 'a region'} in ${stateName}`;
    const does = inv.role === 'state_director'
      ? [
          `As state director you will see every science fair and volunteer judge FairGame has in ${stateName},`,
          'flag anything that looks wrong, group counties into regions, and invite a coordinator for each region.',
        ]
      : [
          `As regional coordinator you will see the fairs and volunteer judges in your region's counties,`,
          'and help make sure every fair there has the judges it needs.',
        ];
    const text = [
      `Hi ${first},`,
      '',
      `${inviter} has invited you to be ${what}.`,
      '',
      ...does,
      '',
      'Accept the invitation here:',
      link,
      '',
      `Sign in or create your account with this email address (${inv.email}) - the link only works for it.`,
      `The link works once and expires on ${expires}. If it expires, reply to this email for a new one.`,
      '',
      'Thank you for helping students in your state find their fair.',
      '',
      'FairGame Initiative',
      REPLY_TO,
    ].join('\n');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [inv.email],
        reply_to: REPLY_TO,
        subject: inv.role === 'state_director'
          ? `Your invitation: FairGame state director for ${stateName}`
          : `Your invitation: FairGame regional coordinator, ${inv.region_name ?? stateName}`,
        text,
      }),
    });
    if (res.ok) {
      emailed = true;
      await sb.rpc('fg_mark_invite_emailed', { p_id: inv.id });
    } else {
      emailError = `Email failed (Resend ${res.status}). Send the link yourself.`;
    }
  } else if (sendMail) {
    emailError = 'Email is not set up (RESEND_API_KEY is missing). Send the link yourself.';
  }

  return json({
    id: inv.id,
    link,
    role: inv.role,
    email: inv.email,
    state_code: inv.state_code,
    region_name: inv.region_name,
    expires_at: inv.expires_at,
    emailed,
    email_error: emailError,
  });
});
