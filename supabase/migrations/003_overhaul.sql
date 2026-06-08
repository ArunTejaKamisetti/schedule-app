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
