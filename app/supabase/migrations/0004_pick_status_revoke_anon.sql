-- ============================================================
-- pick_status leaked to anon.
--
-- 0001 granted the view to `authenticated`, but Supabase's default privileges
-- on the public schema already grant SELECT to `anon`, so the grant was
-- redundant and anon retained access. Since the view is deliberately NOT
-- security_invoker (it bypasses the picks RLS policy on purpose, to expose the
-- has_pick boolean before lock), anyone holding the publishable key — which
-- ships in the browser bundle — could enumerate who had picked each week.
--
-- The team is still never exposed; only the fact that a pick exists. Revoke
-- anon so the view is what 0001 claimed it was: signed-in players only.
-- ============================================================

revoke all on pick_status from anon;
grant select on pick_status to authenticated;
