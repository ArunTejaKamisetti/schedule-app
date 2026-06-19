# Phase 4 — Secrets consolidation & DPDP compliance

## Secrets — all to the institutional account, all rotated

- Provision under **college-owned** accounts: production Supabase project, Google OAuth client + Sheets access, VAPID keypair, `CRON_SECRET`, `ANTHROPIC_API_KEY`.
- **Rotate every secret currently in `.env.local`** — they are compromised by being exposed in the repo working tree — and delete the **stale old-project keys**.
- Store production secrets only in **Vercel env vars** (never in the repo). `lib/env.ts` validates required vars at startup. Confirm `.env*` is git-ignored; scrub any committed secrets from history if found.
- `localdev` uses a **separate dev Supabase project + dev Google OAuth client** in `.env.local` only — so local work never touches production data or the rotated prod secrets.

## What "fragmented secrets → admin account" means in practice

| Secret today | Owner today | After |
| --- | --- | --- |
| Supabase URL + anon + service-role | personal project | institutional Supabase project (rotated) |
| Google OAuth client id/secret, refresh token | personal Google account | institutional Google account (rotated) |
| Google Sheet id | personal sheet | institutional sheet |
| VAPID public/private | personal | institutional (rotated) |
| `CRON_SECRET` | personal | institutional (rotated) |
| Old-project Supabase keys | leftover in `.env.local` | **deleted** |

## DPDP compliance (data fiduciary = the college)

- **Consent:** screen at first sign-in (record `profiles.consent_at`) + an in-app privacy notice (data collected, purpose, retention, contact).
- **Right to access:** "Export my data" endpoint returning the user's profile / enrollments / attendance / notes / friends as JSON.
- **Right to erasure:** "Delete my account" — removes the profile, cascades user-owned rows, and deletes the Supabase auth user.
- **Retention:** the Phase-2 purge job; document the window in the notice.
- **Token protection:** Google/calendar token tables stay server-only; RLS denies all client access.

## Critical files

`.env.example`, `lib/env.ts`, new export/delete endpoints under `app/api/**`, consent UI, privacy-notice page, retention purge in `app/api/cron/*`.
