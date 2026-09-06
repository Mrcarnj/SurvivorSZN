"use client";

import { useState, useTransition } from "react";
import { submitPick, clearPick } from "@/actions/pool";
import { TeamChip } from "./ui";
import type { Team } from "@/lib/pool";

export type TeamOdds = {
  ml: number | null;
  spread: number | null;
  opponent: string | null;
  home: boolean;
};

/** -3.5 -> "-3.5", 7 -> "+7", 0 -> "PK", null -> "--". */
const fmtSpread = (n: number | null) =>
  n === null ? "--" : n === 0 ? "PK" : `${n > 0 ? "+" : ""}${n}`;

/** American odds: -180 stays, 150 becomes "+150". */
const fmtML = (n: number | null) =>
  n === null ? "--" : `${n > 0 ? "+" : ""}${n}`;

export default function PickForm({
  week,
  teams,
  usedIds,
  takenIds,
  currentPick,
  locked,
  eliminated,
  odds,
}: {
  week: number;
  teams: Team[];
  usedIds: string[];
  takenIds: string[];
  currentPick: string | null;
  locked: boolean;
  eliminated: boolean;
  /** Keyed by team id. A team missing from this map is on a bye this week. */
  odds: Record<string, TeamOdds>;
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
          const o = odds[t.id];
          const bye = !o; // no game this week
          const isTaken = taken.has(t.id) && t.id !== currentPick;
          const label = bye
            ? `${t.name} — on bye this week`
            : `${t.name} ${o.home ? "vs" : "@"} ${o.opponent?.toUpperCase() ?? ""}, spread ${fmtSpread(o.spread)}, moneyline ${fmtML(o.ml)}`;
          return (
            <button
              key={t.id}
              className={`pickbtn${sel === t.id ? " sel" : ""}${bye ? " bye" : ""}`}
              disabled={bye || isTaken || pending}
              onClick={() => setSel(t.id)}
              aria-label={label}
              title={label}
            >
              <TeamChip team={t} />
              <span className="odds">
                {bye ? (
                  <span className="byetag">BYE</span>
                ) : isTaken ? (
                  <span className="taken">TAKEN</span>
                ) : (
                  <>
                    <span className="sp">{fmtSpread(o.spread)}</span>
                    <span className="ml">{fmtML(o.ml)}</span>
                  </>
                )}
              </span>
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
