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
