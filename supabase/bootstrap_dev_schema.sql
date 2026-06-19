-- ============================================================================
-- DEV BOOTSTRAP SCHEMA — migrations 001–011 concatenated, in order.
-- Paste this whole file into the Supabase dashboard → SQL Editor → Run.
-- Use this when `supabase db push` can't connect (IPv6/port blocked).
-- All statements are idempotent (IF NOT EXISTS / CREATE OR REPLACE), so it is
-- safe to run on an empty project and safe to re-run.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- 001_initial_schema.sql
-- ─────────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────────
-- 002_add_area.sql
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE courses ADD COLUMN IF NOT EXISTS area TEXT;
CREATE INDEX IF NOT EXISTS idx_courses_area ON courses(area);


-- ─────────────────────────────────────────────────────────────────────────
-- 003_overhaul.sql
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_common BOOLEAN DEFAULT false;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS event_kind TEXT DEFAULT 'class'; -- class | exam | common
CREATE INDEX IF NOT EXISTS idx_courses_common ON courses(is_common) WHERE is_common = true;

ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_cancelled BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_rescheduled BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_room BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_daily_summary BOOLEAN DEFAULT true;

CREATE TABLE IF NOT EXISTS user_calendar_tokens (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  target_calendar_id TEXT DEFAULT 'primary',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar_event_map (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  gcal_event_id TEXT NOT NULL,
  PRIMARY KEY (user_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_calendar_event_map_user ON calendar_event_map(user_id);


-- ─────────────────────────────────────────────────────────────────────────
-- 004_date_based.sql
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE courses ADD COLUMN IF NOT EXISTS session_date DATE;

ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_course_code_sheet_tab_day_of_week_start_time_key;

CREATE UNIQUE INDEX IF NOT EXISTS courses_uniq_session
  ON courses(course_code, sheet_tab, session_date, start_time);

CREATE INDEX IF NOT EXISTS idx_courses_session_date ON courses(session_date);


-- ─────────────────────────────────────────────────────────────────────────
-- 005_enroll_by_course.sql
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pick_course(p_user uuid, p_code text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO user_courses (user_id, course_id)
  SELECT p_user, id FROM courses WHERE course_code = p_code
  ON CONFLICT DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION unpick_course(p_user uuid, p_code text)
RETURNS void LANGUAGE sql AS $$
  DELETE FROM user_courses
  WHERE user_id = p_user
    AND course_id IN (SELECT id FROM courses WHERE course_code = p_code);
$$;

CREATE OR REPLACE FUNCTION course_catalog()
RETURNS SETOF courses LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (course_code) *
  FROM courses
  WHERE is_common = false
  ORDER BY course_code, session_date;
$$;


-- ─────────────────────────────────────────────────────────────────────────
-- 006_change_tracking.sql
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE courses ADD COLUMN IF NOT EXISTS change_kind TEXT;       -- added|moved|rescheduled|room_change|updated|cancelled
ALTER TABLE courses ADD COLUMN IF NOT EXISTS change_note TEXT;       -- human-readable "what changed"
ALTER TABLE courses ADD COLUMN IF NOT EXISTS last_changed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_courses_last_changed ON courses(last_changed_at);


-- ─────────────────────────────────────────────────────────────────────────
-- 007_attendance_notes.sql
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS attendance (
  user_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  status    TEXT NOT NULL,            -- present | absent
  marked_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);

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


-- ─────────────────────────────────────────────────────────────────────────
-- 008_import_code.sql
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS import_code TEXT;

UPDATE users
SET import_code = upper(substr(md5(random()::text || id::text || clock_timestamp()::text), 1, 8))
WHERE import_code IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_import_code ON users(import_code);


-- ─────────────────────────────────────────────────────────────────────────
-- 009_notification_dedup.sql
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedup_key text;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedup
  ON notifications (user_id, dedup_key)
  WHERE dedup_key IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────
-- 010_user_sessions_rpc.sql
-- ─────────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────────
-- 011_year_sections.sql
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE courses  ADD COLUMN IF NOT EXISTS year       smallint DEFAULT 2;
ALTER TABLE courses  ADD COLUMN IF NOT EXISTS source_key text     DEFAULT 'y2';
ALTER TABLE users    ADD COLUMN IF NOT EXISTS year       smallint;        -- null = unset → 2nd-year
ALTER TABLE users    ADD COLUMN IF NOT EXISTS section    text;            -- 1st-year section, else null
ALTER TABLE sync_log ADD COLUMN IF NOT EXISTS source_key text     DEFAULT 'y2';

CREATE INDEX IF NOT EXISTS idx_courses_year_section ON courses(year, sheet_tab);

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

CREATE OR REPLACE FUNCTION course_catalog()
RETURNS SETOF courses
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (course_code) *
  FROM courses
  WHERE is_common = false AND year = 2
  ORDER BY course_code, session_date;
$$;
