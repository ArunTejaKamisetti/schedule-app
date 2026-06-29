-- Phase 6.1 — cross-year roster moves, a both-years prune guard, and invalid-account cleanup.
--
-- Three fixes that came out of operating the roster-authoritative prune (migration 018):
--   1) replace_roster_year must tolerate a student MOVING between years (same email).
--   2) the prune must refuse a PARTIAL upload (only one year's roster present), not just a totally
--      empty roster — otherwise uploading one year wipes the other year's whole cohort.
--   3) email-less accounts (test/seed junk) can never match a roster, so the roster prune is blind to
--      them; give the admin a separate, explicit way to remove them.
--
-- Paste in Supabase dashboard → SQL Editor → Run. Idempotent.

-- ── 1) replace_roster_year: upsert by email so a promoted Y1→Y2 student moves cleanly ───────────
-- `roster.email` is the PRIMARY KEY. A student who finishes year 1 re-registers for year 2 under the
-- SAME email; their old year-1 row still exists, so the plain INSERT collided on the PK and the whole
-- upload failed. ON CONFLICT moves the email to the new year instead of erroring.
CREATE OR REPLACE FUNCTION replace_roster_year(p_year smallint, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  DELETE FROM roster WHERE year = p_year;
  INSERT INTO roster (email, year, section, codes, uploaded_at)
  SELECT lower(r.email), p_year, r.section, COALESCE(r.codes, '{}'::text[]), now()
  FROM jsonb_to_recordset(p_rows) AS r(email text, section text, codes text[])
  WHERE r.email IS NOT NULL AND length(trim(r.email)) > 0
  ON CONFLICT (email) DO UPDATE
    SET year = EXCLUDED.year, section = EXCLUDED.section,
        codes = EXCLUDED.codes, uploaded_at = EXCLUDED.uploaded_at;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ── 2) prune_departed_students: refuse a PARTIAL roster, not only a totally empty one ───────────
-- The two rosters are uploaded at DIFFERENT times. If only one year is present, every student in the
-- not-yet-uploaded year looks "departed". Block the prune unless BOTH years have at least one row;
-- the admin UI additionally disables the button and warns. This supersedes migration 018's guard,
-- which only blocked a completely empty roster.
CREATE OR REPLACE FUNCTION prune_departed_students()
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  IF (SELECT count(*) FROM roster WHERE year = 1) = 0
     OR (SELECT count(*) FROM roster WHERE year = 2) = 0 THEN
    RETURN 0;  -- partial upload — never prune against an incomplete picture
  END IF;
  WITH del AS (
    DELETE FROM users WHERE id IN (SELECT id FROM departed_students) RETURNING 1
  )
  SELECT count(*) INTO n FROM del;
  RETURN n;
END $$;

-- ── 3) invalid (email-less) accounts: junk the roster prune can never reach ─────────────────────
-- A signed-in student ALWAYS carries a domain-gated email (auth/callback), so a NON-admin row with a
-- NULL/blank email is invalid — leftover test/seed data. `departed_students` deliberately skips NULL
-- emails (can't match a NULL against the roster), so these rows are a permanent blind spot. Give them
-- their own view + prune so the admin can clear them explicitly.
CREATE OR REPLACE VIEW invalid_users AS
  SELECT u.*
  FROM users u
  WHERE u.role <> 'admin'
    AND (u.email IS NULL OR length(trim(u.email)) = 0);

ALTER VIEW invalid_users SET (security_invoker = on);  -- honour the caller's RLS (see migration 020)

CREATE OR REPLACE FUNCTION prune_invalid_users()
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  WITH del AS (
    DELETE FROM users WHERE id IN (SELECT id FROM invalid_users) RETURNING 1
  )
  SELECT count(*) INTO n FROM del;
  RETURN n;
END $$;
