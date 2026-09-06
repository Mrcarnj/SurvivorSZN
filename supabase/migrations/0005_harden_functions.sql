-- ============================================================
-- Advisor hardening for the functions 0001 created.
--
-- Note on is_admin(): it is referenced inside the read_picks RLS policy, and
-- Postgres evaluates policy expressions with the querying role's privileges.
-- So `authenticated` MUST keep EXECUTE or every pick read breaks. Only anon
-- is revoked — no policy anon can reach calls it.
-- ============================================================

-- handle_new_user() is a trigger function and is never meant to be called
-- directly. Triggers check EXECUTE at creation time, not at fire time, so
-- revoking here does not affect signup.
revoke all on function handle_new_user() from public, anon, authenticated;

-- is_admin() stays callable by authenticated (RLS depends on it); anon has no
-- policy that reaches it and returns false there anyway, since auth.uid() is null.
revoke all on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;

-- enforce_pick_rules() had no pinned search_path.
create or replace function enforce_pick_rules() returns trigger
language plpgsql set search_path = public as $$
declare w record;
begin
  select * into w from weeks where season = new.season and week = new.week;
  if w is null then
    raise exception 'Week % is not open yet', new.week;
  end if;
  if w.scored then
    raise exception 'Week % has already been scored', new.week;
  end if;
  if w.lock_at is not null and now() >= w.lock_at then
    raise exception 'Picks are locked for week %', new.week;
  end if;

  new.exclusive_week := w.exclusive;
  new.updated_at := now();
  return new;
end $$;
