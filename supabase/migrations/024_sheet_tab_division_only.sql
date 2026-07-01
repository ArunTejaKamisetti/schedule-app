-- Phase 6.3 — re-key year-2 (division-layout) sessions to the division code ALONE.
--
-- The parser (lib/sheets.ts) used to build a division session's `sheet_tab` as
-- "<programme-label> <division-code>", e.g. "PGP-29 D1". Since a class's diff identity is
-- `session_date + start_time + sheet_tab`, merely editing/reordering the programme header row
-- ("PGP-29" / "PGPFIN06" / "PGPLSM06") re-keyed EVERY class and the sync reported the whole
-- timetable as "Moved". The parser now keys on the division code alone ("D1"), i.e. the LAST/bottom
-- header row, ignoring any programme rows above it.
--
-- This migration brings EXISTING rows in line WITHOUT a delete+reinsert (which the sync's upsert
-- would otherwise do once the conflict key `course_code,sheet_tab,session_date,start_time` stops
-- matching) — so course IDs, and the attendance / notes / calendar rows that reference them, are
-- preserved. The division code is the last space-separated token; single-token tabs (year-1 section
-- letters like "A", and "COMMON") have no space and are left untouched.
--
-- It also clears the stale change-highlight tags on those rows: every current "Moved" tag is the
-- programme-row-edit artifact described above, so this gives a clean slate (a genuinely changed
-- class re-tags on the next real sync; the is_cancelled FLAG is independent and untouched).
--
-- Paste in Supabase dashboard → SQL Editor → Run. Idempotent (re-running is a no-op once no
-- sheet_tab contains a space).
UPDATE courses
SET sheet_tab   = regexp_replace(sheet_tab, '^.*\s', ''),  -- keep only the text after the last space
    change_kind = NULL,
    change_note = NULL,
    last_changed_at = NULL
WHERE sheet_tab ~ '\s';
