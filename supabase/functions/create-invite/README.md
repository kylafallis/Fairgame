# create-invite

Creates a state director or regional coordinator invitation (migration 18),
emails the one-time link through Resend, and returns the link to whoever
made it so they can copy it too. The database stores only a fingerprint of
the link's secret, so this response and the email are the only copies.

Who can invite whom is enforced by `fg_create_invite` in the database. The
function calls it as the signed-in person, so it cannot be used to get round
those rules.

## Deploy (once)

Needs migration 18 applied first. `RESEND_API_KEY` is the same secret the
judge emails already use, so it is probably set already.

```bash
supabase functions deploy create-invite
```

Deploy it **without** `--no-verify-jwt`: only signed-in admins and state
directors should ever reach it.

Optional:

```bash
supabase secrets set INVITE_FROM_EMAIL="FairGame <team@fairgameinitiative.org>"
```

Until it is deployed, the admin and state pages still create invitations
by calling `fg_create_invite` directly. They show the link to copy and say
that no email was sent.

## Accepting

No second function is needed. `accept-invite.html` signs the person in and
calls `fg_accept_invite`, which checks the link, the expiry, and that the
signed-in address is the one invited, then sets the role.
