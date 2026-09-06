"use client";

import { useState, useTransition } from "react";
import {
  grantRebuy,
  scoreWeek,
  undoScoring,
  inviteEmails,
  confirmChampion,
} from "@/actions/pool";
import { Hearts } from "./ui";
import type { Entry, Profile } from "@/lib/pool";

type GameRow = {
  game_id: string;
  status: string;
  home: string | null;
  away: string | null;
  home_score: number | null;
  away_score: number | null;
};

export default function AdminPanel({
  week,
  finalWeek,
  profiles,
  entries,
  games,
  scored,
  championName,
  pendingChampionName,
  rebuysOutstanding,
}: {
  week: number;
  finalWeek: number;
  profiles: Profile[];
  entries: Entry[];
  games: GameRow[];
  scored: boolean;
  /** Set once the pool is decided. */
  championName: string | null;
  /** Last player standing while a re-buy is still outstanding. */
  pendingChampionName: string | null;
  rebuysOutstanding: number;
}) {
  const [log, setLog] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [emails, setEmails] = useState("");
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error?: string; message?: string; ok?: boolean }>) =>
    start(async () => {
      setErr(null);
      setLog(null);
      const r = await fn();
      if (r.error) setErr(r.error);
      else setLog(r.message ?? "Done.");
    });

  async function sync(path: string) {
    setErr(null);
    setLog("Working…");
    const res = await fetch(path, { method: "POST" });
    const json = await res.json();
    if (!res.ok) setErr(json.error ?? "Sync failed");
    else setLog(JSON.stringify(json));
  }

  const notFinal = games.filter((g) => g.status !== "final").length;

  return (
    <>
      {log && <div className="banner">{log}</div>}
      {err && <div className="banner alarm">{err}</div>}

      {championName && (
        <div className="banner">
          <strong>{championName} has won the pool.</strong> Scoring is closed. Reopen
          a week below if this needs undoing.
        </div>
      )}

      {!championName && pendingChampionName && (
        <div className="banner alarm">
          <strong>{pendingChampionName} is the last player standing.</strong>{" "}
          {rebuysOutstanding} eliminated player
          {rebuysOutstanding === 1 ? "" : "s"} can still buy back in, so this
          isn&apos;t final yet. Sell a re-buy below to keep the pool alive, or confirm
          the win if nobody is coming back.
          <div className="row" style={{ marginTop: 10 }}>
            <button
              className="btn"
              disabled={pending}
              onClick={() => run(() => confirmChampion())}
            >
              Confirm {pendingChampionName} as winner
            </button>
          </div>
        </div>
      )}

      <div className="cmd">
        <div className="card box">
          <h3>Week {week}</h3>
          <p className="note">
            {games.length} games loaded · {notFinal} not final yet.
          </p>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn ghost" onClick={() => sync("/api/admin/sync-schedule?week=all")}>
              Sync full season schedule
            </button>
            <button className="btn ghost" onClick={() => sync(`/api/admin/sync-schedule?week=${week}`)}>
              Refresh week {week}
            </button>
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <button
              className="btn"
              disabled={pending || scored}
              onClick={() => run(() => scoreWeek(week))}
            >
              Score week {week}
            </button>
            <button
              className="btn danger"
              disabled={pending || scored}
              onClick={() => run(() => scoreWeek(week, true))}
            >
              Force score (ignore unfinished)
            </button>
            {scored && (
              <button className="btn ghost" disabled={pending} onClick={() => run(() => undoScoring(week))}>
                Reopen week
              </button>
            )}
          </div>

          <div style={{ marginTop: 16 }}>
            {games.map((g) => (
              <div key={g.game_id} className="resrow">
                <span style={{ flex: 1, fontSize: 13 }}>
                  {g.away?.toUpperCase()} {g.away_score ?? "–"} @ {g.home?.toUpperCase()}{" "}
                  {g.home_score ?? "–"}
                </span>
                <span className="tag">{g.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card box">
          <h3>Lives and re-buys</h3>
          <p className="note">
            $50 each, one per person, blocked from week {finalWeek} on.
          </p>
          {profiles.map((p) => {
            const e = entries.find((x) => x.user_id === p.id);
            return (
              <div key={p.id} className="resrow">
                <span style={{ flex: 1 }}>
                  {p.display_name}{" "}
                  {e?.eliminated && <span className="tag out">out</span>}
                </span>
                <Hearts entry={e} />
                <button
                  className="btn ghost"
                  disabled={pending || e?.rebuy_used || week >= finalWeek}
                  onClick={() => run(() => grantRebuy(p.id))}
                >
                  +1 life · $50
                </button>
              </div>
            );
          })}

          <h3 style={{ marginTop: 22 }}>Invite players</h3>
          <p className="note">
            Only allowlisted emails can create an account. One per line or comma
            separated.
          </p>
          <textarea
            rows={3}
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="friend@example.com, other@example.com"
          />
          <button
            className="btn"
            style={{ marginTop: 10 }}
            disabled={pending || !emails.includes("@")}
            onClick={() =>
              run(async () => {
                const r = await inviteEmails(emails);
                if (r.ok) setEmails("");
                return r;
              })
            }
          >
            Add to pool
          </button>
        </div>
      </div>
    </>
  );
}
