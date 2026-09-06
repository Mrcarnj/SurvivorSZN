import Shell from "@/components/Shell";
import PickForm from "@/components/PickForm";
import { Hearts, TeamChip } from "@/components/ui";
import { loadPool, usedTeams } from "@/lib/pool";

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
  const burnedSet = new Set(burned);
  const remaining = p.teams.filter((t) => !burnedSet.has(t.id));

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
          before then.
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
        />
      </section>

      <section className="panel">
        <h2>Your teams</h2>
        <div className="sub">
          {remaining.length} of 32 still available. A red X means you&apos;ve
          already burned it.
        </div>
        <div className="roster">
          <div className="card">
            <div className="head">
              <span className="name">{p.me?.display_name ?? "You"}</span>
              <Hearts entry={myEntry} />
              <span className="count">{remaining.length} of 32 left</span>
            </div>
            <div className="grid">
              {p.teams.map((t) => (
                <TeamChip key={t.id} team={t} small used={burnedSet.has(t.id)} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </Shell>
  );
}
