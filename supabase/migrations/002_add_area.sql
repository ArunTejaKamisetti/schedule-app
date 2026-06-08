ALTER TABLE courses ADD COLUMN IF NOT EXISTS area TEXT;
CREATE INDEX IF NOT EXISTS idx_courses_area ON courses(area);
