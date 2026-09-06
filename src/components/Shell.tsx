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
  const tabs = [
    ["week", "/", "This week"],
    ["pick", "/pick", "Make your pick"],
    ["season", "/season", "Season results"],
    ["rules", "/rules", "Rules"],
    ...(isAdmin ? [["admin", "/admin", "Commissioner"]] : []),
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
          {tabs.map(([id, href, label]) => (
            <Link key={id} href={href} className={tab === id ? "on" : ""}>
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="wrap">{children}</div>
    </>
  );
}
