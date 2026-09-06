-- ============================================================
-- DraftKings moneyline and spread on each game.
--
-- Column names are snake_case to match the rest of the table (game_id,
-- home_score, season_type); they map from the Tank01 field names
-- homeTeamML / awayTeamML / homeTeamSpread / awayTeamSpread.
--
-- Moneylines are American odds and always whole numbers (-180, +150), so int.
-- Spreads land on the half point (-3.5, +10.5), so numeric(4,1) — which also
-- keeps -0.0 and 0.0 distinct from "no line posted" (null).
-- ============================================================

alter table games
  add column if not exists home_team_ml     int,
  add column if not exists away_team_ml     int,
  add column if not exists home_team_spread numeric(4,1),
  add column if not exists away_team_spread numeric(4,1),
  -- null until a book posts a line; lets the UI tell "no line yet" from "even"
  add column if not exists odds_updated_at  timestamptz;

comment on column games.home_team_ml is 'DraftKings moneyline, American odds';
comment on column games.away_team_ml is 'DraftKings moneyline, American odds';
comment on column games.home_team_spread is 'DraftKings spread, negative = favored';
comment on column games.away_team_spread is 'DraftKings spread, negative = favored';
