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
