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
  tab: "week" | "season" | "rules" | "admin";
  week: number;
  lockAt: string | null;
  isAdmin: boolean;
  entrants: number;
  children: React.ReactNode;
}) {
  const tabs = [
    ["week", "/", "This week"],
    ["season", "/season", "Season results"],
    ["rules", "/rules", "Rules"],
    ...(isAdmin ? [["admin", "/admin", "Commissioner"]] : []),
  ] as const;

  return (
    <>
      <header className="board">
        <div className="board-inner">
          <div className="brand">
            <h1>Last Man Standing</h1>
            <div>
              <span>2026 season · {entrants} entries · $50 buy-in</span>
            </div>
          </div>
          <LockClock lockAt={lockAt} week={week} />
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
