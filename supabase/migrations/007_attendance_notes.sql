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
