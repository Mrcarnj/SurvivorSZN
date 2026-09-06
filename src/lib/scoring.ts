import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SEASON } from "@/lib/pool";

export type ScoreResult =
  | { error: string }
  | { ok: true; message: string; losers: number; wipeout: boolean };

/**
 * Score one week against the finals in `games`, and move the pool forward.
 *
 * Extracted from the commissioner action so the Tuesday cron can run the same
 * code path — there must be exactly one implementation of who loses a life.
 * Callers are responsible for authorisation; this takes a service-role client
 * and does no permission checking of its own.
 *
 * House rules applied here:
 *   loss    = your team lost, OR tied, OR you never picked
 *   wipeout = every surviving player lost, so nobody drops a life and the
 *             following week becomes one-team-per-player
 *
 * Idempotent: a week already marked scored refuses to score twice.
 */
export async function scoreWeekOnDb(
  admin: SupabaseClient,
  week: number,
  force = false
): Promise<ScoreResult> {
  const { data: wk } = await admin
    .from("weeks")
    .select("*")
    .eq("season", SEASON)
    .eq("week", week)
    .single();
  if (!wk) return { error: "Unknown week." };
  if (wk.scored) return { error: `Week ${week} is already scored.` };

  const { data: games } = await admin
    .from("games")
    .select("home,away,home_score,away_score,status")
    .eq("season", SEASON)
    .eq("week", week);

  if (!games?.length) return { error: `No games stored for week ${week}.` };

  const unfinished = games.filter((g) => g.status !== "final");
  if (unfinished.length && !force)
    return {
      error: `${unfinished.length} game(s) not final yet. Sync scores, or override.`,
    };

  // team -> W / L / T
  const outcome = new Map<string, "W" | "L" | "T">();
  for (const g of games) {
    if (g.status !== "final" || g.home_score == null || g.away_score == null)
      continue;
    if (g.home_score === g.away_score) {
      outcome.set(g.home!, "T");
      outcome.set(g.away!, "T");
    } else if (g.home_score > g.away_score) {
      outcome.set(g.home!, "W");
      outcome.set(g.away!, "L");
    } else {
      outcome.set(g.away!, "W");
      outcome.set(g.home!, "L");
    }
  }

  const { data: entries } = await admin
    .from("entries")
    .select("user_id,lives,eliminated")
    .eq("season", SEASON);
  const { data: picks } = await admin
    .from("picks")
    .select("user_id,team_id")
    .eq("season", SEASON)
    .eq("week", week);

  const pickBy = new Map((picks ?? []).map((p) => [p.user_id, p.team_id]));
  const alive = (entries ?? []).filter((e) => !e.eliminated);

  const losers = alive.filter((e) => {
    const t = pickBy.get(e.user_id);
    if (!t) return true; // no choice = loss
    const r = outcome.get(t);
    return r === "L" || r === "T" || r === undefined;
  });

  // stamp each pick's result for the season grid
  for (const [userId, teamId] of pickBy) {
    await admin
      .from("picks")
      .update({ result: outcome.get(teamId) ?? "L" })
      .eq("season", SEASON)
      .eq("week", week)
      .eq("user_id", userId);
  }

  let message: string;
  const wipeout = alive.length > 0 && losers.length === alive.length;

  if (wipeout) {
    await admin
      .from("weeks")
      .update({ exclusive: true })
      .eq("season", SEASON)
      .eq("week", week + 1);
    message = `Wipeout. All ${alive.length} survivors lost, so no lives were deducted. Week ${
      week + 1
    } is one team per player, first come first served.`;
  } else {
    for (const e of losers) {
      const lives = Math.max(0, e.lives - 1);
      await admin
        .from("entries")
        .update({ lives, eliminated: lives === 0 })
        .eq("season", SEASON)
        .eq("user_id", e.user_id);
    }
    message = losers.length
      ? `${losers.length} player(s) lost a life.`
      : `Everyone survived week ${week}.`;
  }

  await admin
    .from("weeks")
    .update({ scored: true })
    .eq("season", SEASON)
    .eq("week", week);

  return { ok: true, message, losers: losers.length, wipeout };
}
