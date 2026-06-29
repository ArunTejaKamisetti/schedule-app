-- Phase 6 — Institution Profile: the per-deployment vocabulary that used to be HARDCODED.
--
-- WHY: change-tracking LOGIC is generic (diff.ts derives moved/rescheduled/room/added/removed from
-- slot structure, no institution knowledge). But the change-tracking VOCABULARY was baked into code
-- for IIM Kozhikode: the colour→meaning mapping (red=cancelled, green=added, amber=event), the
-- course catalog (area map, cross-sheet aliases, programme qualifiers), the section/division layout
-- shapes, the venue edge-cases (e.g. "YMHC MN Common Room"), and the lunch/exam keyword lists.
-- A different institution (IIM-C/B) has different colours, courses and sections. This table lets an
-- ADMIN configure all of that from the dashboard (Institution Profile page) with NO redeploy.
--
-- SHAPE: one row per concern (key → JSONB), exactly like `site_content` (bus/mess). The app's
-- `lib/institution-profile.ts#DEFAULT_PROFILE` holds the current IIM-K values as the built-in
-- FALLBACK, so an empty table behaves IDENTICALLY to today and nothing breaks pre-config. A saved
-- row OVERRIDES that concern. Keys: 'colors' | 'catalog' | 'sections' | 'overrides' | 'keywords'.
--
-- ACCESS: the profile drives how schedules are parsed/displayed (areas, sections) — view-access,
-- not a secret — so authenticated may READ (like courses/site_content); only admin/service writes.
--
-- Paste in Supabase dashboard → SQL Editor → Run. Idempotent.

CREATE TABLE IF NOT EXISTS institution_profile (
  key        TEXT PRIMARY KEY,            -- 'colors' | 'catalog' | 'sections' | 'overrides' | 'keywords'
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by TEXT
);

ALTER TABLE institution_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS institution_profile_read ON institution_profile;
CREATE POLICY institution_profile_read ON institution_profile FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS institution_profile_admin_write ON institution_profile;
CREATE POLICY institution_profile_admin_write ON institution_profile FOR ALL USING (is_admin()) WITH CHECK (is_admin());
