# Phase 1 — Authentication & roles

Replace the localStorage-UUID identity with **Supabase Auth + Google**, restricted to the college domain, with `student` / `admin` roles. This is the foundation that makes RLS (Phase 2) meaningful.

## Sign-in

- Enable the Google provider in Supabase Auth.
- Restrict to `@iimk.ac.in`: pass the hosted-domain `hd` param on the OAuth request **and** enforce the email domain server-side (post-sign-in callback or a DB trigger). `hd` alone is spoofable, so the server-side check is required.

## `profiles` table (keyed on `auth.uid()`)

`id (uuid → auth.users)`, `display_name`, `role ('student'|'admin')`, `year`, `section`, notification prefs, `push_subscription`, `created_at`, `last_seen_at`, `consent_at`.

A trigger on `auth.users` insert creates the profile and sets `role` from an `admins` allowlist (institutional admin emails).

## Session handling (rewrite)

- `components/session-provider.tsx` + `lib/session.ts`: drop `getOrCreateSessionId`, `applyRecoveryTokenFromUrl`, and share-code localStorage. Use the Supabase **browser** client (`lib/supabase/client.ts`); expose `user` + `role` from `profiles`.
- Add `middleware.ts` + a sign-in page so `(app)` routes require a session; redirect unauthenticated users to sign-in.
- API routes switch to the cookie-aware `createServerClient` in `lib/supabase/server.ts`, which runs **as the authenticated user** so RLS applies. `createServiceClient` is reserved for sync/cron/admin server tasks only.

## API routes

Remove `userId` from all request bodies/queries; derive the user from the session server-side. Ownership becomes implicit via RLS + `auth.uid()`. Touches every route under `app/api/**` (user, courses/user, attendance, notes, notifications, friends, friends/free-time, friends/compare, calendar, push/subscribe).

## Friends

Connect by **verified identity** (search profiles/roster by name within college) instead of guessable share codes. A friend's free-time/compare data is exposed only via a `SECURITY DEFINER` RPC gated on an **accepted friendship**, returning busy/free slots only (DPDP minimization) — preserving the compact `busyByDate` shape consumed by `components/free-time-dialog.tsx`.

## Critical files

`components/session-provider.tsx`, `lib/session.ts`, `lib/supabase/server.ts`, `lib/supabase/client.ts`, new `middleware.ts`, new sign-in + consent pages, all of `app/api/**`.
