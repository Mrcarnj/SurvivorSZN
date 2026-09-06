import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getWeekScores } from "@/lib/tank01";
import { SEASON } from "@/lib/pool";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/sync-scores   (Authorization: Bearer $CRON_SECRET)
 *
 * Refreshes scores for the open week and writes them to Postgres. Every browser
 * reads the database, never RapidAPI, so 20 people watching on Sunday costs the
 * same number of API calls as one person.
 *
 * It exits early when the open week has no game in progress or recently
 * finished, so a cron running every minute all week still only spends calls
 * during actual game windows.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();

  const { data: weeks } = await admin
    .from("weeks")
    .select("week,lock_at,scored")
    .eq("season", SEASON)
    .eq("scored", false)
    .order("week");
  const open = weeks?.[0];
  if (!open) return NextResponse.json({ skipped: "season complete" });

  const { data: games } = await admin
    .from("games")
    .select("game_id,kickoff,status")
    .eq("season", SEASON)
    .eq("week", open.week);

  const now = Date.now();
  const inWindow = (games ?? []).some((g) => {
    if (g.status === "final") return false;
    if (!g.kickoff) return false;
    const k = new Date(g.kickoff).getTime();
    return now >= k - 5 * 60_000 && now <= k + 5 * 60 * 60_000;
  });
  if (!inWindow) {
    return NextResponse.json({ skipped: "no games live", week: open.week });
  }

  const scores = await getWeekScores({ season: String(SEASON), week: open.week });
  let updated = 0;
  for (const g of scores) {
    const { error } = await admin
      .from("games")
      .update({
        status: g.status,
        home_score: g.homeScore,
        away_score: g.awayScore,
        updated_at: new Date().toISOString(),
      })
      .eq("game_id", g.gameId);
    if (!error) updated++;
  }

  return NextResponse.json({ week: open.week, updated });
}
