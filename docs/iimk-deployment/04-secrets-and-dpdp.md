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

## Data protection — basics only (full DPDP descoped)

> **Decision (Arun):** we are **not** building the full DPDP feature set (no consent screen, no
> self-service export, no self-service account deletion). The basics already in place are
> considered sufficient for this rollout. Keep:
>
> - **Retention:** the Phase-2 purge job (`/api/cron/retention`) trims old-term attendance/notes/
>   notifications — already built.
> - **Token protection:** Google/calendar token tables are server-only; RLS denies client access — already in place (migration 014).
> - **Domain-restricted identity:** only `@iimk.ac.in` Google accounts (Phase 1).
>
> Dropped (do **not** build unless revisited): consent-at-first-sign-in screen, privacy-notice page,
> "export my data" endpoint, "delete my account" flow.

## Critical files

`.env.example`, `lib/env.ts`. (Retention purge already shipped in `app/api/cron/retention`.)
