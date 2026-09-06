"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SEASON } from "@/lib/pool";

async function me() {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data: profile } = await sb
    .from("profiles")
    .select("id,is_admin,display_name")
    .eq("id", user.id)
    .single();
  return { sb, user, profile };
}

async function requireAdmin() {
  const ctx = await me();
  if (!ctx.profile?.is_admin) throw new Error("Commissioner only");
  return ctx;
}

/* ------------------------------------------------------------------ picks */

export async function submitPick(week: number, teamId: string) {
  const { sb, user } = await me();

  // The database enforces lock time, one-team-per-season, and wipeout-week
  // exclusivity. This just surfaces a readable message.
  const { error } = await sb
    .from("picks")
    .upsert(
      { season: SEASON, week, user_id: user.id, team_id: teamId },
      { onConflict: "season,week,user_id" }
    );

  if (error) {
    if (error.code === "23505" && error.message.includes("user_id_team_id"))
      return { error: "You have already used that team this season." };
    if (error.code === "23505")
      return { error: "Someone else claimed that team first this week." };
    return { error: error.message.replace(/^.*ERROR:\s*/, "") };
  }
  revalidatePath("/");
  return { ok: true };
}

export async function clearPick(week: number) {
  const { sb, user } = await me();
  const { error } = await sb
    .from("picks")
    .delete()
    .eq("season", SEASON)
    .eq("week", week)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/");
  return { ok: true };
}

/* ------------------------------------------------------- commissioner ops */

export async function inviteEmails(raw: string) {
  const { user } = await requireAdmin();
  const emails = raw
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
  if (!emails.length) return { error: "No valid email addresses." };

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("allowlist")
    .upsert(emails.map((email) => ({ email, invited_by: user.id })), {
      onConflict: "email",
    });
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return { ok: true, added: emails.length };
}

export async function grantRebuy(userId: string) {
  await requireAdmin();
  const admin = supabaseAdmin();

  const { data: season } = await admin
    .from("seasons")
    .select("final_week")
    .eq("year", SEASON)
    .single();
  const { data: weeks } = await admin
    .from("weeks")
    .select("week")
    .eq("season", SEASON)
    .eq("scored", false)
    .order("week");
  const openWeek = weeks?.[0]?.week ?? 1;

  if (openWeek >= (season?.final_week ?? 17))
    return { error: `No re-buys in week ${season?.final_week ?? 17}.` };

  const { data: entry } = await admin
    .from("entries")
    .select("lives,rebuy_used")
    .eq("season", SEASON)
    .eq("user_id", userId)
    .single();
  if (!entry) return { error: "No entry found." };
  if (entry.rebuy_used) return { error: "That player has already re-bought." };

  const { error } = await admin
    .from("entries")
    .update({
      lives: entry.lives + 1,
      rebuy_used: true,
      rebuy_paid_at: new Date().toISOString(),
      eliminated: false,
    })
    .eq("season", SEASON)
    .eq("user_id", userId);
  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Score a week. Reads finals out of `games`, applies the house rules, and
 * moves the pool forward. Idempotent — a scored week refuses to score twice.
 *
 * Rules applied here:
 *   loss  = your team lost, OR tied, OR you never picked
 *   wipeout = every surviving player lost, so nobody drops a life and the
 *             following week becomes one-team-per-player
 */
export async function scoreWeek(week: number, force = false) {
  await requireAdmin();
  const admin = supabaseAdmin();

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

  const unfinished = (games ?? []).filter((g) => g.status !== "final");
  if (unfinished.length && !force)
    return {
      error: `${unfinished.length} game(s) not final yet. Sync scores, or override.`,
    };

  // team -> W / L / T
  const outcome = new Map<string, "W" | "L" | "T">();
  for (const g of games ?? []) {
    if (g.status !== "final" || g.home_score == null || g.away_score == null) continue;
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

  revalidatePath("/");
  revalidatePath("/season");
  revalidatePath("/admin");
  return { ok: true, message };
}

export async function undoScoring(week: number) {
  await requireAdmin();
  const admin = supabaseAdmin();
  await admin
    .from("weeks")
    .update({ scored: false })
    .eq("season", SEASON)
    .eq("week", week);
  revalidatePath("/admin");
  return {
    ok: true,
    message:
      "Week reopened. Lives were NOT restored — adjust them by hand if you re-score.",
  };
}
