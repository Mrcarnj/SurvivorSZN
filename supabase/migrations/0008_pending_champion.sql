-- ============================================================
-- Last player standing isn't always the winner yet.
--
-- If everyone else is out AND nobody holds an unused re-buy, the pool is
-- decided and the last player wins automatically. But if an eliminated player
-- still has a re-buy available, they might buy back in — so the result is only
-- provisional until the commissioner says otherwise.
--
-- pending_champion_user_id is that provisional state: the pool keeps running,
-- picks stay open, and the commissioner either confirms the winner or waits
-- for the re-buy. champion_user_id stays null until it is settled.
-- ============================================================

alter table seasons
  add column if not exists pending_champion_user_id uuid
    references profiles(id) on delete set null;

comment on column seasons.pending_champion_user_id is
  'Last player standing while a re-buy is still outstanding. Awaits commissioner confirmation.';
