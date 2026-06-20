-- Phase 2 — Row Level Security on every table.
--
-- Today all server routes use the SERVICE-ROLE key, which BYPASSES RLS by design (sync, cron,
-- admin, and — until Phase 1's route-auth migration finishes — the per-user API routes too). So
-- enabling RLS now is harmless to the running app and is pure defense-in-depth: the moment a route
-- switches to the cookie-aware client (runs AS the signed-in user, lib/supabase/server.ts
-- createClient), ownership is enforced by the database instead of by a trusted `userId` param.
--
-- Identity model: `users.id = auth.uid()` (migration 012), so policies key on auth.uid() directly.
-- A later migration that introduces a dedicated `profiles` table can re-point these unchanged.
--
-- Paste in Supabase dashboard → SQL Editor → Run. Idempotent (DROP POLICY IF EXISTS before
-- CREATE; ENABLE RLS is a no-op if already on). After applying, smoke-test sign-in + a schedule
-- load; anything that 403s is a route still needing the cookie client (expected, tracked in docs).

-- ── admin check (SECURITY DEFINER avoids RLS recursion when read from a policy ON users) ───────
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin');
$$;

-- ── profiles / identity: users ────────────────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_select_self_or_admin ON users;
CREATE POLICY users_select_self_or_admin ON users FOR SELECT
  USING (auth.uid() = id OR is_admin());
DROP POLICY IF EXISTS users_insert_self ON users;
CREATE POLICY users_insert_self ON users FOR INSERT
  WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS users_update_self ON users;
CREATE POLICY users_update_self ON users FOR UPDATE
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ── reference data: courses (any authenticated user may read; only admin/service writes) ───────
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS courses_read_authenticated ON courses;
CREATE POLICY courses_read_authenticated ON courses FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS courses_write_admin ON courses;
CREATE POLICY courses_write_admin ON courses FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- ── sync audit log: admin-only reads (service role writes, bypassing RLS) ──────────────────────
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sync_log_admin_read ON sync_log;
CREATE POLICY sync_log_admin_read ON sync_log FOR SELECT USING (is_admin());

-- ── user-owned tables: auth.uid() = user_id for everything ─────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'enrollments','user_courses','attendance','notes','notifications',
    'user_calendar_tokens','calendar_event_map','user_google_tokens'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_owner', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);',
      t || '_owner', t);
  END LOOP;
END $$;

-- ── friendships: both endpoints may READ the edge; only the owner may modify it ────────────────
-- (A friend's actual schedule/free-time is exposed only via a gated SECURITY DEFINER RPC, never
--  by reading their rows directly.)
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS friendships_read_either ON friendships;
CREATE POLICY friendships_read_either ON friendships FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = friend_id);
DROP POLICY IF EXISTS friendships_modify_owner ON friendships;
CREATE POLICY friendships_modify_owner ON friendships FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
