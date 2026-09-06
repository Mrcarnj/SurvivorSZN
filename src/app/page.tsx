import Link from "next/link";
import Shell from "@/components/Shell";
import Landing from "@/components/Landing";
import { Hearts, TeamChip, CheckChip, EmptyChip } from "@/components/ui";
import { loadPool } from "@/lib/pool";
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
