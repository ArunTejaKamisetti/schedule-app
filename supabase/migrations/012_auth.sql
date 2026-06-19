-- Phase 1 — Authentication: link app users to Supabase Auth identities + roles.
--
-- On first Google sign-in, lib/user.ts inserts a `users` row whose `id` equals
-- the Supabase Auth user id (auth.uid()), so the existing app keeps working with
-- a real, verified identity instead of a random localStorage UUID.
--
-- Paste this in the Supabase dashboard → SQL Editor → Run (the CLI can't reach
-- this DB from the dev network). Idempotent — safe to re-run.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role  text NOT NULL DEFAULT 'student'; -- 'student' | 'admin'

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
