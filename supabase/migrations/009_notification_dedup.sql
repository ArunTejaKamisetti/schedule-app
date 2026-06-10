-- Make schedule-change notifications idempotent at the database level.
--
-- Three triggers call /api/sync (Apps Script onChange — which fires several times per
-- edit — plus the cron fallback). Each run diffs against the last snapshot, and the new
-- snapshot is only written at the END of a run, so overlapping/rapid syncs all compute the
-- SAME diff and each used to insert + push the SAME alerts. App-level "have I sent this
-- recently?" checks are check-then-act and lose the race under true concurrency.
--
-- Fix: a stable per-user dedup_key + a partial UNIQUE index. notify.ts inserts with
-- ON CONFLICT DO NOTHING and pushes ONLY for rows that were actually inserted, so a given
-- change yields exactly one alert + one push no matter how many syncs race.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedup_key text;

-- Partial unique index: only constrains rows that carry a key, so historical rows
-- (dedup_key IS NULL) are untouched.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedup
  ON notifications (user_id, dedup_key)
  WHERE dedup_key IS NOT NULL;
