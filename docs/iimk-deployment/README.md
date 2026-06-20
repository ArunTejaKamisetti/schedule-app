# IIM Kozhikode deployment refactor — plan

> Working branch: **`localdev`** (runs locally only; **never** merged to `master` / deployed to Vercel production).
> These docs are the durable spec for the refactor so context is preserved across sessions.

## Why this refactor

The app works but was built as a personal dev tool. For a college-wide rollout it needs:

- **Real identity & authorization.** Today identity is a random localStorage UUID; every API route accepts an arbitrary `userId` with no ownership check, `?t=<userId>` lets anyone impersonate anyone, and there are **no RLS policies** (all server routes use the service-role key, which bypasses row security).
- **Consolidated, rotated secrets.** Real prod secrets sit in `.env.local` (Supabase service key, Google OAuth secret + refresh token, VAPID private key, CRON secret) plus stale old-project keys; the admin OAuth callback even prints the refresh token into HTML.
- **A normalized database.** `courses` stores **one row per session** with name/instructor/credits/area repeated on every row; no course-master / faculty / room tables.
- **An admin mode.** Schedules come from developer-maintained Google Sheets; bus/mess are hardcoded in `lib/bus.ts` / `lib/mess.ts`. There is no admin UI.
- **DPDP compliance.** No sign-in, consent, privacy notice, export, deletion, or retention.

**Goal:** robust, secure, ₹0 to run at ~2,400 students, preserving every existing feature. (Full DPDP — consent/export/delete — is **descoped**; we keep only the basics: retention purge, server-only tokens, domain-restricted sign-in. See [04-secrets-and-dpdp.md](04-secrets-and-dpdp.md).)

## Confirmed decisions

1. **Auth:** mandatory college Google sign-in (Supabase Auth, restricted to `@iimk.ac.in`); roles = `student` / `admin`. → [01-auth-and-roles.md](01-auth-and-roles.md)
2. **Database:** stay on Supabase free tier (₹0 at this scale); normalize + add RLS. → [02-database.md](02-database.md)
3. **Admin:** secured in-app admin dashboard; keep Google Sheets as schedule source (institutional account). → [03-admin-dashboard.md](03-admin-dashboard.md)
4. **Identity/data:** fresh start. Admin shares the schedule sheet, a **roster** (email → section/electives) that auto-fills schedules (manual picker hidden), and adds **bus/mess** data by pasting a table generated in any free chat tool (copy-paste only; no paid API). → [03-admin-dashboard.md](03-admin-dashboard.md)
5. **Secrets:** all secrets to the institutional account, rotated. **DPDP descoped** to basics only (retention purge + server-only tokens + domain-restricted sign-in; no consent/export/delete). → [04-secrets-and-dpdp.md](04-secrets-and-dpdp.md)

## Scale & cost (≈ 800 × 3 = 2,400 students)

Fits Supabase's free tier (500 MB DB, 50K monthly auth users). The real cost lever is **egress** (everyone reads the same schedule), not row count. So: normalize to cut row bloat, **cache shared schedule reads** at the edge, and add a **retention purge** for old-term attendance/notes/notifications to stay well under 500 MB.

## Phases & execution order

- **Phase 0 — Branch & isolated dev env.** `localdev` branch; keep out of Vercel prod; **dev** Supabase project + **dev** Google OAuth client owned by a dedicated project account (not personal Gmail); `.env.example` + `lib/env.ts` validation. Account ownership + handover plan: [06-accounts-and-handover.md](06-accounts-and-handover.md).
- **Phase 1 — Auth & roles.** See [01-auth-and-roles.md](01-auth-and-roles.md).
- **Phase 2 — DB normalization + RLS.** See [02-database.md](02-database.md).
- **Phase 3 — Admin dashboard.** See [03-admin-dashboard.md](03-admin-dashboard.md).
- **Phase 4 — Secrets + DPDP.** See [04-secrets-and-dpdp.md](04-secrets-and-dpdp.md).
- **Phase 5 — Security hardening.** Built-in only, no external/paid tool. See [05-security-hardening.md](05-security-hardening.md).

Order: 0 → 1 (auth is the foundation for RLS) → 2 → 3 → 4, with Phase 5 hardening applied throughout. Each phase stays runnable locally and is independently testable.

**Current status (localdev):** Phases 0–1 done; Phase 2 enrollment-normalize + RLS + retention done; roster-driven enrollment + admin access hardening done; edge caching, admin dashboard, and bus/mess paste-import done. **Phase 4 (secrets/DPDP) code side done** — `lib/env.ts` fail-fast validation wired via `instrumentation.ts`, OAuth callback no longer renders the refresh token (server-log only); secret *rotation* itself is a manual handover runbook (see [04](04-secrets-and-dpdp.md)).

**Decision (2026-06):** the remaining `courses`→master+`course_sessions` split is **descoped**. The headline storage win (enrollment normalized to one row per course, ~52,839 → ~5–6k, migration 013) is already banked; the deferred master/sessions split was the high-risk half (needs a live DB to verify) and its remaining benefit is only de-duplicating course name/instructor — not worth the risk for this rollout.

**Route-auth lockdown (Phase 5 §3) done.** New `lib/api-auth.ts#getAuthedSession()` (cookie-aware RLS client + verified `auth.uid()`); every own-data API route now derives identity from the session (client `userId` ignored) and runs on the RLS client so migration-014 RLS enforces. Cross-user friend routes keep the service client but take the caller from the session and add a friendship authz check. Impersonation vectors removed: `/api/user/resolve`→410, legacy `lib/session.ts` deleted, client import/recovery UI removed. The one documented exception is the `/api/calendar` .ics feed (external cookieless subscription; random-UUID bearer capability). Validation stays hand-rolled (no zod), per project convention.

**Security headers (Phase 5 §6) done** — `next.config.ts#headers()` sets CSP (connect-src locked to this deploy's Supabase origin; dev loosened for Turbopack HMR), HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. Verified emitted locally.

**Roster-authoritative pruning (migration 018) done.** The two rosters (Y1 + Y2) are the source of truth for "who is a current student": roster upload now REPLACES that year's slice (`replace_roster_year`, was an additive upsert), and an admin-confirmed prune removes students in no roster (dashboard "Students who have left" → `/api/admin/reconcile` → `prune_departed_students`; cascade clears their enrollments/friends/notes/attendance/tokens). Guards: DB refuses an empty-roster wipe, admins are exempt, UI warns on a missing-year roster or >30% removal. Courses already self-replace per `source_key`. Auth identities (`auth.users`) intentionally left in place. **Operational rule: upload BOTH rosters before reconciling.** Covered by `tests/db-reconcile.test.ts` + `tests/reconcile.test.ts` (pglite harness).

**Remaining (manual/ops at handover):** Phase 4 secret **rotation** runbook; apply migrations 013–018 to the live DB; optional `calendar_token` hardening; optional Phase 5 §4 rate limiting, §8 admin audit-log table, §10 Dependabot, §12 monitoring.

**Biggest DB win (from real data):** `user_courses` is 52,839 rows because enrollment is stored per *session*; pointing enrollment at the course master collapses it ~10× to ~5–6k. See [02-database.md](02-database.md).

## Reuse (don't rebuild)

- `lib/supabase/server.ts#createServerClient` (cookie-aware) becomes the per-user RLS client; `createServiceClient` is reserved for sync/cron/admin server tasks.
- The `user_sessions` / `course_catalog` RPC pattern (single round-trip; avoids the 1000-row PostgREST cap) — re-point at normalized tables, keep the design.
- The Sheets diff/notify pipeline in `app/api/sync/route.ts` — adapt to normalized rows, don't replace.
- The compact `busyByDate` free-time contract used by `components/free-time-dialog.tsx` — preserve behind a gated RPC.
- `lib/bus.ts` trip shape `{time, min, from, to[], maingate}` — the pasted bus JSON uses it exactly, so next-bus auto-scroll is unchanged.

## Verification (run locally before considering a phase done)

1. `npm install`, `npm run dev`; `lib/env.ts` fails fast on a missing var.
2. Auth: `@iimk.ac.in` Google sign-in works; other domains rejected; routes gated.
3. RLS: student A cannot read student B's data via a crafted call; forged `userId` does nothing (param removed).
4. Normalization: migrations produce one row per course + sessions; a sync still diffs/notifies; `/today` and `/schedule` render identically.
5. Roster: upload → listed student signs in → schedule auto-fills, picker hidden.
6. Bus/mess: admin uploads photo → reviews extracted table → saves → next-bus + stop filtering + mess-by-day still work.
7. Admin gating: `/admin/**`, sync trigger, OAuth routes blocked for students; refresh token never rendered.
8. Data basics: retention purge removes old-term rows; token tables have no client access (RLS). (Consent/export/delete are descoped.)
9. `npm run test`, `npm run lint`.
10. `localdev` not built by Vercel; uses only the dev Supabase + dev OAuth client.
