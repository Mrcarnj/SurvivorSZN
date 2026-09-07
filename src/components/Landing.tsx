import Image from "next/image";
import Link from "next/link";

/**
 * Public front door. Rendered at / for anyone who isn't signed in, so the pool
 * has a real landing page instead of an immediate redirect to /login.
 *
 * Deliberately contains NO pool data — no players, no picks, no standings.
 * Every read policy in the schema is `to authenticated`, and the publishable
 * key ships in the browser bundle, so anything shown here would effectively be
 * public. The rules are static text, so they are safe to show.
 */
export default function Landing() {
  return (
    <>
      <header className="board">
        <div className="board-inner">
          <div className="brand">
            {/* Decorative: the crest repeats the wordmark next to it. */}
            <Image
              className="crest"
              src="/logo.png"
              alt=""
              width={128}
              height={128}
              priority
            />
            <div className="brand-row">
              <h1>Hollydell Survivor Pool</h1>
              <span>2026 season</span>
            </div>
          </div>
        </div>
      </header>

      <div className="wrap">
        <section className="panel">
          <h2>Pick one team a week. Survive.</h2>
          <div className="sub">
            One life each, plus a one-time $25 buy-back.
          </div>

          <div className="card box">
            <p className="note" style={{ marginTop: 0 }}>
              This is a private pool. Sign in with the email the commissioner has
              on file — no password to remember.
            </p>
            <div className="row" style={{ marginTop: 14 }}>
              <Link className="btn" href="/login">
                Sign in
              </Link>
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>House rules</h2>
          <ul style={{ maxWidth: "66ch", lineHeight: 1.8 }}>
            <li>Everyone gets one life. Pick one team to win each week.</li>
            <li>A team can only be used once all season, by you.</li>
            <li>A loss costs a life. A tie counts as a loss.</li>
            <li>No pick in by kickoff is a loss and shows as NO CHOICE.</li>
            <li>
              Lose your life and you&apos;re out — one $25 buy-back per person, all
              season.
            </li>
            <li>
              Picks stay hidden until kickoff. Before then the board only shows who
              has submitted, never which team.
            </li>
          </ul>
        </section>

        <footer>Not in the pool? Ask the commissioner for an invite.</footer>
      </div>
    </>
  );
}
