import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getWeeklySchedule } from "@/lib/tank01";
import { SEASON } from "@/lib/pool";

/**
 * POST /api/admin/sync-schedule?week=all
 *
 * One call pulls every regular-season game. Run it in preseason, then again
 * weekly to catch flex-schedule moves. Sets weeks.lock_at to the earliest
 * kickoff of each week, which handles Thursday 8:15, the Friday Black Friday
 * game, and international Sunday-morning starts without hardcoding a time.
 */
export async function POST(req: Request) {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: profile } = await sb
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin)
    return NextResponse.json({ error: "commissioner only" }, { status: 403 });

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
      status: g.status,
      home_score: g.homeScore,
      away_score: g.awayScore,
      updated_at: new Date().toISOString(),
    }));

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
