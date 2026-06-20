-- Phase 6 — Roster is the source of truth; prune students who have left.
--
-- The admin uploads, each term, two schedules (Y1, Y2) and two rosters (Y1, Y2). The two rosters
-- TOGETHER are the authoritative list of current students. A student in EITHER roster is kept and
-- mapped to this term's courses (unchanged — see apply_roster_to_user / user_sessions). A student in
-- NEITHER roster has left and is removed (admin-confirmed); the existing ON DELETE CASCADE FKs then
-- clear that user's enrollments, friendships, notes, attendance, notifications, and tokens.
--
-- Courses already self-replace per source on each schedule upload (lib/sync-core.ts), so this only
-- touches the roster + a guarded prune. Paste in Supabase dashboard → SQL Editor → Run. Idempotent.

-- ── 1) roster becomes authoritative: replace a whole YEAR's slice atomically ────────────────────
-- Previously the roster was an additive upsert (absent emails lingered). Now uploading a year's
-- roster REPLACES that year entirely, so `roster` always reflects exactly the current students.
-- Atomic (DELETE+INSERT in one statement scope): a half-applied roster would make the prune below
-- mistake a whole cohort for "departed".
CREATE OR REPLACE FUNCTION replace_roster_year(p_year smallint, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  DELETE FROM roster WHERE year = p_year;
  INSERT INTO roster (email, year, section, codes, uploaded_at)
  SELECT lower(r.email), p_year, r.section, COALESCE(r.codes, '{}'::text[]), now()
  FROM jsonb_to_recordset(p_rows) AS r(email text, section text, codes text[])
  WHERE r.email IS NOT NULL AND length(trim(r.email)) > 0;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ── 2) who has left: students present in NO current roster row (admins are never on the roster) ──
CREATE OR REPLACE VIEW departed_students AS
  SELECT u.*
  FROM users u
  WHERE u.role <> 'admin'
    AND u.email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM roster r WHERE r.email = u.email);

-- ── 3) prune departed students (returns count removed). Hard guard: an EMPTY roster must never ──
-- wipe everyone (e.g. called before any roster upload). The admin UI adds preview + confirmation
-- and warns on large/partial removals; this is the last-line safety in the DB itself.
CREATE OR REPLACE FUNCTION prune_departed_students()
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  IF (SELECT count(*) FROM roster) = 0 THEN
    RETURN 0;
  END IF;
  WITH del AS (
    DELETE FROM users WHERE id IN (SELECT id FROM departed_students) RETURNING 1
  )
  SELECT count(*) INTO n FROM del;
  RETURN n;
END $$;
