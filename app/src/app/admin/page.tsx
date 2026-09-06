import { redirect } from "next/navigation";
import Shell from "@/components/Shell";
import AdminPanel from "@/components/AdminPanel";
import { loadPool, SEASON } from "@/lib/pool";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const p = await loadPool();
  if (!p.me?.is_admin) redirect("/");

  const week = p.week!;
  const sb = await supabaseServer();
  const [{ data: games }, { data: season }] = await Promise.all([
    sb
      .from("games")
      .select("game_id,status,home,away,home_score,away_score,kickoff")
      .eq("season", SEASON)
      .eq("week", week.week)
      .order("kickoff"),
    sb.from("seasons").select("final_week").eq("year", SEASON).single(),
  ]);

  return (
    <Shell
      tab="admin"
      week={week.week}
      lockAt={week.lock_at}
      isAdmin
      entrants={p.entries.length}
    >
      <section className="panel">
        <h2>Commissioner</h2>
        <div className="sub">
          You are also a player — your picks work like everyone else&apos;s.
        </div>
        <AdminPanel
          week={week.week}
          finalWeek={season?.final_week ?? 17}
          profiles={p.profiles}
          entries={p.entries}
          games={games ?? []}
          scored={week.scored}
        />
      </section>
    </Shell>
  );
}
