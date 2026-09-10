"use client";

import { useEffect, useRef, useState } from "react";

export type WeekOutcome =
  | "survived"
  | "wipeout"
  | "buyback" // eliminated, re-buy still available
  | "boughtBack" // eliminated, already re-bought before seeing this
  | "done"; // eliminated, no re-buy left

const COPY: Record<WeekOutcome, { title: string; body: (week: number) => string }> = {
  survived: {
    title: "Great Job!",
    body: (w) => `You survived Week ${w}!`,
  },
  wipeout: {
    title: "Whew!",
    body: (w) =>
      `Everybody lost Week ${w}, so nobody drops a life. You survived — but next week it's one team per player.`,
  },
  buyback: {
    title: "Ouch, you stink!",
    body: () => "You are eliminated unless you choose to buy back in.",
  },
  boughtBack: {
    title: "Ouch, you stink!",
    body: (w) => `You lost Week ${w}, but your buy-back keeps you alive. Don't blow it.`,
  },
  done: {
    title: "Better luck next year ya Hufflepuff!",
    body: () => "You're eliminated!",
  },
};

/**
 * Pops once per player per scored week, the first time they open the board
 * after the Tuesday sync. "Seen" lives in localStorage, so a player on two
 * devices sees it once on each.
 */
export default function WeekResult({
  season,
  week,
  userId,
  outcome,
}: {
  season: number;
  week: number;
  userId: string;
  outcome: WeekOutcome;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const key = `survivorszn:result:${season}:${week}:${userId}`;

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(key) === "1";
    } catch {
      // Storage blocked: show it anyway; worst case it shows again next visit.
    }
    if (!seen) {
      ref.current?.showModal();
      setOpen(true);
    }
  }, [key]);

  function dismiss() {
    try {
      localStorage.setItem(key, "1");
    } catch {}
    ref.current?.close();
  }

  const good = outcome === "survived" || outcome === "wipeout";
  const copy = COPY[outcome];

  return (
    <dialog
      ref={ref}
      className={`result ${good ? "good" : "bad"}`}
      aria-labelledby="result-title"
      onClose={() => {
        setOpen(false);
        try {
          localStorage.setItem(key, "1");
        } catch {}
      }}
      // Tap the backdrop to dismiss.
      onClick={(e) => e.target === e.currentTarget && dismiss()}
    >
      {open && (
        <div className="result-body">
          <div className="result-kicker">Week {week} results</div>
          <h2 id="result-title">{copy.title}</h2>
          <p>{copy.body(week)}</p>
          <button className="btn" autoFocus onClick={dismiss}>
            {good ? "Let's go" : "Got it"}
          </button>
        </div>
      )}
    </dialog>
  );
}
