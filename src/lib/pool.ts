import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

export const SEASON = Number(process.env.POOL_SEASON ?? 2026);

export type Team = { id: string; abbr: string; name: string; color: string };
export type Week = {
  season: number;
  week: number;
  lock_at: string | null;
  exclusive: boolean;
  scored: boolean;
};
export type Pick = {
  season: number;
  week: number;
  user_id: string;
  team_id: string;
  result: "W" | "L" | "T" | null;
};
export type Entry = {
  user_id: string;
  lives: number;
  rebuy_used: boolean;
  eliminated: boolean;
};
export type Profile = {
  id: string;
  display_name: string;
  email: string;
  is_admin: boolean;
};

export const isLocked = (w: Week | undefined) =>
  !!w?.lock_at && new Date(w.lock_at) <= new Date();

/** One life each, plus the one-time buy-back life if they've paid for it. */
export const maxLives = (e: Entry) => 1 + (e.rebuy_used ? 1 : 0);

/**
 * The live week is the lowest unscored week. Everything before it is history.
 */
export async function currentWeek(weeks: Week[]) {
  const open = weeks.filter((w) => !w.scored).sort((a, b) => a.week - b.week);
  return open[0] ?? weeks[weeks.length - 1];
}

/** One round trip for everything the board needs. */
export async function loadPool() {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();

  const [teams, weeks, profiles, entries, picks, status] = await Promise.all([
    sb.from("teams").select("*").order("name"),
    sb.from("weeks").select("*").eq("season", SEASON).order("week"),
    sb.from("profiles").select("id,display_name,email,is_admin").order("display_name"),
    sb.from("entries").select("user_id,lives,rebuy_used,eliminated").eq("season", SEASON),
    sb.from("picks").select("season,week,user_id,team_id,result").eq("season", SEASON),
    sb.from("pick_status").select("week,user_id,has_pick").eq("season", SEASON),
  ]);

  const weekRows = (weeks.data ?? []) as Week[];
  const week = await currentWeek(weekRows);

  return {
    user,
    me: (profiles.data ?? []).find((p) => p.id === user?.id) as Profile | undefined,
    teams: (teams.data ?? []) as Team[],
    weeks: weekRows,
    week,
    locked: isLocked(week),
    profiles: (profiles.data ?? []) as Profile[],
    entries: (entries.data ?? []) as Entry[],
    picks: (picks.data ?? []) as Pick[],
    // who has submitted, without revealing what — safe before lock
    submitted: new Set(
      (status.data ?? [])
        .filter((r: { week: number }) => r.week === week?.week)
        .map((r: { user_id: string }) => r.user_id)
    ),
  };
}

/** Teams this player has already burned. Excludes an unrevealed current pick. */
export function usedTeams(
  picks: Pick[],
  userId: string,
  currentWeekNo: number,
  reveal: boolean
) {
  return new Set(
    picks
      .filter(
        (p) =>
          p.user_id === userId &&
          (p.week < currentWeekNo || (p.week === currentWeekNo && reveal))
      )
      .map((p) => p.team_id)
  );
}
