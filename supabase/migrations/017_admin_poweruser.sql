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
