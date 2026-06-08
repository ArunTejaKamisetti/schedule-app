-- Track WHAT changed on each session so the app can subtly highlight it and explain it.
-- Set by the sync diff when a session is added / moved / re-roomed / edited / cancelled.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS change_kind TEXT;       -- added|moved|rescheduled|room_change|updated|cancelled
ALTER TABLE courses ADD COLUMN IF NOT EXISTS change_note TEXT;       -- human-readable "what changed"
ALTER TABLE courses ADD COLUMN IF NOT EXISTS last_changed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_courses_last_changed ON courses(last_changed_at);
