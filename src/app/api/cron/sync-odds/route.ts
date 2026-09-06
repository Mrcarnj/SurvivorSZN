import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBettingOdds } from "@/lib/tank01";
import { SEASON } from "@/lib/pool";
import { isCronOrAdmin } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
// These loop over every game in a week; the default function timeout is tight.
export const maxDuration = 60;

/**
 * GET /api/cron/sync-odds
 *
 * Pulls DraftKings moneylines and spreads into `games`. The odds endpoint is
 * per calendar day, so one run costs one call per distinct game day — four in
 * a normal week (Thu/Sun/Mon plus whatever else), which is why this is a
 * scheduled job rather than something a page load triggers.
 *
 * Which days to fetch is read out of the games table rather than hardcoded to
 * Thu/Sun/Mon, so Black Friday, Saturday weeks and the London/Munich Sunday
 * morning games are all picked up without special-casing.
 *
 *   ?week=3            a specific week
 *   ?dates=20260913    explicit days, comma separated
 *   (neither)          the open week — what the Tuesday cron uses
 *
 * Auth: Bearer $CRON_SECRET, or a signed-in commissioner.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const admin = supabaseAdmin();

  if (!(await isCronOrAdmin(req)))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // ---- work out which calendar days to ask for ----
  let dates: string[];
  const explicit = url.searchParams.get("dates");

  if (explicit) {
    dates = explicit.split(",").map((d) => d.trim()).filter((d) => /^\d{8}$/.test(d));
  } else {
    const weekParam = url.searchParams.get("week");
    let week = weekParam ? Number(weekParam) : null;

    if (week === null) {
      const { data: weeks } = await admin
        .from("weeks")
        .select("week")
        .eq("season", SEASON)
        .eq("scored", false)
        .order("week");
      week = weeks?.[0]?.week ?? null;
    }
    if (week === null)
      return NextResponse.json({ skipped: "season complete" });

    const { data: games } = await admin
      .from("games")
      .select("game_id")
      .eq("season", SEASON)
      .eq("week", week);

    // game_id is "20260913_ARI@LAC" — the leading YYYYMMDD is the feed's own
    // Eastern game date. Deriving it from `kickoff` instead would be wrong:
    // a Sunday 8:20pm ET kickoff is Monday in UTC.
    dates = [
      ...new Set((games ?? []).map((g) => g.game_id.slice(0, 8))),
    ].sort();
  }

  if (!dates.length)
    return NextResponse.json({ skipped: "no game days found", dates: [] });

  // ---- fetch and write ----
  const now = new Date().toISOString();
  const perDay: Record<string, { games: number; withLines: number }> = {};
  let updated = 0;

  for (const gameDate of dates) {
    const rows = await getBettingOdds(gameDate);
    let withLines = 0;

    for (const o of rows) {
      const hasLine =
        o.homeML !== null ||
        o.awayML !== null ||
        o.homeSpread !== null ||
        o.awaySpread !== null;
      if (!hasLine) continue; // don't stamp odds_updated_at on an empty book
      withLines++;

      const { error } = await admin
        .from("games")
        .update({
          home_team_ml: o.homeML,
          away_team_ml: o.awayML,
          home_team_spread: o.homeSpread,
          away_team_spread: o.awaySpread,
          odds_updated_at: now,
        })
        .eq("game_id", o.gameId);
      if (!error) updated++;
    }
    perDay[gameDate] = { games: rows.length, withLines };
  }

  return NextResponse.json({ dates, updated, perDay });
}
