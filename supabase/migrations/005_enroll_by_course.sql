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
