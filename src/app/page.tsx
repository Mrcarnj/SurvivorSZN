import Shell from "@/components/Shell";
import PickForm from "@/components/PickForm";
import { Hearts, TeamChip, CheckChip, EmptyChip } from "@/components/ui";
import { loadPool, usedTeams } from "@/lib/pool";

export const dynamic = "force-dynamic";

export default async function ThisWeek() {
  const p = await loadPool();
  const week = p.week;
  if (!week)
    return <div className="wrap">No season configured. Run the migration.</div>;

  const teamById = new Map(p.teams.map((t) => [t.id, t]));
  const entryOf = (id: string) => p.entries.find((e) => e.user_id === id);
  const pickOf = (id: string) =>
    p.picks.find((x) => x.week === week.week && x.user_id === id) ?? null;

  const myPick = p.user ? pickOf(p.user.id) : null;
  const myEntry = p.user ? entryOf(p.user.id) : undefined;
  const myUsed = p.user
    ? [...usedTeams(p.picks, p.user.id, week.week, p.locked)].filter(
        (t) => t !== myPick?.team_id
      )
    : [];

  // On a wipeout week, teams already claimed by someone else are off the board.
  const takenIds = week.exclusive
    ? p.picks
        .filter((x) => x.week === week.week && x.user_id !== p.user?.id)
        .map((x) => x.team_id)
    : [];

  const alive = p.entries.filter((e) => !e.eliminated).length;

  return (
    <Shell
      tab="week"
      week={week.week}
      lockAt={week.lock_at}
      isAdmin={!!p.me?.is_admin}
      entrants={p.entries.length}
    >
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
            ? "Picks are open. Everyone's team stays visible from here on."
            : "Picks are hidden until kickoff. A check mark means that player is in."}
        </div>

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
            const isYou = person.id === p.user?.id;

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

      <section className="panel">
        <h2>Make your pick</h2>
        <div className="sub">Only you can see this until kickoff.</div>
        <PickForm
          week={week.week}
          teams={p.teams}
          usedIds={myUsed}
          takenIds={takenIds}
          currentPick={myPick?.team_id ?? null}
          locked={p.locked}
          eliminated={!!myEntry?.eliminated}
        />
      </section>

      <section className="panel">
        <h2>Teams used and remaining</h2>
        <div className="sub">
          All 32 teams, alphabetical. A red X means that player has burned it.
        </div>
        <div className="roster">
          {p.profiles.map((person) => {
            const used = usedTeams(p.picks, person.id, week.week, p.locked);
            const entry = entryOf(person.id);
            return (
              <div
                key={person.id}
                className="card"
                style={entry?.eliminated ? { opacity: 0.5 } : undefined}
              >
                <div className="head">
                  <span className="name">{person.display_name}</span>
                  <Hearts entry={entry} />
                  <span className="count">{32 - used.size} of 32 left</span>
                </div>
                <div className="grid">
                  {p.teams.map((t) => (
                    <TeamChip key={t.id} team={t} small used={used.has(t.id)} />
                  ))}
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
