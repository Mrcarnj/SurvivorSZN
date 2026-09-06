import Link from "next/link";
import { LockClock } from "./ui";

export default function Shell({
  tab,
  week,
  lockAt,
  isAdmin,
  entrants,
  children,
}: {
  tab: "week" | "pick" | "season" | "rules" | "admin";
  week: number;
  lockAt: string | null;
  isAdmin: boolean;
  entrants: number;
  children: React.ReactNode;
}) {
  // Two labels per tab: the full one, and a short one for phones, where five
  // full-length tabs scroll most of the row off the right edge.
  const tabs = [
    ["week", "/", "This week", "Week"],
    ["pick", "/pick", "Make your pick", "My pick"],
    ["season", "/season", "Season results", "Season"],
    ["rules", "/rules", "Rules", "Rules"],
    ...(isAdmin ? [["admin", "/admin", "Commissioner", "Commish"]] : []),
  ] as const;

  return (
    <>
      <header className="board">
        <div className="board-inner">
          <div className="brand">
            <h1>Hollydell Survivor Pool</h1>
            <div>
              <span>2026 season</span>
            </div>
          </div>
          <LockClock lockAt={lockAt} week={week} serverNow={Date.now()} />
        </div>
        <nav className="tabs">
          {tabs.map(([id, href, label, short]) => (
            <Link
              key={id}
              href={href}
              className={tab === id ? "on" : ""}
              aria-current={tab === id ? "page" : undefined}
            >
              <span className="lbl-full">{label}</span>
              <span className="lbl-short">{short}</span>
            </Link>
          ))}
        </nav>
      </header>
      <div className="wrap">{children}</div>
    </>
  );
}
