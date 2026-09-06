import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SEASON } from "@/lib/pool";

export type ScoreResult =
  | { error: string }
  | {
      ok: true;
      message: string;
      losers: number;
      wipeout: boolean;
      /** Set when the pool is decided outright — nobody can buy back in. */
      championUserId?: string;
      /**
       * Last player standing, but an eliminated player still holds an unused
       * re-buy. Provisional until the commissioner confirms.
       */
      pendingChampionUserId?: string;
    };

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
 *             following week becomes one-team-per-player. Needs 2+ survivors:
 *             with one player left "everybody lost" is trivially true, and
 *             letting it fire would make the last player unkillable.
 *   winner  = the moment exactly one player still holds a life. If nobody
 *             else can buy back in, that is final and they win outright. If an
 *             eliminated player still has an unused re-buy and re-buys are
 *             still open, the result is only provisional — recorded as pending
 *             for the commissioner to confirm, because that player may yet buy
 *             back and keep the pool alive.
 *
 * Idempotent: a week already marked scored refuses to score twice.
 */
export async function scoreWeekOnDb(
  admin: SupabaseClient,
  week: number,
  force = false
): Promise<ScoreResult> {
  const { data: season } = await admin
    .from("seasons")
    .select("champion_user_id,final_week")
    .eq("year", SEASON)
    .single();
  if (season?.champion_user_id)
    return { error: "This pool already has a winner." };

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
  // 2+ survivors: see the wipeout note above.
  const wipeout = alive.length >= 2 && losers.length === alive.length;

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

  // Re-read entries: the loop above changed who is still alive.
  const { data: settled } = await admin
    .from("entries")
    .select("user_id,eliminated,rebuy_used")
    .eq("season", SEASON);
  const survivors = (settled ?? []).filter((e) => !e.eliminated);

  let championUserId: string | undefined;
  let pendingChampionUserId: string | undefined;

  // One player left, and someone actually got knocked out to get there.
  if (survivors.length === 1 && (settled ?? []).length >= 2) {
    const lastStanding = survivors[0].user_id;
    const { data: who } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", lastStanding)
      .single();
    const name = who?.display_name ?? "One player";

    // A re-buy is only a live possibility while re-buys are still open. The
    // next open week is this one plus one; grantRebuy refuses from final_week
    // on, so mirror that rule here rather than duplicating a different one.
    const finalWeek = season?.final_week ?? 17;
    const rebuysStillOpen = week + 1 < finalWeek;
    const canBuyBack = rebuysStillOpen
      ? (settled ?? []).filter((e) => e.eliminated && !e.rebuy_used).length
      : 0;

    if (canBuyBack === 0) {
      // Nobody can come back — the pool is decided.
      championUserId = lastStanding;
      await admin
        .from("seasons")
        .update({
          champion_user_id: championUserId,
          pending_champion_user_id: null,
          completed_at: new Date().toISOString(),
        })
        .eq("year", SEASON);
      message += ` ${name} is the last one standing and wins the pool.`;
    } else {
      // Provisional: an eliminated player could still buy back in.
      pendingChampionUserId = lastStanding;
      await admin
        .from("seasons")
        .update({ pending_champion_user_id: pendingChampionUserId })
        .eq("year", SEASON);
      message +=
        ` ${name} is the last one standing, but ${canBuyBack} eliminated player(s)` +
        ` still have a re-buy available. The commissioner needs to confirm the win` +
        ` or wait for a buy-back.`;
    }
  }

  return {
    ok: true,
    message,
    losers: losers.length,
    wipeout,
    championUserId,
    pendingChampionUserId,
  };
}
