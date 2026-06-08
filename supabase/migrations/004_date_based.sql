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
