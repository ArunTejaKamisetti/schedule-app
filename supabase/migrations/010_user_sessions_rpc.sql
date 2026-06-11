-- One-round-trip resolution of a user's current sessions.
--
-- getUserSessions previously did TWO sequential queries (pick the user's course codes, then
-- fetch every session for those codes). With the database a region away from the functions
-- (~150ms each way), that doubled the latency of the most-loaded endpoints (Home, Schedule,
-- Courses, Friends, attendance). This RPC does the whole thing server-side in one query and
-- returns all rows (no PostgREST 1000-row cap).

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
