-- House rule change: one life per person, plus a one-time $25 buy-back life.
-- Previously everyone started with two.

alter table entries alter column lives set default 1;

-- Cap existing entries at the new ceiling: 1 base life, +1 if they bought back.
update entries
   set lives = least(lives, 1 + (case when rebuy_used then 1 else 0 end));
