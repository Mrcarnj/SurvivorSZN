import Shell from "@/components/Shell";
import { Hearts, TeamChip, CheckChip } from "@/components/ui";
import { loadPool } from "@/lib/pool";

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
    </Shell>
  );
}
