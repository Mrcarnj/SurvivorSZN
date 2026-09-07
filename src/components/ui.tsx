"use client";

import { useEffect, useState } from "react";
import type { Entry, Team } from "@/lib/pool";

/* --------------------------------------------------------- lives + coin */

const HEART = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"];

/** Gold disc; the $ is knocked back out of it in the row below. */
const COIN = ["0111110", "1111111", "1111111", "1111111", "1111111", "0111110"];
const DOLLAR = ["0001000", "0011100", "0011000", "0001100", "0011100", "0001000"];

function Pixels({ rows, fill, x = 0, y = 0 }: { rows: string[]; fill: string; x?: number; y?: number }) {
  return (
    <>
      {rows.flatMap((row, ry) =>
        [...row].map((v, rx) =>
          v === "1" ? (
            <rect key={`${rx}-${ry}`} x={x + rx} y={y + ry} width="1" height="1" fill={fill} />
          ) : null
        )
      )}
    </>
  );
}

const EMPTY = "rgba(241,237,226,.16)";

export function Heart({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="14" viewBox="0 0 7 6" shapeRendering="crispEdges" aria-hidden>
      <Pixels rows={HEART} fill={filled ? "#E5484D" : EMPTY} />
      {filled && <rect x="1" y="1" width="1" height="1" fill="rgba(255,255,255,.65)" />}
    </svg>
  );
}

/** The bought-back life: same pixel art language as the heart, but a coin. */
export function Coin({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="14" viewBox="0 0 7 6" shapeRendering="crispEdges" aria-hidden>
      {filled ? (
        <>
          <Pixels rows={COIN} fill="#F5C043" />
          <Pixels rows={DOLLAR} fill="#1B1405" />
          <rect x="2" y="0" width="1" height="1" fill="rgba(255,255,255,.55)" />
        </>
      ) : (
        <Pixels rows={DOLLAR} fill={EMPTY} />
      )}
    </svg>
  );
}

/**
 * One heart per player, and — once they have paid for the buy-back — a coin
 * for that extra life. The coin sits first so a lit coin next to a spent heart
 * reads as "this player is running on their buy-back life".
 */
export function Hearts({ entry }: { entry: Entry | undefined }) {
  if (!entry) return null;
  // Mirrors maxLives() in lib/pool, which is server-only and can't be imported here.
  const max = 1 + (entry.rebuy_used ? 1 : 0);
  const label = entry.rebuy_used
    ? `${entry.lives} of ${max} lives left, buy-back used`
    : `${entry.lives} of ${max} lives left`;
  return (
    <span className="hearts" role="img" aria-label={label}>
      {entry.rebuy_used && <Coin filled={entry.lives >= 1} />}
      <Heart filled={entry.lives >= max} />
    </span>
  );
}

/* ------------------------------------------------------------ team chips */

export function TeamChip({
  team,
  small,
  used,
  dead,
  win,
}: {
  team: Team;
  small?: boolean;
  used?: boolean;
  dead?: boolean;
  win?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const cls = [
    "team",
    small && "sm",
    (used || dead) && "dead",
    win && "win",
    broken && "ph",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={cls}
      title={`${team.name}${used ? " — already used" : ""}`}
      style={{ background: `${team.color}26` }}
    >
      {!broken && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={`https://a.espncdn.com/i/teamlogos/nfl/500/${team.id}.png`}
          alt={team.name}
          onError={() => setBroken(true)}
        />
      )}
      {broken && <span className="abbr">{team.abbr}</span>}
      {used && <span className="strike" />}
    </span>
  );
}

export const CheckChip = ({ small }: { small?: boolean }) => (
  <span className={`team chk${small ? " sm" : ""}`} title="Pick submitted">
    ✓
  </span>
);

export const EmptyChip = ({ small }: { small?: boolean }) => (
  <span className={`team empty${small ? " sm" : ""}`} />
);

/* ----------------------------------------------------------- lock clock */

export function LockClock({
  lockAt,
  week,
  serverNow,
}: {
  lockAt: string | null;
  week: number;
  serverNow: number;
}) {
  // The countdown depends on the current time, which the server and the browser
  // never agree on to the second — calling Date.now() in both places is a
  // guaranteed hydration mismatch. Seeding from a prop means both renders start
  // from the identical number; the interval then takes over on the client.
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!lockAt) {
    return (
      <div className="clock">
        <div className="t">—</div>
        <div className="l">no schedule synced yet</div>
      </div>
    );
  }

  const diff = new Date(lockAt).getTime() - now;
  if (diff <= 0) {
    return (
      <div className="clock locked">
        <div className="t">PICKS LOCKED</div>
        <div className="l">week {week} picks are visible to everyone</div>
      </div>
    );
  }

  let s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400);
  s %= 86400;
  const h = Math.floor(s / 3600);
  s %= 3600;
  const m = Math.floor(s / 60);
  const pad = (x: number) => String(x).padStart(2, "0");

  return (
    <div className="clock">
      <div className="t">
        {d ? `${d}d ` : ""}
        {pad(h)}:{pad(m)}:{pad(s % 60)}
      </div>
      <div className="l">
        until week {week} kickoff ·{" "}
        {new Date(lockAt).toLocaleString("en-US", {
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
          timeZone: "America/New_York",
        })}{" "}
        ET
      </div>
    </div>
  );
}
