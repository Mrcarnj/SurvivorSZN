-- ============================================================
-- Backfill profiles/entries for auth users that predate the trigger.
--
-- handle_new_user() only fires on INSERT into auth.users, so an account
-- created before 0001 was run (or during any window where the trigger
-- failed) ends up with a login but no profile — which means no admin flag,
-- no entry, and no row on the board. This reconciles them.
-- Idempotent: safe to re-run.
-- ============================================================

insert into profiles (id, email, display_name, is_admin)
select
  u.id,
  lower(u.email),
  coalesce(
    nullif(u.raw_user_meta_data->>'display_name', ''),
    nullif(a.display_name, ''),
    split_part(u.email, '@', 1)
  ),
  lower(u.email) = 'mike.f.dietrich@gmail.com'
from auth.users u
join allowlist a on a.email = lower(u.email)
on conflict (id) do nothing;

-- The commissioner's flag and name are authoritative, even if a profile
-- already existed with the email-derived default.
update profiles
   set display_name = 'Dieter',
       is_admin     = true
 where email = 'mike.f.dietrich@gmail.com';

-- Everyone with a profile plays in the active season.
insert into entries (season, user_id)
select s.year, p.id
  from seasons s
  cross join profiles p
 where s.active
on conflict (season, user_id) do nothing;
