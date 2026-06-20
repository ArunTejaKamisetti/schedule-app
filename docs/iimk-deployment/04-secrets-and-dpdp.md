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
> - **Outgoing-student pruning (migration 018):** the roster is the source of truth — a student in
>   neither the Y1 nor Y2 roster has left, and an admin-confirmed prune (`/api/admin/reconcile`)
>   removes their account and all their data (cascade). So ex-students' identity/enrollments/friends/
>   tokens don't linger. Guarded against an empty-roster wipe; admins exempt. (Supabase `auth.users`
>   identities are intentionally left in place — a leaver with a disabled IIM email can't sign in.)
> - **Token protection:** Google/calendar token tables are server-only; RLS denies client access — already in place (migration 014).
> - **Domain-restricted identity:** only `@iimk.ac.in` Google accounts (Phase 1).
>
> Dropped (do **not** build unless revisited): consent-at-first-sign-in screen, privacy-notice page,
> "export my data" endpoint, "delete my account" flow.

## Critical files

`.env.example`, `lib/env.ts`. (Retention purge already shipped in `app/api/cron/retention`.)

---

## Status / progress (code side — `localdev`)

Done (the code-side of Phase 4; rotation itself is a manual ops step at handover):
- **Fail-fast env validation.** `lib/env.ts` (`REQUIRED_SERVER_ENV`, `validateEnv`, `assertServerEnv`) lists every required var and is wired through `instrumentation.ts`'s `register()` (Node runtime only) so a misconfigured deploy throws one aggregated "Missing required environment variable(s): …" at server boot instead of a confusing mid-request null. Unit-tested in `tests/env.test.ts`.
- **No tokens rendered into HTML.** `app/api/admin/oauth/callback/route.ts` no longer writes `GOOGLE_REFRESH_TOKEN` into the page — it logs it to the **server log** only (admin copies it from Vercel/terminal logs into the env var, then clears the line). Closes [05 §8](05-security-hardening.md).
- `.env.example` carries all 15 required vars plus optional `RETENTION_DAYS`.

## Rotation runbook (manual — run at handover to the institutional account)

These are console operations the operator (Arun → college admin) performs; the app can't do them.

1. **Supabase (institutional project):** create the project under the college account. Settings → API → copy the new `URL`, `anon`, `service_role`. Settings → API → *rotate* the service-role/JWT secret. Put the new values in Vercel env (prod) only.
2. **Google Cloud (institutional account):** new OAuth client (web) → set `GOOGLE_CLIENT_ID`/`SECRET`/`REDIRECT_URI`; delete the old personal client. Re-run the in-app connect flow → grab `GOOGLE_REFRESH_TOKEN` from the **server log** (not the page) → store in Vercel env.
3. **Google Sheet:** move/copy the schedule sheet to the institutional account; set `GOOGLE_SHEET_ID`.
4. **VAPID:** `npx web-push generate-vapid-keys` → set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL`.
5. **CRON_SECRET:** generate a fresh random string; set in Vercel env and in the cron scheduler's bearer header.
6. **Delete stale old-project keys** from `.env.local` and anywhere else; confirm `.env*` is git-ignored and no secret is committed in history.
7. **Verify:** redeploy; `instrumentation.ts` will fail the boot if any var is missing. Smoke-test sign-in + a sync.

> `localdev` keeps using the **dev** Supabase project + **dev** Google OAuth client in `.env.local`; rotation above is for the **prod/institutional** deploy and never touches the dev secrets.
