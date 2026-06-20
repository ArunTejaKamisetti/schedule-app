# Phase 2 — Database normalization + RLS

Stay on **Supabase free tier** (₹0 at this scale). New migrations `supabase/migrations/012+`: normalize, backfill, then **enable RLS on every table**.

## Normalized schema (course master + sessions)

- `faculty (id, name, abbr unique)`
- `rooms (id, name)` — optional lookup (or keep `room text` on sessions if not worth a table)
- `courses (id, code, name, credits, area, faculty_id → faculty, year, is_common, event_kind)` — **one row per course**; unique `(code, year)`.
- `course_sessions (id, course_id → courses, session_date, start_time, end_time, room, sheet_tab, source_key, is_cancelled, change_kind, change_note, last_changed_at, last_synced_at)` — **one row per session**; unique `(course_id, sheet_tab, session_date, start_time)`. Keep indexes equivalent to today's (`session_date`, `(year, sheet_tab)`, `last_changed_at`).
- `enrollments (user_id → profiles, course_id → courses)` — enrollment by course (resolves all sessions), replacing `user_courses`. Driven by the **roster**, not self-service.
- Per-user tables re-keyed to `profiles.id`: `attendance`, `notes`, `notifications`, `friendships`, `user_calendar_tokens`, `calendar_event_map`.
- `sync_log` unchanged in spirit.

**The real storage hog is `user_courses` (52,839 rows today).** Enrollment is stored **per session** — picking a course inserts one row for every one of its sessions — so 1,072 users blow up to ~49 enrollment rows each. Normalizing fixes this directly:

- A course with 30 sessions is 30 fully-duplicated rows in `courses` today; after, it's **1 `courses` row + 30 `course_sessions` rows** (name/instructor/credits stored once).
- `enrollments` references the **course master**, so each user has ~1 row per enrolled course instead of one per session: **~52,839 → ~5,000–6,000 rows (~10× smaller)**. The `user_sessions` RPC still expands a pick into its sessions at read time (it already resolves by code), so the UI is unchanged.

**Actual table sizes today (rows):** `user_courses` 52,839 · `attendance` 5,335 · `courses` 3,080 · `calendar_event_map` 2,738 · `notifications` 1,985 · `users` 1,072 · `friendships` 616 · `notes` 50. Wins in order: (1) normalize enrollment (biggest), (2) split `courses` into master + sessions, (3) retention-purge `attendance` / `notifications` as terms accumulate.

### Friendships (616 rows — not a storage concern)
Keep it a simple edge table re-keyed to `profiles`. The app has **no friend-request/accept flow**, so there is no pending state to model; if a vestigial `status` column exists, drop it. Optionally store one canonical row per pair (`user_low < user_high`) to halve rows if both directions are currently stored — but at this size it is not worth special handling. The real enrollment fix above is where the row savings are.

## Rewrite read/write paths to the new shape

- RPCs: update `user_sessions(uid)` to join `enrollments → courses → course_sessions` (keep the single-round-trip design that dodges the 1000-row PostgREST cap); update `course_catalog()` to read `courses`. Callers: `lib/enrollment.ts`.
- Sync: `lib/sheets.ts` + `app/api/sync/route.ts` upsert into `faculty`/`courses` **once** and `course_sessions` per session; diff/notify keys off `course_sessions`. `lib/sheets-config.ts` unchanged.
- Read APIs (`app/api/courses/route.ts`, `courses/user`, `friends/*`, `attendance/*`) updated to the joined shape; **keep response JSON stable** so UI (`schedule/page.tsx`, `today/page.tsx`, `courses/page.tsx`) needs minimal change.

## RLS (enable on all tables)

- `profiles`: select/update own row; admins select all (via an `is_admin()` helper reading the role claim).
- Reference data (`faculty`, `rooms`, `courses`, `course_sessions`, `bus`, `mess`): readable by any authenticated user; writable only by admin / service role.
- User-owned (`enrollments`, `attendance`, `notes`, `notifications`, `friendships`, tokens, push subs): `auth.uid() = user_id`. Cross-user reads (friend schedules) only via the gated `SECURITY DEFINER` RPC.
- Sync/cron continue to use the **service-role** key (server-only) and bypass RLS by design.

## Cost control

- **Egress** is the real lever at 2,400 users (shared schedule reads). Add edge `Cache-Control: s-maxage` to schedule read routes; per-user `user_sessions` stays tiny.
- **Retention purge** (extend `app/api/cron/*`): delete attendance/notes/notifications older than the configured window (previous terms). Keeps the DB under 500 MB and satisfies DPDP minimization.

## Critical files

`supabase/migrations/012+_*.sql` (normalize + backfill + RLS + RPC rewrites), `lib/enrollment.ts`, `lib/types.ts`, `lib/sheets.ts`, `app/api/sync/route.ts`, read APIs under `app/api/**`.

---

## Status / progress

### Done (code on `localdev`, migrations awaiting apply)
- **Enrollment normalized (the headline ~10× row win).** New `enrollments` table — one row per `(user, course_code)` instead of one per session. `pick_course` / `unpick_course` / `user_sessions` RPCs rewritten to it (return contracts **unchanged**, so UI/read code is untouched); `lib/enrollment.ts` and `lib/notify.ts` (2nd-year recipient resolution) read it. `user_courses` kept dormant for rollback. → `supabase/migrations/013_enrollments.sql`
- **RLS on every existing table + `is_admin()`** (defense-in-depth; service-role routes bypass it, so it's harmless now and becomes *enforced* the moment a route switches to the cookie-aware client). → `supabase/migrations/014_rls.sql`
- **Retention purge** (DPDP minimization): `lib/retention.ts` (pure, unit-tested) + `app/api/cron/retention/route.ts` deletes old-term `notes`/`attendance`/`notifications` beyond `RETENTION_DAYS` (default 180).
- Unit tests: `tests/enrollment.test.ts`, `tests/retention.test.ts`. `npm test` green (126), `npm run build` green.

### Remaining — `courses` → master + `course_sessions` split (deferred; needs a live DB to verify)
This is the high-risk half: `courses.id` is currently a **session** id that `attendance` / `notes` / `calendar_event_map` / `notifications.course_id` all FK to, and the entire sync pipeline writes per-session rows. The split can't be unit-verified blind — it needs a real Sheets sync + a signed-in app to confirm `/today` and `/schedule` render identically — so it's staged for a session where migrations can be applied and checked. Sub-plan:
1. Migration: create `faculty`, `courses` master (unique `(code, year)`), `course_sessions` (FK `course_id`, unique `(course_id, sheet_tab, session_date, start_time)`, keep today's indexes). Add `enrollments.course_id → courses` and backfill from `course_code`. Re-key `attendance`/`notes`/`calendar_event_map`/`notifications` to `course_sessions(id)`. Per **decision 4 (fresh start)** the per-user re-key is truncate-and-repopulate, not a careful backfill.
2. `user_sessions` RPC: change to `RETURNS TABLE(<old Course columns>)` joining `enrollments → courses → course_sessions`, **same flat shape** — keeps the seam so UI is unchanged.
3. Rewrite the sync upsert (`app/api/sync/route.ts` + `lib/sheets.ts`): upsert `faculty`/`courses` **once**, `course_sessions` per session; point diff/change-highlight at `course_sessions`.
4. Update the direct `courses` reads that mean "sessions": `lib/gcal.ts`, `app/api/courses/route.ts`, `app/api/calendar/route.ts`, `app/api/friends/free-time/route.ts`, `app/api/cron/daily-summary/route.ts`, `lib/notify.ts` (code→session-id map). Keep response JSON stable.
5. Edge `Cache-Control: s-maxage` on shared schedule read routes (egress is the real cost lever at 2,400 users).

### Apply order (Supabase dashboard → SQL Editor → Run)
`013_enrollments.sql` → `014_rls.sql`. Both idempotent. After 014, smoke-test sign-in + a schedule load; any 403 = a route still on the service client (expected until Phase 1 route-auth finishes). Then the dormant `user_courses` table can be dropped once `enrollments` is confirmed populated.
