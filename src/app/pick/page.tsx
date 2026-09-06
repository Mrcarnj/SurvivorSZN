import Shell from "@/components/Shell";
import PickForm from "@/components/PickForm";
import { loadPool, usedTeams, SEASON } from "@/lib/pool";
import { supabaseServer } from "@/lib/supabase/server";
import type { TeamOdds } from "@/components/PickForm";

export const dynamic = "force-dynamic";

/**
 * Your pick, and only yours. Split out of the board so the thing you actually
 * do each week isn't buried under everyone else's rows.
 */
export default async function PickPage() {
  const p = await loadPool();
  const week = p.week;
  const user = p.user;
  if (!week || !user)
    return <div className="wrap">No season configured. Run the migration.</div>;

  const myPick =
    p.picks.find((x) => x.week === week.week && x.user_id === user.id) ?? null;
  const myEntry = p.entries.find((e) => e.user_id === user.id);

  // Teams burned in earlier weeks. The current week's pick is excluded so you
  // can still see and change it.
  const burned = [...usedTeams(p.picks, user.id, week.week, p.locked)].filter(
    (t) => t !== myPick?.team_id
  );
  // This week's games, keyed by team. A team with no entry here is on a bye:
  // that is what drives the greyed-out BYE state, rather than a hardcoded list.
  const sb = await supabaseServer();
  const { data: games } = await sb
    .from("games")
    .select(
      "home,away,home_team_ml,away_team_ml,home_team_spread,away_team_spread"
    )
    .eq("season", SEASON)
    .eq("week", week.week);

  // numeric(4,1) comes back from PostgREST as a string, so coerce explicitly.
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const odds: Record<string, TeamOdds> = {};
  for (const g of games ?? []) {
    if (g.home)
      odds[g.home] = {
        ml: num(g.home_team_ml),
        spread: num(g.home_team_spread),
        opponent: g.away,
        home: true,
      };
    if (g.away)
      odds[g.away] = {
        ml: num(g.away_team_ml),
        spread: num(g.away_team_spread),
        opponent: g.home,
        home: false,
      };
  }
  const byeCount = p.teams.filter((t) => !odds[t.id]).length;

  // On a wipeout week, teams already claimed by someone else are off the board.
  const takenIds = week.exclusive
    ? p.picks
        .filter((x) => x.week === week.week && x.user_id !== user.id)
        .map((x) => x.team_id)
    : [];

  return (
    <Shell
      tab="pick"
      week={week.week}
      lockAt={week.lock_at}
      isAdmin={!!p.me?.is_admin}
      entrants={p.entries.length}
    >
      <section className="panel">
        <h2>Your week {week.week} pick</h2>
        <div className="sub">
          Only you can see this until kickoff. Change it as often as you like
          before then. Lines are DraftKings.
          {byeCount > 0 && ` ${byeCount} team${byeCount === 1 ? "" : "s"} on bye.`}
        </div>

        {week.exclusive && (
          <div className="banner alarm">
            <strong>Wipeout week rules in effect.</strong> This week only, no two
            players can hold the same team — first pick in gets it.
          </div>
        )}

        <PickForm
          week={week.week}
          teams={p.teams}
          usedIds={burned}
          takenIds={takenIds}
          currentPick={myPick?.team_id ?? null}
          locked={p.locked}
          eliminated={!!myEntry?.eliminated}
          odds={odds}
        />
      </section>

    </Shell>
  );
}
