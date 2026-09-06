-- ============================================================
-- Crowning the winner.
--
-- The pool ends the moment exactly one player still has a life, whatever week
-- that happens in — it does not have to run to final_week. Recorded on the
-- season so the result is durable and the app can stop taking picks, rather
-- than being re-derived from entries every render.
--
-- A player who is eliminated but still holds an unused re-buy does NOT count
-- as alive; they are out unless they actually buy back. So the champion is
-- simply "the last entry with eliminated = false".
-- ============================================================

alter table seasons
  add column if not exists champion_user_id uuid references profiles(id) on delete set null,
  add column if not exists completed_at     timestamptz;

comment on column seasons.champion_user_id is
  'Last player standing. Set by scoreWeekOnDb the week the pool narrows to one.';
