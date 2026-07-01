-- ============================================================================
--  KampusSchedule — COMPLETE DATABASE SETUP (one file, one paste)
-- ----------------------------------------------------------------------------
--  Open your Supabase project → SQL Editor → New query → paste ALL of this →
--  Run. That's the entire database setup. Nothing else to do here.
--
--  This is every migration (001–024) concatenated in order. Every statement is
--  idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP-then-CREATE POLICY), so
--  running it on a fresh project just works, and re-running it is safe.
--
--  Regenerate after adding a migration:
--    cd supabase && cat migrations/*.sql > /tmp/m && (print header) ...
--    (or just append the new migration file to this one).
-- ============================================================================




-- ======================================================================
-- 001_initial_schema.sql
-- ======================================================================

-- Master course list synced from Google Sheet
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_code TEXT NOT NULL,
  course_name TEXT NOT NULL,
  instructor TEXT,
  day_of_week TEXT,        -- MON | TUE | WED | THU | FRI | SAT
  start_time TEXT,         -- 09:00
  end_time TEXT,           -- 10:30
  room TEXT,
  credits TEXT,
  sheet_tab TEXT NOT NULL, -- Sheet1 or Sheet2
  sheet_row_index INT,
  is_cancelled BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(course_code, sheet_tab, day_of_week, start_time)
);

-- Anonymous users (no sign-in required)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_code TEXT UNIQUE NOT NULL,
  display_name TEXT,
  push_subscription JSONB,
  notify_push BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now()
);

-- Google OAuth tokens (for users who link college account to view sheet)
CREATE TABLE IF NOT EXISTS user_google_tokens (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Per-user elective selections
CREATE TABLE IF NOT EXISTS user_courses (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);

-- Friend graph (no account required; just share codes)
CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  friend_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',  -- pending | accepted
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, friend_id),
  CHECK (user_id != friend_id)
);

-- In-app notification log per user
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL,   -- cancelled | rescheduled | room_change | added | removed
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sync audit log (stores last raw snapshot for diffing; trimmed to last 5 rows)
CREATE TABLE IF NOT EXISTS sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synced_at TIMESTAMPTZ DEFAULT now(),
  status TEXT,          -- success | error
  rows_added INT DEFAULT 0,
  rows_modified INT DEFAULT 0,
  rows_removed INT DEFAULT 0,
  error_message TEXT,
  raw_snapshot JSONB
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_courses_user ON user_courses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_courses_course ON user_courses(course_id);
CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_courses_tab ON courses(sheet_tab);
CREATE INDEX IF NOT EXISTS idx_courses_day ON courses(day_of_week);


-- ======================================================================
-- 002_add_area.sql
-- ======================================================================

ALTER TABLE courses ADD COLUMN IF NOT EXISTS area TEXT;
CREATE INDEX IF NOT EXISTS idx_courses_area ON courses(area);


-- ======================================================================
-- 003_overhaul.sql
-- ======================================================================

-- Overhaul migration: common events, per-type notification prefs, Google Calendar sync.

-- ── Courses: common/all-section events (exams, etc.) ─────────────────────────
ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_common BOOLEAN DEFAULT false;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS event_kind TEXT DEFAULT 'class'; -- class | exam | common
CREATE INDEX IF NOT EXISTS idx_courses_common ON courses(is_common) WHERE is_common = true;

-- ── Users: per-type notification preferences (match Settings checkboxes) ──────
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_cancelled BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_rescheduled BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_room BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_daily_summary BOOLEAN DEFAULT true;

-- ── Per-user Google Calendar OAuth (separate from admin sheet tokens) ─────────
CREATE TABLE IF NOT EXISTS user_calendar_tokens (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  target_calendar_id TEXT DEFAULT 'primary',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Map of pushed Google Calendar events for reconciliation ───────────────────
CREATE TABLE IF NOT EXISTS calendar_event_map (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  gcal_event_id TEXT NOT NULL,
  PRIMARY KEY (user_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_calendar_event_map_user ON calendar_event_map(user_id);

-- notifications.type is free TEXT — 'schedule_update' needs no schema change.


-- ======================================================================
-- 004_date_based.sql
-- ======================================================================

-- Date-based schedule: each session is tied to a real calendar date from the sheet,
-- not a recurring weekday. This lets the app mirror the Excel sheet 1:1
-- (e.g. a given Monday can differ from another Monday; some days have no classes).

ALTER TABLE courses ADD COLUMN IF NOT EXISTS session_date DATE;

-- The old uniqueness (code, tab, day_of_week, start_time) collapsed every week into one.
-- Drop it and key on the actual date instead.
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_course_code_sheet_tab_day_of_week_start_time_key;

CREATE UNIQUE INDEX IF NOT EXISTS courses_uniq_session
  ON courses(course_code, sheet_tab, session_date, start_time);

CREATE INDEX IF NOT EXISTS idx_courses_session_date ON courses(session_date);


-- ======================================================================
-- 005_enroll_by_course.sql
-- ======================================================================

-- Enrollment by course_code (not per-session-id).
-- The date-based model stores one courses row per session, so a course has many rows.
-- Enrolling/among those client-side hit PostgREST's 1000-row cap, which silently dropped
-- later sessions (schedule looked wrong from mid-July on). These functions do it in one
-- server-side statement with no row limit.

-- Add every session of a course to a user's picks.
CREATE OR REPLACE FUNCTION pick_course(p_user uuid, p_code text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO user_courses (user_id, course_id)
  SELECT p_user, id FROM courses WHERE course_code = p_code
  ON CONFLICT DO NOTHING;
$$;

-- Remove every session of a course from a user's picks.
CREATE OR REPLACE FUNCTION unpick_course(p_user uuid, p_code text)
RETURNS void LANGUAGE sql AS $$
  DELETE FROM user_courses
  WHERE user_id = p_user
    AND course_id IN (SELECT id FROM courses WHERE course_code = p_code);
$$;

-- One representative row per course_code (for the picker catalog) — small and complete,
-- so the picker never misses a course that only appears late in the term.
CREATE OR REPLACE FUNCTION course_catalog()
RETURNS SETOF courses LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (course_code) *
  FROM courses
  WHERE is_common = false
  ORDER BY course_code, session_date;
$$;


-- ======================================================================
-- 006_change_tracking.sql
-- ======================================================================

-- Track WHAT changed on each session so the app can subtly highlight it and explain it.
-- Set by the sync diff when a session is added / moved / re-roomed / edited / cancelled.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS change_kind TEXT;       -- added|moved|rescheduled|room_change|updated|cancelled
ALTER TABLE courses ADD COLUMN IF NOT EXISTS change_note TEXT;       -- human-readable "what changed"
ALTER TABLE courses ADD COLUMN IF NOT EXISTS last_changed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_courses_last_changed ON courses(last_changed_at);


-- ======================================================================
-- 007_attendance_notes.sql
-- ======================================================================

-- Attendance: one row per (user, session). status = present | absent. No row = unmarked.
CREATE TABLE IF NOT EXISTS attendance (
  user_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  status    TEXT NOT NULL,            -- present | absent
  marked_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);

-- Notes / reminders: one note per (user, session). Reminder fires the evening before.
CREATE TABLE IF NOT EXISTS notes (
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  course_id    UUID REFERENCES courses(id) ON DELETE CASCADE,
  session_date DATE,
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_date ON notes(session_date);


-- ======================================================================
-- 008_import_code.sql
-- ======================================================================

-- Separate PRIVATE profile-import code from the PUBLIC friends share code.
-- share_code stays public (used to add friends); import_code is private (restores a profile).
ALTER TABLE users ADD COLUMN IF NOT EXISTS import_code TEXT;

-- Backfill existing users with a random private code.
UPDATE users
SET import_code = upper(substr(md5(random()::text || id::text || clock_timestamp()::text), 1, 8))
WHERE import_code IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_import_code ON users(import_code);


-- ======================================================================
-- 009_notification_dedup.sql
-- ======================================================================

-- Make schedule-change notifications idempotent at the database level.
--
-- Three triggers call /api/sync (Apps Script onChange — which fires several times per
-- edit — plus the cron fallback). Each run diffs against the last snapshot, and the new
-- snapshot is only written at the END of a run, so overlapping/rapid syncs all compute the
-- SAME diff and each used to insert + push the SAME alerts. App-level "have I sent this
-- recently?" checks are check-then-act and lose the race under true concurrency.
--
-- Fix: a stable per-user dedup_key + a partial UNIQUE index. notify.ts inserts with
-- ON CONFLICT DO NOTHING and pushes ONLY for rows that were actually inserted, so a given
-- change yields exactly one alert + one push no matter how many syncs race.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedup_key text;

-- Partial unique index: only constrains rows that carry a key, so historical rows
-- (dedup_key IS NULL) are untouched.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedup
  ON notifications (user_id, dedup_key)
  WHERE dedup_key IS NOT NULL;


-- ======================================================================
-- 010_user_sessions_rpc.sql
-- ======================================================================

-- One-round-trip resolution of a user's current sessions.
--
-- getUserSessions previously did TWO sequential queries (pick the user's course codes, then
-- fetch every session for those codes). With the database a region away from the functions
-- (~150ms each way), that doubled the latency of the most-loaded endpoints (Home, Schedule,
-- Courses, Friends, attendance). This RPC does the whole thing server-side in one query and
-- returns all rows (no PostgREST 1000-row cap).

CREATE OR REPLACE FUNCTION user_sessions(p_user uuid)
RETURNS SETOF courses
LANGUAGE sql STABLE AS $$
  SELECT c.*
  FROM courses c
  WHERE c.course_code IN (
    SELECT DISTINCT c2.course_code
    FROM user_courses uc
    JOIN courses c2 ON c2.id = uc.course_id
    WHERE uc.user_id = p_user
  );
$$;


-- ======================================================================
-- 011_year_sections.sql
-- ======================================================================

-- 1st-year (section timetables) alongside 2nd-year (electives).
--
-- A user is ONE year: year 2 (picks electives, resolved by course code — existing behaviour)
-- or year 1 (belongs to a section A–H/LSM/FIN and gets that section's whole timetable).
-- Courses now carry a `year` + a `source_key` (which sheet they came from) so the sync can
-- scope its per-source reconcile and notifications. All new columns default to the 2nd-year
-- world, so existing data/users are untouched.

ALTER TABLE courses  ADD COLUMN IF NOT EXISTS year       smallint DEFAULT 2;
ALTER TABLE courses  ADD COLUMN IF NOT EXISTS source_key text     DEFAULT 'y2';
ALTER TABLE users    ADD COLUMN IF NOT EXISTS year       smallint;        -- null = unset → 2nd-year
ALTER TABLE users    ADD COLUMN IF NOT EXISTS section    text;            -- 1st-year section, else null
ALTER TABLE sync_log ADD COLUMN IF NOT EXISTS source_key text     DEFAULT 'y2';

CREATE INDEX IF NOT EXISTS idx_courses_year_section ON courses(year, sheet_tab);

-- Year-aware session resolution. The two branches are mutually exclusive (a user is one year),
-- and each is year-scoped so a code/section shared across years can never bleed in.
CREATE OR REPLACE FUNCTION user_sessions(p_user uuid)
RETURNS SETOF courses
LANGUAGE sql STABLE AS $$
  -- 1st year: the user's whole section timetable.
  SELECT c.*
  FROM courses c, users u
  WHERE u.id = p_user AND u.year = 1 AND u.section IS NOT NULL
    AND c.year = 1 AND c.sheet_tab = u.section
  UNION ALL
  -- 2nd year (or unset): the user's picked electives, year-2 only.
  SELECT c.*
  FROM courses c
  WHERE COALESCE((SELECT year FROM users WHERE id = p_user), 2) <> 1
    AND c.year = 2
    AND c.course_code IN (
      SELECT DISTINCT c2.course_code
      FROM user_courses uc JOIN courses c2 ON c2.id = uc.course_id
      WHERE uc.user_id = p_user
    );
$$;

-- The 2nd-year elective catalog must only show year-2 courses now that year-1 rows exist.
CREATE OR REPLACE FUNCTION course_catalog()
RETURNS SETOF courses
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (course_code) *
  FROM courses
  WHERE is_common = false AND year = 2
  ORDER BY course_code, session_date;
$$;


-- ======================================================================
-- 012_auth.sql
-- ======================================================================

-- Phase 1 — Authentication: link app users to Supabase Auth identities + roles.
--
-- On first Google sign-in, lib/user.ts inserts a `users` row whose `id` equals
-- the Supabase Auth user id (auth.uid()), so the existing app keeps working with
-- a real, verified identity instead of a random localStorage UUID.
--
-- Paste this in the Supabase dashboard → SQL Editor → Run (the CLI can't reach
-- this DB from the dev network). Idempotent — safe to re-run.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role  text NOT NULL DEFAULT 'student'; -- 'student' | 'admin'

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;


-- ======================================================================
-- 013_enrollments.sql
-- ======================================================================

-- Phase 2 — Normalize enrollment: one row per (user, course) instead of one per session.
--
-- WHY: `user_courses` stores enrollment PER SESSION — picking a course inserts a row for
-- every one of its dated sessions, so it balloons (52,839 rows for ~1,000 users). Enrollment
-- is already RESOLVED by course_code everywhere (user_sessions / pick_course), so the per-session
-- rows carry no information the code uses. `enrollments` records the pick once, by code, which:
--   • collapses ~52,839 rows → ~5,000–6,000 (~10× smaller), and
--   • is the shape the roster needs (email → list of course codes).
--
-- This keeps the `courses` table (one row per session) unchanged; the master/sessions split is a
-- separate later migration. The RPC return contracts are identical, so app/UI code is unchanged
-- apart from the two read paths that listed picks directly (lib/enrollment.ts, lib/notify.ts).
--
-- Paste in Supabase dashboard → SQL Editor → Run (the CLI can't reach this DB from the dev
-- network). Idempotent — safe to re-run. `user_courses` is left in place (dormant) for rollback.

-- ── enrollment by course, year-scoped (year-1 students get their whole section, not picks) ──
CREATE TABLE IF NOT EXISTS enrollments (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL,
  year        SMALLINT NOT NULL DEFAULT 2,  -- the elective year this pick belongs to
  added_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, course_code)
);
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_code ON enrollments(course_code);

-- One-time backfill from the per-session table: collapse to DISTINCT codes per user.
-- Safe to re-run (ON CONFLICT DO NOTHING). Year comes from the resolved course row.
INSERT INTO enrollments (user_id, course_code, year)
SELECT DISTINCT uc.user_id, c.course_code, COALESCE(c.year, 2)
FROM user_courses uc
JOIN courses c ON c.id = uc.course_id
ON CONFLICT (user_id, course_code) DO NOTHING;

-- ── Pick / unpick now write ONE enrollment row (by code) instead of one per session ──────────
CREATE OR REPLACE FUNCTION pick_course(p_user uuid, p_code text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO enrollments (user_id, course_code, year)
  SELECT p_user, p_code, COALESCE((SELECT year FROM courses WHERE course_code = p_code AND year = 2 LIMIT 1), 2)
  ON CONFLICT (user_id, course_code) DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION unpick_course(p_user uuid, p_code text)
RETURNS void LANGUAGE sql AS $$
  DELETE FROM enrollments WHERE user_id = p_user AND course_code = p_code;
$$;

-- ── Resolve a user's current sessions from `enrollments` (year-2) — return shape UNCHANGED ────
-- Year-1 branch (whole-section timetable) is untouched; the two branches stay mutually exclusive
-- and year-scoped so a code/section shared across years can never bleed in.
CREATE OR REPLACE FUNCTION user_sessions(p_user uuid)
RETURNS SETOF courses
LANGUAGE sql STABLE AS $$
  -- 1st year: the user's whole section timetable.
  SELECT c.*
  FROM courses c, users u
  WHERE u.id = p_user AND u.year = 1 AND u.section IS NOT NULL
    AND c.year = 1 AND c.sheet_tab = u.section
  UNION ALL
  -- 2nd year (or unset): the user's picked electives, year-2 only, resolved by code so sessions
  -- added to the sheet after the pick still belong to the user.
  SELECT c.*
  FROM courses c
  WHERE COALESCE((SELECT year FROM users WHERE id = p_user), 2) <> 1
    AND c.year = 2
    AND c.course_code IN (SELECT e.course_code FROM enrollments e WHERE e.user_id = p_user);
$$;


-- ======================================================================
-- 014_rls.sql
-- ======================================================================

-- Phase 2 — Row Level Security on every table.
--
-- Today all server routes use the SERVICE-ROLE key, which BYPASSES RLS by design (sync, cron,
-- admin, and — until Phase 1's route-auth migration finishes — the per-user API routes too). So
-- enabling RLS now is harmless to the running app and is pure defense-in-depth: the moment a route
-- switches to the cookie-aware client (runs AS the signed-in user, lib/supabase/server.ts
-- createClient), ownership is enforced by the database instead of by a trusted `userId` param.
--
-- Identity model: `users.id = auth.uid()` (migration 012), so policies key on auth.uid() directly.
-- A later migration that introduces a dedicated `profiles` table can re-point these unchanged.
--
-- Paste in Supabase dashboard → SQL Editor → Run. Idempotent (DROP POLICY IF EXISTS before
-- CREATE; ENABLE RLS is a no-op if already on). After applying, smoke-test sign-in + a schedule
-- load; anything that 403s is a route still needing the cookie client (expected, tracked in docs).

-- ── admin check (SECURITY DEFINER avoids RLS recursion when read from a policy ON users) ───────
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin');
$$;

-- ── profiles / identity: users ────────────────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_select_self_or_admin ON users;
CREATE POLICY users_select_self_or_admin ON users FOR SELECT
  USING (auth.uid() = id OR is_admin());
DROP POLICY IF EXISTS users_insert_self ON users;
CREATE POLICY users_insert_self ON users FOR INSERT
  WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS users_update_self ON users;
CREATE POLICY users_update_self ON users FOR UPDATE
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ── reference data: courses (any authenticated user may read; only admin/service writes) ───────
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS courses_read_authenticated ON courses;
CREATE POLICY courses_read_authenticated ON courses FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS courses_write_admin ON courses;
CREATE POLICY courses_write_admin ON courses FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- ── sync audit log: admin-only reads (service role writes, bypassing RLS) ──────────────────────
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sync_log_admin_read ON sync_log;
CREATE POLICY sync_log_admin_read ON sync_log FOR SELECT USING (is_admin());

-- ── user-owned tables: auth.uid() = user_id for everything ─────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'enrollments','user_courses','attendance','notes','notifications',
    'user_calendar_tokens','calendar_event_map','user_google_tokens'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_owner', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);',
      t || '_owner', t);
  END LOOP;
END $$;

-- ── friendships: both endpoints may READ the edge; only the owner may modify it ────────────────
-- (A friend's actual schedule/free-time is exposed only via a gated SECURITY DEFINER RPC, never
--  by reading their rows directly.)
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS friendships_read_either ON friendships;
CREATE POLICY friendships_read_either ON friendships FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = friend_id);
DROP POLICY IF EXISTS friendships_modify_owner ON friendships;
CREATE POLICY friendships_modify_owner ON friendships FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ======================================================================
-- 015_roster.sql
-- ======================================================================

-- Phase 3 (pulled forward) — Roster-driven enrollment.
--
-- Students no longer self-pick. The admin uploads two rosters (an .xlsx each):
--   • year-1 roster: email → section  (the student gets that section's whole timetable)
--   • year-2 roster: email → elective course codes  (one `enrollments` row per code)
-- The roster is stored here keyed by email, then APPLIED to a user:
--   • immediately, for emails that already have a `users` row, and
--   • on first sign-in, via lib/user.ts (so order of upload vs sign-in doesn't matter).
--
-- `codes` is the year-2 elective list (NULL/empty for year-1 rows); `section` is the year-1
-- section (NULL for year-2 rows). One row per email — re-uploading replaces a student's row.
--
-- Paste in Supabase dashboard → SQL Editor → Run. Idempotent.

CREATE TABLE IF NOT EXISTS roster (
  email      TEXT PRIMARY KEY,              -- normalized (lowercased) college email
  year       SMALLINT NOT NULL,            -- 1 | 2
  section    TEXT,                          -- year-1 only (A..H / LSM / FIN)
  codes      TEXT[] NOT NULL DEFAULT '{}',  -- year-2 only: elective course codes
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- Apply a roster row to a user (called at upload time for existing users, and on sign-in).
-- Year-1: set year/section, clear elective enrollments. Year-2: set year, REPLACE enrollments
-- with the roster's codes (so a re-upload is authoritative). SECURITY DEFINER so it can run from
-- the (RLS-bound) cookie client on sign-in.
CREATE OR REPLACE FUNCTION apply_roster_to_user(p_user uuid, p_email text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r roster%ROWTYPE;
BEGIN
  SELECT * INTO r FROM roster WHERE email = lower(p_email);
  IF NOT FOUND THEN RETURN; END IF;

  IF r.year = 1 THEN
    UPDATE users SET year = 1, section = r.section WHERE id = p_user;
    DELETE FROM enrollments WHERE user_id = p_user;          -- year-1 has no electives
  ELSE
    UPDATE users SET year = 2 WHERE id = p_user;
    DELETE FROM enrollments WHERE user_id = p_user;          -- replace, roster is authoritative
    INSERT INTO enrollments (user_id, course_code, year)
    SELECT p_user, code, 2 FROM unnest(r.codes) AS code
    WHERE code IS NOT NULL AND length(trim(code)) > 0
    ON CONFLICT (user_id, course_code) DO NOTHING;
  END IF;
END $$;

-- RLS: only admin/service touches the roster (it holds every student's enrollment).
ALTER TABLE roster ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS roster_admin_all ON roster;
CREATE POLICY roster_admin_all ON roster FOR ALL USING (is_admin()) WITH CHECK (is_admin());


-- ======================================================================
-- 016_site_content.sql
-- ======================================================================

-- Phase 3 — Bus & Mess as admin-editable content (paste-import).
--
-- Bus/mess are tiny, admin-managed blobs pasted as JSON (the admin runs a prompt + the source
-- PDF through any free chat tool, then pastes the JSON back). We store them as-is so the exact
-- current shapes are preserved — bus trips `{time,min,from,to[],maingate}` and mess
-- `{breakfast,lunch,dinner}` each `{veg[],special?[]}` — and `lib/bus.ts`/`lib/mess.ts` stay the
-- built-in FALLBACK if no row is set. One row per key ('bus' | 'mess').
--
-- Paste in Supabase dashboard → SQL Editor → Run. Idempotent.

CREATE TABLE IF NOT EXISTS site_content (
  key        TEXT PRIMARY KEY,           -- 'bus' | 'mess'
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Readable by any authenticated user (it's public info, served via the API); writable by admin only.
ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS site_content_read ON site_content;
CREATE POLICY site_content_read ON site_content FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS site_content_admin_write ON site_content;
CREATE POLICY site_content_admin_write ON site_content FOR ALL USING (is_admin()) WITH CHECK (is_admin());


-- ======================================================================
-- 017_admin_poweruser.sql
-- ======================================================================

-- Phase 6 — Admin as a "poweruser" + a year-scoped course catalog.
--
-- 1) user_sessions(p_user): an ADMIN now resolves to EVERY course session (both years), so the
--    admin's Home / Schedule / My Courses show the whole timetable without any enrollment — they
--    are effectively enrolled in everything. Non-admin branches are unchanged (1st-year section,
--    2nd-year picks) but explicitly exclude admins so the branches stay mutually exclusive.
-- 2) course_catalog(p_year): a year-parameterised overload so the Courses tab can list ALL courses
--    of either year (one representative row per code, dodging the 1000-row cap). The original
--    no-arg course_catalog() (year 2) is kept for the existing 2nd-year picker callers.
--
-- Paste in Supabase dashboard → SQL Editor → Run. Idempotent (CREATE OR REPLACE).

-- ── 1) admin-aware session resolution ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION user_sessions(p_user uuid)
RETURNS SETOF courses
LANGUAGE sql STABLE AS $$
  -- Admin: poweruser — every (non-common) course session, both years, no enrollment needed.
  SELECT c.*
  FROM courses c
  WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = p_user AND u.role = 'admin')
    AND c.is_common = false
  UNION ALL
  -- 1st year (non-admin): the user's whole section timetable.
  SELECT c.*
  FROM courses c, users u
  WHERE u.id = p_user AND u.role IS DISTINCT FROM 'admin'
    AND u.year = 1 AND u.section IS NOT NULL
    AND c.year = 1 AND c.sheet_tab = u.section
  UNION ALL
  -- 2nd year (non-admin, or unset): picked electives, year-2 only, resolved by code so sessions
  -- added to the sheet after the pick still belong to the user.
  SELECT c.*
  FROM courses c
  WHERE (SELECT role FROM users WHERE id = p_user) IS DISTINCT FROM 'admin'
    AND COALESCE((SELECT year FROM users WHERE id = p_user), 2) <> 1
    AND c.year = 2
    AND c.course_code IN (SELECT e.course_code FROM enrollments e WHERE e.user_id = p_user);
$$;

-- ── 2) year-parameterised catalog (one row per course_code for the given year) ──────────────────
CREATE OR REPLACE FUNCTION course_catalog(p_year smallint)
RETURNS SETOF courses
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (course_code) *
  FROM courses
  WHERE is_common = false AND year = p_year
  ORDER BY course_code, session_date;
$$;


-- ======================================================================
-- 018_roster_authoritative.sql
-- ======================================================================

-- Phase 6 — Roster is the source of truth; prune students who have left.
--
-- The admin uploads, each term, two schedules (Y1, Y2) and two rosters (Y1, Y2). The two rosters
-- TOGETHER are the authoritative list of current students. A student in EITHER roster is kept and
-- mapped to this term's courses (unchanged — see apply_roster_to_user / user_sessions). A student in
-- NEITHER roster has left and is removed (admin-confirmed); the existing ON DELETE CASCADE FKs then
-- clear that user's enrollments, friendships, notes, attendance, notifications, and tokens.
--
-- Courses already self-replace per source on each schedule upload (lib/sync-core.ts), so this only
-- touches the roster + a guarded prune. Paste in Supabase dashboard → SQL Editor → Run. Idempotent.

-- ── 1) roster becomes authoritative: replace a whole YEAR's slice atomically ────────────────────
-- Previously the roster was an additive upsert (absent emails lingered). Now uploading a year's
-- roster REPLACES that year entirely, so `roster` always reflects exactly the current students.
-- Atomic (DELETE+INSERT in one statement scope): a half-applied roster would make the prune below
-- mistake a whole cohort for "departed".
CREATE OR REPLACE FUNCTION replace_roster_year(p_year smallint, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  DELETE FROM roster WHERE year = p_year;
  INSERT INTO roster (email, year, section, codes, uploaded_at)
  SELECT lower(r.email), p_year, r.section, COALESCE(r.codes, '{}'::text[]), now()
  FROM jsonb_to_recordset(p_rows) AS r(email text, section text, codes text[])
  WHERE r.email IS NOT NULL AND length(trim(r.email)) > 0;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ── 2) who has left: students present in NO current roster row (admins are never on the roster) ──
CREATE OR REPLACE VIEW departed_students AS
  SELECT u.*
  FROM users u
  WHERE u.role <> 'admin'
    AND u.email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM roster r WHERE r.email = u.email);

-- ── 3) prune departed students (returns count removed). Hard guard: an EMPTY roster must never ──
-- wipe everyone (e.g. called before any roster upload). The admin UI adds preview + confirmation
-- and warns on large/partial removals; this is the last-line safety in the DB itself.
CREATE OR REPLACE FUNCTION prune_departed_students()
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  IF (SELECT count(*) FROM roster) = 0 THEN
    RETURN 0;
  END IF;
  WITH del AS (
    DELETE FROM users WHERE id IN (SELECT id FROM departed_students) RETURNING 1
  )
  SELECT count(*) INTO n FROM del;
  RETURN n;
END $$;


-- ======================================================================
-- 019_google_integration.sql
-- ======================================================================

-- Phase 4/5 — Google integration moves OUT of env and INTO the database.
--
-- WHY: the schedule's Google Sheet is a BRAND-NEW sheet every term (Y1 and Y2), and reading it used
-- to require a hand-managed `GOOGLE_REFRESH_TOKEN` + `GOOGLE_SHEET_ID` in env — both forcing a
-- developer at every term/handover. Now:
--   • `google_integration` — a single server-only row holding the app's Google OAuth client
--     (client id/secret/redirect, set ONCE at handover) and the admin's stored `sheet_refresh_token`
--     (captured when an admin authorizes Google sign-in once). The token lets on-demand AND cron
--     sync read sheets headlessly. SERVICE-ROLE ONLY: RLS is enabled with NO policy, so the
--     anon/authenticated roles are denied even though they hold table grants — only the
--     service-role client (which bypasses RLS) reads/writes it. Secrets never reach a browser.
--   • `schedule_sources` — the admin-pasted Google Sheet id per source slot (y2, y1-AH, …). The
--     admin pastes the new term's link; sync resolves the id from here. Ids are view-access ("not a
--     secret"), so authenticated may READ (like courses/site_content); only admin/service writes.
--
-- Paste in Supabase dashboard → SQL Editor → Run. Idempotent.

-- ── google_integration: server-only secrets + the admin's sheet refresh token ──────────────────
CREATE TABLE IF NOT EXISTS google_integration (
  id                  BOOLEAN PRIMARY KEY DEFAULT true,  -- singleton: the one config row (id = true)
  client_id           TEXT,
  client_secret       TEXT,
  redirect_uri        TEXT,
  sheet_refresh_token TEXT,
  authorized_email    TEXT,                              -- which admin granted the sheet scope
  updated_at          TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT google_integration_singleton CHECK (id)
);

-- RLS on, NO policy → anon/authenticated are denied entirely; only service_role (RLS-bypass) reaches
-- it. This is how we keep the client secret + refresh token off every browser-reachable path.
ALTER TABLE google_integration ENABLE ROW LEVEL SECURITY;

-- ── schedule_sources: the admin-pasted sheet id per source slot ─────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_sources (
  source_key TEXT PRIMARY KEY,             -- matches SHEET_SOURCES[].key ('y2' | 'y1-AH' | …)
  sheet_id   TEXT NOT NULL,
  sheet_url  TEXT,                          -- the original pasted link, for display
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by TEXT
);

ALTER TABLE schedule_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schedule_sources_read ON schedule_sources;
CREATE POLICY schedule_sources_read ON schedule_sources FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS schedule_sources_admin_write ON schedule_sources;
CREATE POLICY schedule_sources_admin_write ON schedule_sources FOR ALL USING (is_admin()) WITH CHECK (is_admin());


-- ======================================================================
-- 020_departed_view_security_invoker.sql
-- ======================================================================

-- Phase 6 fix — make `departed_students` a SECURITY INVOKER view (Supabase linter: "Security
-- Definer View").
--
-- A Postgres view created before PG15, or without `security_invoker`, runs with the PRIVILEGES and
-- RLS of the view's OWNER (definer) rather than the role that queries it. Supabase flags this as an
-- error because it can leak owner-visible rows (here: `users`) to a less-privileged caller who only
-- has SELECT on the view.
--
-- In this app the view is only ever read via the service-role client (lib/reconcile.ts —
-- previewDeparted / prune_departed_students, behind requireAdmin()), which bypasses RLS anyway, so
-- flipping to invoker changes nothing operationally. It simply makes the view honour the CALLER's
-- permissions/RLS, closing the lint finding and ensuring a future low-privilege reader can't use the
-- view to sidestep the `users` RLS policies.
--
-- Paste in Supabase dashboard → SQL Editor → Run. Idempotent.

ALTER VIEW public.departed_students SET (security_invoker = on);


-- ======================================================================
-- 021_institution_profile.sql
-- ======================================================================

-- Phase 6 — Institution Profile: the per-deployment vocabulary that used to be HARDCODED.
--
-- WHY: change-tracking LOGIC is generic (diff.ts derives moved/rescheduled/room/added/removed from
-- slot structure, no institution knowledge). But the change-tracking VOCABULARY was baked into code
-- for IIM Kozhikode: the colour→meaning mapping (red=cancelled, green=added, amber=event), the
-- course catalog (area map, cross-sheet aliases, programme qualifiers), the section/division layout
-- shapes, the venue edge-cases (e.g. "YMHC MN Common Room"), and the lunch/exam keyword lists.
-- A different institution (IIM-C/B) has different colours, courses and sections. This table lets an
-- ADMIN configure all of that from the dashboard (Institution Profile page) with NO redeploy.
--
-- SHAPE: one row per concern (key → JSONB), exactly like `site_content` (bus/mess). The app's
-- `lib/institution-profile.ts#DEFAULT_PROFILE` holds the current IIM-K values as the built-in
-- FALLBACK, so an empty table behaves IDENTICALLY to today and nothing breaks pre-config. A saved
-- row OVERRIDES that concern. Keys: 'colors' | 'catalog' | 'sections' | 'overrides' | 'keywords'.
--
-- ACCESS: the profile drives how schedules are parsed/displayed (areas, sections) — view-access,
-- not a secret — so authenticated may READ (like courses/site_content); only admin/service writes.
--
-- Paste in Supabase dashboard → SQL Editor → Run. Idempotent.

CREATE TABLE IF NOT EXISTS institution_profile (
  key        TEXT PRIMARY KEY,            -- 'colors' | 'catalog' | 'sections' | 'overrides' | 'keywords'
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by TEXT
);

ALTER TABLE institution_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS institution_profile_read ON institution_profile;
CREATE POLICY institution_profile_read ON institution_profile FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS institution_profile_admin_write ON institution_profile;
CREATE POLICY institution_profile_admin_write ON institution_profile FOR ALL USING (is_admin()) WITH CHECK (is_admin());


-- ======================================================================
-- 022_roster_upsert_invalid_cleanup.sql
-- ======================================================================

-- Phase 6.1 — cross-year roster moves, a both-years prune guard, and invalid-account cleanup.
--
-- Three fixes that came out of operating the roster-authoritative prune (migration 018):
--   1) replace_roster_year must tolerate a student MOVING between years (same email).
--   2) the prune must refuse a PARTIAL upload (only one year's roster present), not just a totally
--      empty roster — otherwise uploading one year wipes the other year's whole cohort.
--   3) email-less accounts (test/seed junk) can never match a roster, so the roster prune is blind to
--      them; give the admin a separate, explicit way to remove them.
--
-- Paste in Supabase dashboard → SQL Editor → Run. Idempotent.

-- ── 1) replace_roster_year: upsert by email so a promoted Y1→Y2 student moves cleanly ───────────
-- `roster.email` is the PRIMARY KEY. A student who finishes year 1 re-registers for year 2 under the
-- SAME email; their old year-1 row still exists, so the plain INSERT collided on the PK and the whole
-- upload failed. ON CONFLICT moves the email to the new year instead of erroring.
CREATE OR REPLACE FUNCTION replace_roster_year(p_year smallint, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  DELETE FROM roster WHERE year = p_year;
  INSERT INTO roster (email, year, section, codes, uploaded_at)
  SELECT lower(r.email), p_year, r.section, COALESCE(r.codes, '{}'::text[]), now()
  FROM jsonb_to_recordset(p_rows) AS r(email text, section text, codes text[])
  WHERE r.email IS NOT NULL AND length(trim(r.email)) > 0
  ON CONFLICT (email) DO UPDATE
    SET year = EXCLUDED.year, section = EXCLUDED.section,
        codes = EXCLUDED.codes, uploaded_at = EXCLUDED.uploaded_at;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ── 2) prune_departed_students: refuse a PARTIAL roster, not only a totally empty one ───────────
-- The two rosters are uploaded at DIFFERENT times. If only one year is present, every student in the
-- not-yet-uploaded year looks "departed". Block the prune unless BOTH years have at least one row;
-- the admin UI additionally disables the button and warns. This supersedes migration 018's guard,
-- which only blocked a completely empty roster.
CREATE OR REPLACE FUNCTION prune_departed_students()
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  IF (SELECT count(*) FROM roster WHERE year = 1) = 0
     OR (SELECT count(*) FROM roster WHERE year = 2) = 0 THEN
    RETURN 0;  -- partial upload — never prune against an incomplete picture
  END IF;
  WITH del AS (
    DELETE FROM users WHERE id IN (SELECT id FROM departed_students) RETURNING 1
  )
  SELECT count(*) INTO n FROM del;
  RETURN n;
END $$;

-- ── 3) invalid (email-less) accounts: junk the roster prune can never reach ─────────────────────
-- A signed-in student ALWAYS carries a domain-gated email (auth/callback), so a NON-admin row with a
-- NULL/blank email is invalid — leftover test/seed data. `departed_students` deliberately skips NULL
-- emails (can't match a NULL against the roster), so these rows are a permanent blind spot. Give them
-- their own view + prune so the admin can clear them explicitly.
CREATE OR REPLACE VIEW invalid_users AS
  SELECT u.*
  FROM users u
  WHERE u.role <> 'admin'
    AND (u.email IS NULL OR length(trim(u.email)) = 0);

ALTER VIEW invalid_users SET (security_invoker = on);  -- honour the caller's RLS (see migration 020)

CREATE OR REPLACE FUNCTION prune_invalid_users()
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  WITH del AS (
    DELETE FROM users WHERE id IN (SELECT id FROM invalid_users) RETURNING 1
  )
  SELECT count(*) INTO n FROM del;
  RETURN n;
END $$;


-- ======================================================================
-- 023_roster_access_gate.sql
-- ======================================================================

-- Phase 6.2 — roster-gated app access.
--
-- The roster (both years together) is the authoritative list of current students (migration 018).
-- A non-admin whose email is in NO roster row has either left or was never enrolled and must not be
-- able to use the app — nor be silently re-created after the admin prunes them (see lib/user.ts,
-- which previously re-inserted a departed student on their next request, so "Review & remove" kept
-- listing the same person forever). This function is the single predicate the server uses to
-- allow/deny a signed-in non-admin (lib/access.ts → getOrCreateUser + getAuthedSession).
--
-- It mirrors prune_departed_students' BOTH-rosters guard (migration 022): access is DENIED only once
-- both years' rosters are present, so a partial / not-yet-uploaded roster never locks out a
-- legitimately enrolled student, and a brand-new deployment (no roster yet) lets everyone in until
-- the rosters are uploaded. Admin emails are env-driven (ADMIN_EMAILS), so the admin allowance is
-- applied in TS BEFORE this is called — admins are intentionally never on the roster.
--
-- SECURITY DEFINER so the (RLS-bound) cookie client can call it too: `roster` is admin/service-only
-- under RLS (migration 015), and this only ever returns a boolean, never roster rows.
--
-- Paste in Supabase dashboard → SQL Editor → Run. Idempotent (CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION has_roster_access(p_email text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_email IS NULL OR length(trim(p_email)) = 0 THEN false
    WHEN EXISTS (SELECT 1 FROM roster r WHERE r.email = lower(trim(p_email))) THEN true
    -- Not in roster: deny only when BOTH years are present (otherwise "departed" is
    -- indistinguishable from "their year's roster isn't uploaded yet").
    WHEN (SELECT count(*) FROM roster WHERE year = 1) > 0
     AND (SELECT count(*) FROM roster WHERE year = 2) > 0 THEN false
    ELSE true
  END
$$;


-- ======================================================================
-- 024_sheet_tab_division_only.sql
-- ======================================================================

-- Phase 6.3 — re-key year-2 (division-layout) sessions to the division code ALONE.
--
-- The parser (lib/sheets.ts) used to build a division session's `sheet_tab` as
-- "<programme-label> <division-code>", e.g. "PGP-29 D1". Since a class's diff identity is
-- `session_date + start_time + sheet_tab`, merely editing/reordering the programme header row
-- ("PGP-29" / "PGPFIN06" / "PGPLSM06") re-keyed EVERY class and the sync reported the whole
-- timetable as "Moved". The parser now keys on the division code alone ("D1"), i.e. the LAST/bottom
-- header row, ignoring any programme rows above it.
--
-- This migration brings EXISTING rows in line WITHOUT a delete+reinsert (which the sync's upsert
-- would otherwise do once the conflict key `course_code,sheet_tab,session_date,start_time` stops
-- matching) — so course IDs, and the attendance / notes / calendar rows that reference them, are
-- preserved. The division code is the last space-separated token; single-token tabs (year-1 section
-- letters like "A", and "COMMON") have no space and are left untouched.
--
-- It also clears the stale change-highlight tags on those rows: every current "Moved" tag is the
-- programme-row-edit artifact described above, so this gives a clean slate (a genuinely changed
-- class re-tags on the next real sync; the is_cancelled FLAG is independent and untouched).
--
-- Paste in Supabase dashboard → SQL Editor → Run. Idempotent (re-running is a no-op once no
-- sheet_tab contains a space).
UPDATE courses
SET sheet_tab   = regexp_replace(sheet_tab, '^.*\s', ''),  -- keep only the text after the last space
    change_kind = NULL,
    change_note = NULL,
    last_changed_at = NULL
WHERE sheet_tab ~ '\s';
