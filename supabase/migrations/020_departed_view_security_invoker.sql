-- Phase 6 fix — make `departed_students` a SECURITY INVOKER view (Supabase linter: "Security
-- Definer View").
--
-- A Postgres view created before PG15, or without `security_invoker`, runs with the PRIVILEGES and
-- RLS of the view's OWNER (definer) rather than the role that queries it. Supabase flags this as an
-- error because it can leak owner-visible rows (here: `users`) to a less-privileged caller who only
-- has SELECT on the view.
--
-- In this app the view is only ever read via the service-role client (lib/reconcile.ts —
-- previewDeparted / prune_departed_students, behind requireAdmin()), which bypasses RLS anyway, so
-- flipping to invoker changes nothing operationally. It simply makes the view honour the CALLER's
-- permissions/RLS, closing the lint finding and ensuring a future low-privilege reader can't use the
-- view to sidestep the `users` RLS policies.
--
-- Paste in Supabase dashboard → SQL Editor → Run. Idempotent.

ALTER VIEW public.departed_students SET (security_invoker = on);
