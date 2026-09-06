import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getWeeklySchedule } from "@/lib/tank01";
import { SEASON } from "@/lib/pool";
import { isCronOrAdmin } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET|POST /api/admin/sync-schedule?week=all
 *
 * One call pulls every regular-season game. Run it in preseason, then again
 * weekly to catch flex-schedule moves. Sets weeks.lock_at to the earliest
 * kickoff of each week, which handles Thursday 8:15, the Friday Black Friday
 * game, and international Sunday-morning starts without hardcoding a time.
 */
async function run(req: Request) {
  if (!(await isCronOrAdmin(req)))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const week = new URL(req.url).searchParams.get("week") ?? "all";
  const admin = supabaseAdmin();

  const games = await getWeeklySchedule({ season: String(SEASON), week });
  const { data: teams } = await admin.from("teams").select("id,abbr");
  const byAbbr = new Map((teams ?? []).map((t) => [t.abbr, t.id]));

  const rows = games
    .filter((g) => g.week > 0 && byAbbr.has(g.homeAbbr) && byAbbr.has(g.awayAbbr))
    .map((g) => ({
      game_id: g.gameId,
      season: SEASON,
      week: g.week,
      season_type: g.seasonType,
      home: byAbbr.get(g.homeAbbr)!,
      away: byAbbr.get(g.awayAbbr)!,
      kickoff: g.kickoff?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    }));
  // Deliberately no status/home_score/away_score here. This endpoint owns the
  // schedule; sync-scores owns results. getNFLGamesForWeek reports a played
  // game as Final but carries no points, so upserting those columns would
  // blank out stored finals on every refresh — leaving status='final' with
  // null scores, which destroys the audit trail and makes a re-score count
  // every team as a loss. Omitted columns are left untouched on conflict.

  if (rows.length) {
    const { error } = await admin.from("games").upsert(rows, { onConflict: "game_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // lock each week at its first kickoff
  const earliest = new Map<number, string>();
  for (const r of rows) {
    if (!r.kickoff) continue;
    const cur = earliest.get(r.week);
    if (!cur || r.kickoff < cur) earliest.set(r.week, r.kickoff);
  }
  for (const [wk, lock] of earliest) {
    await admin
      .from("weeks")
      .update({ lock_at: lock })
      .eq("season", SEASON)
      .eq("week", wk)
      .eq("scored", false);
  }

  const unmatched = games.filter(
    (g) => !byAbbr.has(g.homeAbbr) || !byAbbr.has(g.awayAbbr)
  );

  return NextResponse.json({
    synced: rows.length,
    weeksLocked: earliest.size,
    // If this is non-empty, Tank01 uses a different abbreviation than the seed
    // (WSH vs WAS is the usual culprit). Fix teams.abbr and re-run.
    unmatchedAbbrs: [
      ...new Set(unmatched.flatMap((g) => [g.homeAbbr, g.awayAbbr])),
    ].filter((a) => !byAbbr.has(a)),
  });
}

// POST from the commissioner's browser, GET so a scheduler can call it too.
export const POST = run;
export const GET = run;
