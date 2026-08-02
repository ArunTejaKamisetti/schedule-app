-- Collapse the YMHC venue variants into one course.
--
-- The admin types the venue into YMHC's schedule cell, and the wording changed through the
-- term — "YMHC MN Common Room", "YMHC D3 Classroom", "YMHC E4 Classroom", "YMHC E4 classroom".
-- Because course_code was the raw cell text, each wording became a SEPARATE course in the
-- picker, so a student who picked one only ever saw that subset of sessions.
--
-- The parser now canonicalises all of them to course_code 'YMHC' (venue moves to `room`).
-- That means the old variant rows get reconciled away by the next sync, and because
-- user_courses/attendance/notes are ON DELETE CASCADE, the picks would vanish silently.
--
-- So this runs in two halves, either side of the deploy+sync:
--   PART 1 — snapshot, BEFORE deploying the parser change
--   PART 2 — restore onto the new canonical rows, AFTER the sync has run
-- Both halves are idempotent and safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1 — run BEFORE deploy+sync
-- ─────────────────────────────────────────────────────────────────────────────

-- Who had ANY YMHC variant picked. Only the user matters: the new canonical course carries
-- every session, so re-picking gives them a strictly more complete schedule than before.
CREATE TABLE IF NOT EXISTS ymhc_pick_backup AS
SELECT DISTINCT uc.user_id
FROM user_courses uc
JOIN courses c ON c.id = uc.course_id
WHERE c.course_code ILIKE 'YMHC%';

-- Attendance and notes hang off a specific session, so they are keyed by session identity
-- (date + start time) rather than by the course_id that is about to be replaced.
CREATE TABLE IF NOT EXISTS ymhc_attendance_backup AS
SELECT a.user_id, c.session_date, c.start_time, a.status, a.marked_at
FROM attendance a
JOIN courses c ON c.id = a.course_id
WHERE c.course_code ILIKE 'YMHC%';

CREATE TABLE IF NOT EXISTS ymhc_notes_backup AS
SELECT n.user_id, c.session_date, c.start_time, n.body, n.created_at
FROM notes n
JOIN courses c ON c.id = n.course_id
WHERE c.course_code ILIKE 'YMHC%';

-- Sanity: how much is being carried across.
--   SELECT (SELECT count(*) FROM ymhc_pick_backup)       AS users_with_pick,
--          (SELECT count(*) FROM ymhc_attendance_backup) AS attendance_rows,
--          (SELECT count(*) FROM ymhc_notes_backup)      AS note_rows;


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2 — run AFTER deploy + a successful /api/sync
-- Verify the canonical course exists first; this should return exactly one row:
--   SELECT course_code, count(*) AS sessions FROM courses
--    WHERE course_code ILIKE 'YMHC%' GROUP BY course_code;
-- ─────────────────────────────────────────────────────────────────────────────

-- Re-pick the canonical course for everyone who had any variant.
-- pick_course() inserts every session and is ON CONFLICT DO NOTHING, so this is idempotent.
-- SELECT pick_course(user_id, 'YMHC') FROM ymhc_pick_backup;

-- Re-attach attendance to the new session rows.
-- INSERT INTO attendance (user_id, course_id, status, marked_at)
-- SELECT b.user_id, c.id, b.status, b.marked_at
-- FROM ymhc_attendance_backup b
-- JOIN courses c ON c.course_code = 'YMHC'
--                AND c.session_date = b.session_date
--                AND c.start_time  = b.start_time
-- ON CONFLICT (user_id, course_id) DO NOTHING;

-- Re-attach notes.
-- INSERT INTO notes (user_id, course_id, session_date, body, created_at)
-- SELECT b.user_id, c.id, b.session_date, b.body, b.created_at
-- FROM ymhc_notes_backup b
-- JOIN courses c ON c.course_code = 'YMHC'
--                AND c.session_date = b.session_date
--                AND c.start_time  = b.start_time
-- ON CONFLICT (user_id, course_id) DO NOTHING;

-- Once the restore is verified, the backup tables can be dropped:
--   DROP TABLE ymhc_pick_backup, ymhc_attendance_backup, ymhc_notes_backup;
