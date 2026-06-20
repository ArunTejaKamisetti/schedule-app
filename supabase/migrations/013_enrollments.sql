-- Phase 2 — Normalize enrollment: one row per (user, course) instead of one per session.
--
-- WHY: `user_courses` stores enrollment PER SESSION — picking a course inserts a row for
-- every one of its dated sessions, so it balloons (52,839 rows for ~1,000 users). Enrollment
-- is already RESOLVED by course_code everywhere (user_sessions / pick_course), so the per-session
-- rows carry no information the code uses. `enrollments` records the pick once, by code, which:
--   • collapses ~52,839 rows → ~5,000–6,000 (~10× smaller), and
--   • is the shape the roster needs (email → list of course codes).
--
-- This keeps the `courses` table (one row per session) unchanged; the master/sessions split is a
-- separate later migration. The RPC return contracts are identical, so app/UI code is unchanged
-- apart from the two read paths that listed picks directly (lib/enrollment.ts, lib/notify.ts).
--
-- Paste in Supabase dashboard → SQL Editor → Run (the CLI can't reach this DB from the dev
-- network). Idempotent — safe to re-run. `user_courses` is left in place (dormant) for rollback.

-- ── enrollment by course, year-scoped (year-1 students get their whole section, not picks) ──
CREATE TABLE IF NOT EXISTS enrollments (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL,
  year        SMALLINT NOT NULL DEFAULT 2,  -- the elective year this pick belongs to
  added_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, course_code)
);
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_code ON enrollments(course_code);

-- One-time backfill from the per-session table: collapse to DISTINCT codes per user.
-- Safe to re-run (ON CONFLICT DO NOTHING). Year comes from the resolved course row.
INSERT INTO enrollments (user_id, course_code, year)
SELECT DISTINCT uc.user_id, c.course_code, COALESCE(c.year, 2)
FROM user_courses uc
JOIN courses c ON c.id = uc.course_id
ON CONFLICT (user_id, course_code) DO NOTHING;

-- ── Pick / unpick now write ONE enrollment row (by code) instead of one per session ──────────
CREATE OR REPLACE FUNCTION pick_course(p_user uuid, p_code text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO enrollments (user_id, course_code, year)
  SELECT p_user, p_code, COALESCE((SELECT year FROM courses WHERE course_code = p_code AND year = 2 LIMIT 1), 2)
  ON CONFLICT (user_id, course_code) DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION unpick_course(p_user uuid, p_code text)
RETURNS void LANGUAGE sql AS $$
  DELETE FROM enrollments WHERE user_id = p_user AND course_code = p_code;
$$;

-- ── Resolve a user's current sessions from `enrollments` (year-2) — return shape UNCHANGED ────
-- Year-1 branch (whole-section timetable) is untouched; the two branches stay mutually exclusive
-- and year-scoped so a code/section shared across years can never bleed in.
CREATE OR REPLACE FUNCTION user_sessions(p_user uuid)
RETURNS SETOF courses
LANGUAGE sql STABLE AS $$
  -- 1st year: the user's whole section timetable.
  SELECT c.*
  FROM courses c, users u
  WHERE u.id = p_user AND u.year = 1 AND u.section IS NOT NULL
    AND c.year = 1 AND c.sheet_tab = u.section
  UNION ALL
  -- 2nd year (or unset): the user's picked electives, year-2 only, resolved by code so sessions
  -- added to the sheet after the pick still belong to the user.
  SELECT c.*
  FROM courses c
  WHERE COALESCE((SELECT year FROM users WHERE id = p_user), 2) <> 1
    AND c.year = 2
    AND c.course_code IN (SELECT e.course_code FROM enrollments e WHERE e.user_id = p_user);
$$;
