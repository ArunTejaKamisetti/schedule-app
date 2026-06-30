-- Phase 6.2 — roster-gated app access.
--
-- The roster (both years together) is the authoritative list of current students (migration 018).
-- A non-admin whose email is in NO roster row has either left or was never enrolled and must not be
-- able to use the app — nor be silently re-created after the admin prunes them (see lib/user.ts,
-- which previously re-inserted a departed student on their next request, so "Review & remove" kept
-- listing the same person forever). This function is the single predicate the server uses to
-- allow/deny a signed-in non-admin (lib/access.ts → getOrCreateUser + getAuthedSession).
--
-- It mirrors prune_departed_students' BOTH-rosters guard (migration 022): access is DENIED only once
-- both years' rosters are present, so a partial / not-yet-uploaded roster never locks out a
-- legitimately enrolled student, and a brand-new deployment (no roster yet) lets everyone in until
-- the rosters are uploaded. Admin emails are env-driven (ADMIN_EMAILS), so the admin allowance is
-- applied in TS BEFORE this is called — admins are intentionally never on the roster.
--
-- SECURITY DEFINER so the (RLS-bound) cookie client can call it too: `roster` is admin/service-only
-- under RLS (migration 015), and this only ever returns a boolean, never roster rows.
--
-- Paste in Supabase dashboard → SQL Editor → Run. Idempotent (CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION has_roster_access(p_email text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_email IS NULL OR length(trim(p_email)) = 0 THEN false
    WHEN EXISTS (SELECT 1 FROM roster r WHERE r.email = lower(trim(p_email))) THEN true
    -- Not in roster: deny only when BOTH years are present (otherwise "departed" is
    -- indistinguishable from "their year's roster isn't uploaded yet").
    WHEN (SELECT count(*) FROM roster WHERE year = 1) > 0
     AND (SELECT count(*) FROM roster WHERE year = 2) > 0 THEN false
    ELSE true
  END
$$;
