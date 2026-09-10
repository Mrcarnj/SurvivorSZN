import Link from "next/link";
import Shell from "@/components/Shell";
import Landing from "@/components/Landing";
import WeekResult, { type WeekOutcome } from "@/components/WeekResult";
import { Hearts, TeamChip, CheckChip, EmptyChip } from "@/components/ui";
import { loadPool, SEASON } from "@/lib/pool";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ThisWeek() {
  // Signed-out visitors get the public landing page rather than a redirect, so
  // the pool has a front door. Checked before loadPool() so we don't run six
  // queries that RLS would return empty anyway.
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return <Landing />;

  const p = await loadPool();
  const week = p.week;
  if (!week)
    return <div className="wrap">No season configured. Run the migration.</div>;

  const teamById = new Map(p.teams.map((t) => [t.id, t]));
  const entryOf = (id: string) => p.entries.find((e) => e.user_id === id);
  const pickOf = (id: string) =>
    p.picks.find((x) => x.week === week.week && x.user_id === id) ?? null;

  const myPick = pickOf(user.id);
  const myEntry = entryOf(user.id);
  const alive = p.entries.filter((e) => !e.eliminated).length;

  const last = p.weeks
    .filter((w) => w.scored)
    .sort((a, b) => b.week - a.week)[0];
  const result = last && myEntry ? await weekOutcome(user.id, last.week, myEntry, p) : null;

  return (
    <Shell
      tab="week"
      week={week.week}
      lockAt={week.lock_at}
      isAdmin={!!p.me?.is_admin}
      entrants={p.entries.length}
    >
      {last && result && (
        <WeekResult season={SEASON} week={last.week} userId={user.id} outcome={result} />
      )}
      <section className="panel">
        <h2>Week {week.week} picks</h2>
        <div className="sub">
          {alive} still alive · {p.entries.length - alive} eliminated
        </div>

        {week.exclusive && (
          <div className="banner alarm">
            <strong>Wipeout week rules in effect.</strong> Everyone lost last week, so
            nobody dropped a life. This week only, no two players can hold the same
            team — first pick in gets it.
          </div>
        )}
        <div className="banner">
          {p.locked
            ? "Picks are locked. Everyone's team stays visible from here on."
            : "Picks are hidden until kickoff. A check mark means that player is in."}
        </div>

        {!p.locked && !myEntry?.eliminated && (
          <div className="row" style={{ marginBottom: 14 }}>
            <Link className="btn" href="/pick">
              {myPick ? "Change your pick" : "Make your pick"}
            </Link>
            {myPick && <span className="note">You&apos;re in for week {week.week}.</span>}
          </div>
        )}

        <div className="card">
          <div className="prow hdr">
            <div>Player</div>
            <div>Pick</div>
            <div style={{ justifySelf: "end" }}>Lives</div>
          </div>

          {p.profiles.map((person) => {
            const entry = entryOf(person.id);
            const pick = pickOf(person.id);
            const team = pick ? teamById.get(pick.team_id) : undefined;
            const out = entry?.eliminated;
            const isYou = person.id === user.id;

            let cell: React.ReactNode;
            if (out) {
              cell = (
                <>
                  <EmptyChip />
                  <span className="tname">—</span>
                </>
              );
            } else if (!p.locked) {
              cell = p.submitted.has(person.id) ? (
                <>
                  <CheckChip />
                  <span className="tname">
                    {isYou && team ? team.name : "pick submitted"}
                  </span>
                </>
              ) : (
                <>
                  <EmptyChip />
                  <span className="tname">waiting</span>
                </>
              );
            } else if (team) {
              cell = (
                <>
                  <TeamChip team={team} />
                  <span className="tname">{team.name}</span>
                </>
              );
            } else {
              cell = (
                <>
                  <EmptyChip />
                  <span className="nochoice">NO CHOICE</span>
                </>
              );
            }

            return (
              <div
                key={person.id}
                className={`prow${out ? " out" : ""}${isYou ? " you" : ""}`}
              >
                <div className="who">
                  {person.display_name}
                  {isYou && " (you)"}
                  <br />
                  {out && <span className="tag out">eliminated</span>}
                  {entry?.rebuy_used && <span className="tag rebuy"> re-buy</span>}
                </div>
                <div className="pick">{cell}</div>
                <div className="lives">
                  <Hearts entry={entry} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <footer>
        Scores sync from Tank01 into Supabase. Signed in as {p.me?.email}.
      </footer>
    </Shell>
  );
}

type Pool = Awaited<ReturnType<typeof loadPool>>;

/**
 * How the latest scored week went for this player, or null if they weren't in
 * it (knocked out in an earlier week).
 *
 * Under one-life rules a loss is always an elimination. A lost pick proves it
 * on its own; a no-pick loss needs entries.eliminated_week (migration 0010),
 * which is queried separately so a missing column can't break the board.
 */
async function weekOutcome(
  userId: string,
  week: number,
  entry: Pool["entries"][number],
  p: Pool
): Promise<WeekOutcome | null> {
  const sb = await supabaseServer();
  const [{ data: stamp }, { data: season }] = await Promise.all([
    sb
      .from("entries")
      .select("eliminated_week")
      .eq("season", SEASON)
      .eq("user_id", userId)
      .maybeSingle(),
    sb.from("seasons").select("final_week,champion_user_id").eq("year", SEASON).maybeSingle(),
  ]);

  const pick = p.picks.find((x) => x.week === week && x.user_id === userId);
  // scoreWeekOnDb flags the week after a wipeout as exclusive.
  const wipeout = !!p.weeks.find((w) => w.week === week + 1)?.exclusive;

  const lost =
    stamp?.eliminated_week === week ||
    (!wipeout && (pick?.result === "L" || pick?.result === "T"));

  if (lost) {
    if (!entry.eliminated) return entry.rebuy_used ? "boughtBack" : null;
    // Same rule as grantRebuy: re-buys close at final_week, and not at all
    // once someone has been crowned.
    const canBuyBack =
      !entry.rebuy_used &&
      !season?.champion_user_id &&
      week + 1 < (season?.final_week ?? 17);
    return canBuyBack ? "buyback" : "done";
  }
  if (!pick) return null;
  if (pick.result === "W") return "survived";
  return wipeout ? "wipeout" : null;
}
