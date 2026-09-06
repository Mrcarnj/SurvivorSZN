-- ============================================================
-- Commissioner setup + friendlier display names
--
-- The 0001 trigger derived display_name from the email local part, which turns
-- mike.f.dietrich@gmail.com into "mike.f.dietrich". Let the commissioner set a
-- name on the invite instead, so people show up on the board correctly the
-- first time they sign in.
-- ============================================================

alter table allowlist add column if not exists display_name text;

-- ---------- signup trigger: prefer the name set on the invite ----------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s int;
  invite record;
begin
  select * into invite from allowlist a where a.email = lower(new.email);
  if invite is null then
    raise exception 'This email is not on the pool list. Ask the commissioner for an invite.';
  end if;

  insert into profiles (id, email, display_name, is_admin)
  values (
    new.id,
    lower(new.email),
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      nullif(invite.display_name, ''),
      split_part(new.email, '@', 1)
    ),
    lower(new.email) = 'mike.f.dietrich@gmail.com'
  )
  on conflict (id) do nothing;

  select year into s from seasons where active order by year desc limit 1;
  if s is not null then
    insert into entries (season, user_id) values (s, new.id)
    on conflict (season, user_id) do nothing;
  end if;
  return new;
end $$;

-- ---------- the commissioner ----------
insert into allowlist (email, display_name)
values ('mike.f.dietrich@gmail.com', 'Dieter')
on conflict (email) do update set display_name = excluded.display_name;

-- Backfill, in case the account already signed in under the old trigger.
update profiles
   set display_name = 'Dieter',
       is_admin     = true
 where email = 'mike.f.dietrich@gmail.com';

-- And make sure the commissioner has an entry in the active season, since
-- they play as well as run the pool.
insert into entries (season, user_id)
select s.year, p.id
  from seasons s
  cross join profiles p
 where s.active
   and p.email = 'mike.f.dietrich@gmail.com'
on conflict (season, user_id) do nothing;
