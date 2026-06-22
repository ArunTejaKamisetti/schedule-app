-- Phase 4/5 — Google integration moves OUT of env and INTO the database.
--
-- WHY: the schedule's Google Sheet is a BRAND-NEW sheet every term (Y1 and Y2), and reading it used
-- to require a hand-managed `GOOGLE_REFRESH_TOKEN` + `GOOGLE_SHEET_ID` in env — both forcing a
-- developer at every term/handover. Now:
--   • `google_integration` — a single server-only row holding the app's Google OAuth client
--     (client id/secret/redirect, set ONCE at handover) and the admin's stored `sheet_refresh_token`
--     (captured when an admin authorizes Google sign-in once). The token lets on-demand AND cron
--     sync read sheets headlessly. SERVICE-ROLE ONLY: RLS is enabled with NO policy, so the
--     anon/authenticated roles are denied even though they hold table grants — only the
--     service-role client (which bypasses RLS) reads/writes it. Secrets never reach a browser.
--   • `schedule_sources` — the admin-pasted Google Sheet id per source slot (y2, y1-AH, …). The
--     admin pastes the new term's link; sync resolves the id from here. Ids are view-access ("not a
--     secret"), so authenticated may READ (like courses/site_content); only admin/service writes.
--
-- Paste in Supabase dashboard → SQL Editor → Run. Idempotent.

-- ── google_integration: server-only secrets + the admin's sheet refresh token ──────────────────
CREATE TABLE IF NOT EXISTS google_integration (
  id                  BOOLEAN PRIMARY KEY DEFAULT true,  -- singleton: the one config row (id = true)
  client_id           TEXT,
  client_secret       TEXT,
  redirect_uri        TEXT,
  sheet_refresh_token TEXT,
  authorized_email    TEXT,                              -- which admin granted the sheet scope
  updated_at          TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT google_integration_singleton CHECK (id)
);

-- RLS on, NO policy → anon/authenticated are denied entirely; only service_role (RLS-bypass) reaches
-- it. This is how we keep the client secret + refresh token off every browser-reachable path.
ALTER TABLE google_integration ENABLE ROW LEVEL SECURITY;

-- ── schedule_sources: the admin-pasted sheet id per source slot ─────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_sources (
  source_key TEXT PRIMARY KEY,             -- matches SHEET_SOURCES[].key ('y2' | 'y1-AH' | …)
  sheet_id   TEXT NOT NULL,
  sheet_url  TEXT,                          -- the original pasted link, for display
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by TEXT
);

ALTER TABLE schedule_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schedule_sources_read ON schedule_sources;
CREATE POLICY schedule_sources_read ON schedule_sources FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS schedule_sources_admin_write ON schedule_sources;
CREATE POLICY schedule_sources_admin_write ON schedule_sources FOR ALL USING (is_admin()) WITH CHECK (is_admin());
