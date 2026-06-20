-- Phase 3 (pulled forward) — Roster-driven enrollment.
--
-- Students no longer self-pick. The admin uploads two rosters (an .xlsx each):
--   • year-1 roster: email → section  (the student gets that section's whole timetable)
--   • year-2 roster: email → elective course codes  (one `enrollments` row per code)
-- The roster is stored here keyed by email, then APPLIED to a user:
--   • immediately, for emails that already have a `users` row, and
--   • on first sign-in, via lib/user.ts (so order of upload vs sign-in doesn't matter).
--
-- `codes` is the year-2 elective list (NULL/empty for year-1 rows); `section` is the year-1
-- section (NULL for year-2 rows). One row per email — re-uploading replaces a student's row.
--
-- Paste in Supabase dashboard → SQL Editor → Run. Idempotent.

CREATE TABLE IF NOT EXISTS roster (
  email      TEXT PRIMARY KEY,              -- normalized (lowercased) college email
  year       SMALLINT NOT NULL,            -- 1 | 2
  section    TEXT,                          -- year-1 only (A..H / LSM / FIN)
  codes      TEXT[] NOT NULL DEFAULT '{}',  -- year-2 only: elective course codes
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- Apply a roster row to a user (called at upload time for existing users, and on sign-in).
-- Year-1: set year/section, clear elective enrollments. Year-2: set year, REPLACE enrollments
-- with the roster's codes (so a re-upload is authoritative). SECURITY DEFINER so it can run from
-- the (RLS-bound) cookie client on sign-in.
CREATE OR REPLACE FUNCTION apply_roster_to_user(p_user uuid, p_email text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r roster%ROWTYPE;
BEGIN
  SELECT * INTO r FROM roster WHERE email = lower(p_email);
  IF NOT FOUND THEN RETURN; END IF;

  IF r.year = 1 THEN
    UPDATE users SET year = 1, section = r.section WHERE id = p_user;
    DELETE FROM enrollments WHERE user_id = p_user;          -- year-1 has no electives
  ELSE
    UPDATE users SET year = 2 WHERE id = p_user;
    DELETE FROM enrollments WHERE user_id = p_user;          -- replace, roster is authoritative
    INSERT INTO enrollments (user_id, course_code, year)
    SELECT p_user, code, 2 FROM unnest(r.codes) AS code
    WHERE code IS NOT NULL AND length(trim(code)) > 0
    ON CONFLICT (user_id, course_code) DO NOTHING;
  END IF;
END $$;

-- RLS: only admin/service touches the roster (it holds every student's enrollment).
ALTER TABLE roster ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS roster_admin_all ON roster;
CREATE POLICY roster_admin_all ON roster FOR ALL USING (is_admin()) WITH CHECK (is_admin());
