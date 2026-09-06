import Shell from "@/components/Shell";
import { loadPool } from "@/lib/pool";

export default async function RulesPage() {
  const p = await loadPool();
  return (
    <Shell
      tab="rules"
      week={p.week?.week ?? 1}
      lockAt={p.week?.lock_at ?? null}
      isAdmin={!!p.me?.is_admin}
      entrants={p.entries.length}
    >
      <section className="panel">
        <h2>House rules</h2>
        <ul style={{ maxWidth: "66ch", lineHeight: 1.8 }}>
          <li>Everyone starts with two lives. Pick one team to win each week.</li>
          <li>A team can only be used once all season, by you.</li>
          <li>A loss costs a life. A tie counts as a loss.</li>
          <li>No pick in by kickoff is a loss and shows as NO CHOICE.</li>
          <li>Out of lives, out of the pool.</li>
          <li>
            The commissioner can sell one re-buy per person for $50, worth one extra
            life. One per person all season, and never in week 17.
          </li>
          <li>
            If every surviving player loses in the same week, nobody loses a life. The
            following week only, no two players may hold the same team — first pick in
            gets it.
          </li>
          <li>
            Picks are hidden until kickoff. Before then the board only shows who has
            submitted.
          </li>
        </ul>
      </section>
    </Shell>
  );
}
