-- Phase 3 — Bus & Mess as admin-editable content (paste-import).
--
-- Bus/mess are tiny, admin-managed blobs pasted as JSON (the admin runs a prompt + the source
-- PDF through any free chat tool, then pastes the JSON back). We store them as-is so the exact
-- current shapes are preserved — bus trips `{time,min,from,to[],maingate}` and mess
-- `{breakfast,lunch,dinner}` each `{veg[],special?[]}` — and `lib/bus.ts`/`lib/mess.ts` stay the
-- built-in FALLBACK if no row is set. One row per key ('bus' | 'mess').
--
-- Paste in Supabase dashboard → SQL Editor → Run. Idempotent.

CREATE TABLE IF NOT EXISTS site_content (
  key        TEXT PRIMARY KEY,           -- 'bus' | 'mess'
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Readable by any authenticated user (it's public info, served via the API); writable by admin only.
ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS site_content_read ON site_content;
CREATE POLICY site_content_read ON site_content FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS site_content_admin_write ON site_content;
CREATE POLICY site_content_admin_write ON site_content FOR ALL USING (is_admin()) WITH CHECK (is_admin());
