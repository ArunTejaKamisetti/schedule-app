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
