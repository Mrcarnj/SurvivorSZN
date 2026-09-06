import Shell from "@/components/Shell";
import { Hearts, TeamChip, CheckChip } from "@/components/ui";
import { loadPool, usedTeams } from "@/lib/pool";

export const dynamic = "force-dynamic";

export default async function SeasonPage() {
  const p = await loadPool();
  const week = p.week;
  const teamById = new Map(p.teams.map((t) => [t.id, t]));
  const weeks = p.weeks.map((w) => w.week);
  const cur = week?.week ?? 1;

  return (
    <Shell
      tab="season"
      week={cur}
      lockAt={week?.lock_at ?? null}
      isAdmin={!!p.me?.is_admin}
      entrants={p.entries.length}
    >
      <section className="panel">
        <h2>Season results</h2>
        <div className="sub">
          Greyed out with a red X means that pick lost or tied. Yellow ring means it won.
        </div>
        <div className="scroller">
          <table className="season">
            <thead>
              <tr>
                <th className="name-col">Player</th>
                {weeks.map((w) => (
                  <th key={w} className={w === cur ? "cur" : ""}>
                    {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.profiles.map((person) => {
                const entry = p.entries.find((e) => e.user_id === person.id);
                return (
                  <tr key={person.id}>
                    <th className="name-col">
                      {person.display_name} <Hearts entry={entry} />
                    </th>
                    {weeks.map((w) => {
                      const wk = p.weeks.find((x) => x.week === w);
                      const pick = p.picks.find(
                        (x) => x.week === w && x.user_id === person.id
                      );
                      const team = pick ? teamById.get(pick.team_id) : undefined;
                      const hidden = w === cur && !p.locked;
                      const lost = pick?.result === "L" || pick?.result === "T";

                      let inner: React.ReactNode = <span className="cell-x">·</span>;
                      if (hidden) {
                        if (p.submitted.has(person.id)) inner = <CheckChip small />;
                      } else if (team) {
                        inner = (
                          <TeamChip
                            team={team}
                            small
                            used={lost}
                            win={pick?.result === "W"}
                          />
                        );
                      } else if (wk?.scored && !entry?.eliminated) {
                        inner = (
                          <span className="cell-nc">
                            NO
                            <br />
                            CHOICE
                          </span>
                        );
                      }
                      return (
                        <td key={w} className={w === cur ? "cur" : ""}>
                          {inner}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Teams used and remaining</h2>
        <div className="sub">
          All 32 teams, alphabetical. A red X means that player has burned it.
        </div>
        <div className="roster">
          {p.profiles.map((person) => {
            const used = usedTeams(p.picks, person.id, cur, p.locked);
            const entry = p.entries.find((e) => e.user_id === person.id);
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
    </Shell>
  );
}
