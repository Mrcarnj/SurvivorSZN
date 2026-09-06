"use client";

import { useState, useTransition } from "react";
import { submitPick, clearPick } from "@/actions/pool";
import { TeamChip } from "./ui";
import type { Team } from "@/lib/pool";

export default function PickForm({
  week,
  teams,
  usedIds,
  takenIds,
  currentPick,
  locked,
  eliminated,
}: {
  week: number;
  teams: Team[];
  usedIds: string[];
  takenIds: string[];
  currentPick: string | null;
  locked: boolean;
  eliminated: boolean;
}) {
  const [sel, setSel] = useState<string | null>(currentPick);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const used = new Set(usedIds);
  const taken = new Set(takenIds);
  const available = teams.filter((t) => !used.has(t.id));

  if (eliminated)
    return <p className="note">You are out of lives. Ask the commissioner about a re-buy.</p>;

  if (locked)
    return (
      <p className="note">
        Picks are locked for week {week}.
        {currentPick ? " Yours is showing on the board above." : " You did not get one in."}
      </p>
    );

  const run = (fn: () => Promise<{ error?: string; ok?: boolean }>) =>
    start(async () => {
      setErr(null);
      setMsg(null);
      const r = await fn();
      if (r.error) setErr(r.error);
      else setMsg("Saved.");
    });

  return (
    <div className="card box">
      <p className="note" style={{ marginTop: 0 }}>
        {currentPick
          ? `You're on ${teams.find((t) => t.id === currentPick)?.name}. Change it any time before kickoff.`
          : `${available.length} teams left to choose from.`}
      </p>

      <div className="pickgrid">
        {available.map((t) => {
          const isTaken = taken.has(t.id) && t.id !== currentPick;
          return (
            <button
              key={t.id}
              className={`pickbtn${sel === t.id ? " sel" : ""}`}
              disabled={isTaken || pending}
              onClick={() => setSel(t.id)}
              aria-label={t.name}
            >
              <TeamChip team={t} />
              {isTaken && <span className="taken">taken</span>}
            </button>
          );
        })}
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        <button
          className="btn"
          disabled={!sel || sel === currentPick || pending}
          onClick={() => sel && run(() => submitPick(week, sel))}
        >
          {pending ? "Saving…" : "Lock in pick"}
        </button>
        <button
          className="btn ghost"
          disabled={!currentPick || pending}
          onClick={() => run(() => clearPick(week))}
        >
          Clear my pick
        </button>
        {msg && <span className="note">{msg}</span>}
        {err && <span className="err">{err}</span>}
      </div>
    </div>
  );
}
