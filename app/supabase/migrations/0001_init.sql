-- ============================================================
-- Survivor Pool — schema, rules enforcement, RLS
-- Run in Supabase SQL editor, or: supabase db push
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- reference ----------
create table if not exists teams (
  id       text primary key,          -- 'kc'  (lowercase, matches ESPN logo CDN)
  abbr     text not null,             -- 'KC'  (matches Tank01)
  name     text not null,
  color    text not null,
  tank_id  text                       -- Tank01 teamID, filled by schedule sync
);

create table if not exists seasons (
  year        int primary key,
  final_week  int  not null default 17,   -- last week of the pool
  active      boolean not null default true
);

create table if not exists weeks (
  season     int  not null references seasons(year) on delete cascade,
  week       int  not null,
  lock_at    timestamptz,                 -- set from earliest kickoff by schedule sync
  exclusive  boolean not null default false,  -- wipeout rule: one team per player
  scored     boolean not null default false,
  primary key (season, week)
);

create table if not exists games (
  game_id     text primary key,           -- Tank01 gameID
  season      int  not null,
  week        int  not null,
  season_type text not null default 'reg',
  home        text references teams(id),
  away        text references teams(id),
  kickoff     timestamptz,
  status      text not null default 'scheduled',   -- scheduled | live | final
  home_score  int,
  away_score  int,
  updated_at  timestamptz not null default now()
);
create index if not exists games_week_idx on games(season, week);

-- ---------- people ----------
create table if not exists allowlist (
  email      text primary key,
  invited_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id           uuid primary key references auth.users on delete cascade,
  email        text unique not null,
  display_name text not null,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists entries (
  id            uuid primary key default gen_random_uuid(),
  season        int  not null references seasons(year) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  lives         int  not null default 2,
  rebuy_used    boolean not null default false,
  rebuy_paid_at timestamptz,
  eliminated    boolean not null default false,
  unique (season, user_id)
);

create table if not exists picks (
  id         uuid primary key default gen_random_uuid(),
  season     int  not null,
  week       int  not null,
  user_id    uuid not null references profiles(id) on delete cascade,
  team_id    text not null references teams(id),
  result     text check (result in ('W','L','T')),
  -- mirrored from weeks.exclusive by trigger so we can index on it
  exclusive_week boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (season, week) references weeks(season, week) on delete cascade,
  unique (season, week, user_id),          -- one pick per week
  unique (season, user_id, team_id)        -- a team is one-and-done, per player
);

-- Wipeout weeks: hard first-come-first-served at the database level.
create unique index if not exists picks_exclusive_team_idx
  on picks (season, week, team_id) where exclusive_week;

-- ============================================================
-- Rule enforcement
-- ============================================================
create or replace function enforce_pick_rules() returns trigger
language plpgsql as $$
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

drop trigger if exists picks_rules on picks;
create trigger picks_rules before insert or update on picks
  for each row execute function enforce_pick_rules();

-- ---------- new signups ----------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare s int;
begin
  if not exists (select 1 from allowlist a where a.email = lower(new.email)) then
    raise exception 'This email is not on the pool list. Ask the commissioner for an invite.';
  end if;

  insert into profiles (id, email, display_name, is_admin)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email,'@',1)),
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;

-- ============================================================
-- Row level security
-- ============================================================
alter table teams      enable row level security;
alter table seasons    enable row level security;
alter table weeks      enable row level security;
alter table games      enable row level security;
alter table profiles   enable row level security;
alter table entries    enable row level security;
alter table picks      enable row level security;
alter table allowlist  enable row level security;

-- everyone signed in can read the shared board
create policy read_teams   on teams   for select to authenticated using (true);
create policy read_seasons on seasons for select to authenticated using (true);
create policy read_weeks   on weeks   for select to authenticated using (true);
create policy read_games   on games   for select to authenticated using (true);
create policy read_profiles on profiles for select to authenticated using (true);
create policy read_entries on entries for select to authenticated using (true);

create policy own_profile_update on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- THE reveal rule: your own pick always; everyone else's only once the week is locked.
create policy read_picks on picks for select to authenticated using (
  user_id = auth.uid()
  or is_admin()
  or exists (
    select 1 from weeks w
    where w.season = picks.season and w.week = picks.week
      and w.lock_at is not null and now() >= w.lock_at
  )
);

create policy write_own_pick on picks for insert to authenticated
  with check (user_id = auth.uid());
create policy update_own_pick on picks for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy delete_own_pick on picks for delete to authenticated
  using (user_id = auth.uid());

create policy admin_allowlist on allowlist for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---------- pre-lock status ----------
-- Deliberately NOT security_invoker: it runs as owner and bypasses the picks RLS
-- policy above, exposing only "did this person pick yet", never which team.
create or replace view pick_status as
  select season, week, user_id, true as has_pick from picks;
grant select on pick_status to authenticated;

-- ============================================================
-- Seed
-- ============================================================
insert into seasons (year, final_week, active) values (2026, 17, true)
  on conflict (year) do nothing;

insert into weeks (season, week) select 2026, generate_series(1,18)
  on conflict do nothing;

insert into allowlist (email) values ('mike.f.dietrich@gmail.com')
  on conflict do nothing;

insert into teams (id, abbr, name, color) values
 ('ari','ARI','Arizona Cardinals','#97233F'),('atl','ATL','Atlanta Falcons','#A71930'),
 ('bal','BAL','Baltimore Ravens','#241773'),('buf','BUF','Buffalo Bills','#00338D'),
 ('car','CAR','Carolina Panthers','#0085CA'),('chi','CHI','Chicago Bears','#0B162A'),
 ('cin','CIN','Cincinnati Bengals','#FB4F14'),('cle','CLE','Cleveland Browns','#311D00'),
 ('dal','DAL','Dallas Cowboys','#003594'),('den','DEN','Denver Broncos','#FB4F14'),
 ('det','DET','Detroit Lions','#0076B6'),('gb','GB','Green Bay Packers','#203731'),
 ('hou','HOU','Houston Texans','#03202F'),('ind','IND','Indianapolis Colts','#002C5F'),
 ('jax','JAX','Jacksonville Jaguars','#006778'),('kc','KC','Kansas City Chiefs','#E31837'),
 ('lv','LV','Las Vegas Raiders','#333333'),('lac','LAC','Los Angeles Chargers','#0080C6'),
 ('lar','LAR','Los Angeles Rams','#003594'),('mia','MIA','Miami Dolphins','#008E97'),
 ('min','MIN','Minnesota Vikings','#4F2683'),('ne','NE','New England Patriots','#002244'),
 ('no','NO','New Orleans Saints','#D3BC8D'),('nyg','NYG','New York Giants','#0B2265'),
 ('nyj','NYJ','New York Jets','#125740'),('phi','PHI','Philadelphia Eagles','#004C54'),
 ('pit','PIT','Pittsburgh Steelers','#FFB612'),('sf','SF','San Francisco 49ers','#AA0000'),
 ('sea','SEA','Seattle Seahawks','#002244'),('tb','TB','Tampa Bay Buccaneers','#D50A0A'),
 ('ten','TEN','Tennessee Titans','#4B92DB'),('wsh','WSH','Washington Commanders','#5A1414')
on conflict (id) do nothing;
