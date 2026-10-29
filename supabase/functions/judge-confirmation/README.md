# judge-confirmation

Emails a judge "we got your application" right after they apply on
`volunteer.html`. Sent through Resend from the verified
`fairgameinitiative.org` domain; replies go to fairgameinitiative@outlook.com.

## Deploy (once)

Needs migration 15 applied first (it adds `judges.confirmation_sent_at`).

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxx
```

```bash
supabase functions deploy judge-confirmation --no-verify-jwt
```

`--no-verify-jwt` is needed because applicants are not signed in yet. The
function protects itself instead: it only sends to an address that has a
judge application from the last 15 minutes with no confirmation sent.

Optional: `supabase secrets set JUDGE_FROM_EMAIL="FairGame <judges@fairgameinitiative.org>"`
to change the From line.

Until it is deployed the signup form still works - the call just fails
quietly and the on-screen confirmation is all the applicant gets.
