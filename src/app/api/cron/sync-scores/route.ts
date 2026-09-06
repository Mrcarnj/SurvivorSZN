import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getWeekScores } from "@/lib/tank01";
import { scoreWeekOnDb } from "@/lib/scoring";
import { SEASON } from "@/lib/pool";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/sync-scores
 *
 * Pulls finals for the open week into `games`, then scores the week once every
 * game is final: works out who won, and takes the lives.
 *
 * Intended to run Tuesday morning, after Monday night is in the books. It is
 * also safe to run every couple of minutes during the games — the fetch gate
 * below means it only spends a call when there is something to learn, so the
 * same endpoint serves both schedules.
 *
 *   ?week=3     score a specific week instead of the open one
 *   ?force=1    score even with games still unfinished (commissioner override)
 *
 * Auth: Bearer $CRON_SECRET, or a signed-in commissioner.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const admin = supabaseAdmin();

  const auth = req.headers.get("authorization");
  let allowed =
    !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!allowed) {
    const sb = await supabaseServer();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (user) {
      const { data: profile } = await sb
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();
      allowed = !!profile?.is_admin;
    }
  }
  if (!allowed)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const weekParam = url.searchParams.get("week");
  const force = url.searchParams.get("force") === "1";

  let week: number;
  if (weekParam) {
    week = Number(weekParam);
  } else {
    const { data: weeks } = await admin
      .from("weeks")
      .select("week")
      .eq("season", SEASON)
      .eq("scored", false)
      .order("week");
    if (!weeks?.length)
      return NextResponse.json({ skipped: "season complete" });
    week = weeks[0].week;
  }

  const { data: games } = await admin
    .from("games")
    .select("game_id,kickoff,status")
    .eq("season", SEASON)
    .eq("week", week);

  if (!games?.length)
    return NextResponse.json({ week, skipped: "no games stored for this week" });

  // Fetch when any game has kicked off but isn't recorded final yet. That
  // covers a Tuesday morning catch-up as well as live polling, and costs
  // nothing once every game is final.
  //
  // The previous rule was a window of kickoff-5m..kickoff+5h, which meant a
  // Tuesday run always fell outside it and never fetched at all.
  const now = Date.now();
  const pending = games.filter(
    (g) => g.status !== "final" && g.kickoff && new Date(g.kickoff).getTime() <= now
  );

  let updated = 0;
  if (pending.length) {
    const scores = await getWeekScores({ season: String(SEASON), week });
    const stamp = new Date().toISOString();
    for (const g of scores) {
      // Never overwrite a stored final with an empty score.
      if (g.status !== "final" && g.homeScore === null && g.awayScore === null)
        continue;
      const { error } = await admin
        .from("games")
        .update({
          status: g.status,
          home_score: g.homeScore,
          away_score: g.awayScore,
          updated_at: stamp,
        })
        .eq("game_id", g.gameId);
      if (!error) updated++;
    }
  }

  // Re-read so the scoring decision uses what we just wrote.
  const { data: after } = await admin
    .from("games")
    .select("status")
    .eq("season", SEASON)
    .eq("week", week);
  const unfinished = (after ?? []).filter((g) => g.status !== "final").length;

  if (unfinished && !force)
    return NextResponse.json({
      week,
      updated,
      unfinished,
      scored: false,
      note: "waiting for every game to go final",
    });

  const result = await scoreWeekOnDb(admin, week, force);
  if ("error" in result)
    return NextResponse.json({ week, updated, scored: false, note: result.error });

  return NextResponse.json({
    week,
    updated,
    scored: true,
    wipeout: result.wipeout,
    losers: result.losers,
    message: result.message,
  });
}
