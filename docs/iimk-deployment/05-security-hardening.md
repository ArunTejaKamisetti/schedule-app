# Phase 5 — Security hardening ("highly secure & safe")

## Do we need any external/paid tool for secrets or roles? — No.

Everything is built into the stack already in use. No new SaaS, no paid plan, no ongoing bill.

| Need | Tool | External? |
| --- | --- | --- |
| Login / identity | **Supabase Auth** (Google provider) | built-in |
| Roles & permissions | **Postgres Row-Level Security** + a `role` claim | built-in |
| Secrets storage | **Vercel environment variables** (prod) + `.env.local` (dev) | built-in |
| Encrypt stored Google/calendar tokens at rest | **Supabase Vault** | built-in to Supabase |
| Input validation | **zod** (tiny, ~no cost) | small library |
| Dependency alerts | **Dependabot** | free (GitHub) |
| Rate limiting | Postgres-backed limiter, or Vercel WAF; **Upstash** free tier optional | mostly built-in |

So: **no external security plugin is required**, and the **whole app stays free** — bus/mess use a free copy-paste flow (admin pastes a table generated in any free chat tool), not a paid API (see [03-admin-dashboard.md](03-admin-dashboard.md)). The only new library is `zod` (validation).

## Hardening checklist (all ₹0)

1. **Identity:** mandatory college Google SSO; verify the `@iimk.ac.in` domain **server-side** (not just the `hd` param). Remove the impersonation vectors — the `?t=<userId>` recovery link and `import_code`/share-code device transfer.
2. **Authorization:** RLS on **every** table keyed to `auth.uid()`; least privilege — the **service-role key is server-only**, never in the client bundle; admin actions gated by an `is_admin()` role check.
3. **API trust boundary:** derive the user from the session server-side; **never trust a client-supplied `userId`**. Validate every request body/query with `zod`; reject unknown fields.
4. **Rate limiting:** throttle auth and mutation routes to stop brute force / enumeration / abuse. Prefer a dependency-light Postgres-backed limiter or Vercel's firewall; Upstash free tier is an optional drop-in.
5. **Secrets:** all in Vercel env vars, **rotated**, server-only; **Supabase Vault** to encrypt the stored Google/calendar refresh tokens at rest; audit that only safe vars ship to the browser (`NEXT_PUBLIC_SUPABASE_URL`, anon key, VAPID **public** key — all designed to be public).
6. **Transport & headers:** HTTPS (Vercel default) + security headers via `next.config` / `middleware.ts` — CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`.
7. **Cookies / CSRF:** Supabase SSR sets `httpOnly`, `Secure`, `SameSite` cookies; keep state-changing routes POST and same-origin.
8. **Admin safety:** remove the public, unauthenticated `/admin/preview` and `/api/admin/oauth` exposure; **never render tokens into HTML**; **audit-log** admin actions and sensitive mutations (who / what / when) in a dedicated table.
9. **Cron / webhooks:** keep the `CRON_SECRET` bearer check on `/api/sync` and `/api/cron/*`; admin-gate manual sync from the dashboard.
10. **Dependencies:** `npm audit` + Dependabot; keep Next.js / Supabase / googleapis current.
11. **DPDP (defense + compliance):** consent, data minimization (friend free-time returns busy/free slots only, never full details), export, account deletion, retention purge. See [04-secrets-and-dpdp.md](04-secrets-and-dpdp.md).
12. **Monitoring:** use Supabase auth/database logs; review for anomalous access.

> The single highest-impact change is #2 + #3 together: with RLS on every table and the user derived from the session, a forged or guessed request simply cannot read or write another student's data — which closes the class of holes the app has today.

---

## Status (localdev)

- **#1 Identity** ✅ — domain-restricted Google SSO (Phase 1); impersonation vectors removed (`/api/user/resolve`→410, legacy `lib/session.ts` deleted, client import/recovery UI gone).
- **#2 Authorization** ✅ — RLS on every table (migration 014, `is_admin()`); service-role key server-only; admin routes gated by `requireAdmin`.
- **#3 API trust boundary** ✅ — all routes derive identity from the session (`lib/api-auth.ts`); cross-user friend routes add a friendship check. Validation is **hand-rolled** (e.g. `lib/bus-mess-validate.ts`); **no zod** by project convention.
- **#5 Secrets** — token never rendered into HTML (✅); fail-fast `lib/env.ts` (✅); rotation + Supabase Vault are the manual handover runbook ([04](04-secrets-and-dpdp.md)).
- **#6 Transport & headers** ✅ — `next.config.ts#headers()` sets CSP (connect-src locked to this deploy's Supabase origin; dev loosened for Turbopack HMR), HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. Verified emitted on `/sign-in` (200) and `/today` (307).
- **#8 Admin safety** — admin routes gated, token-leak fixed (✅); **audit-log table still TODO** (needs a migration).
- **#9 Cron** ✅ — `CRON_SECRET` bearer on `/api/sync` + `/api/cron/*`.
- **Remaining (optional):** #4 rate limiting, #8 admin audit-log table, #10 Dependabot, #12 monitoring.
