-- Which week knocked a player out. The Tuesday result popup needs it to tell
-- "you were eliminated this week" apart from "you were eliminated weeks ago",
-- which a no-pick loss would otherwise make impossible to distinguish.
--
-- Stamped by scoreWeekOnDb when a loss takes an entry to zero lives. Kept
-- after a buy-back so the popup can still say the player lost that week.

alter table entries add column if not exists eliminated_week int;
