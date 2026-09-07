# Hollydell Survivor Pool — NFL Survivor Pool

Next.js 15 (App Router, React 19, TypeScript) · Supabase (Postgres + Auth + RLS) · Tank01 on RapidAPI.

---

## First: rotate the RapidAPI key

The key in the screenshot is compromised. Regenerate it in RapidAPI and put the new
one in `.env.local`. It is read only by server code (`src/lib/tank01.ts` is marked
`server-only`), so it never ships to a browser.

---

## Schedule vs. scores: what this build does and why

**Store the schedule. Poll only the scores. Never let a browser talk to RapidAPI.**

| | call pattern | cost |
|---|---|---|
| Schedule | `week=all` once in preseason, then a weekly refresh for flex moves | ~20 calls/season |
| Scores | `getNFLScoresOnly` for the open week, only while a game window is live | ~200–400 calls/week |
| Page loads | none — every browser reads Postgres | 0 |

Three reasons it's built this way:

1. **Cost is flat in users.** Twenty people refreshing on Sunday is the same API spend
   as one. If the browser called RapidAPI directly you'd pay per person per refresh,
   and the key would be public.
2. **Lock times come from real kickoffs.** `sync-schedule` sets each week's `lock_at`
   to that week's earliest kickoff, so Thursday 8:15, the Black Friday game, and
   Sunday 9:30am London starts all lock correctly without a hardcoded time.
3. **Scoring is auditable.** Finals live in your `games` table, so you can see exactly
   what the pool scored against, and re-score if a feed glitches.

The cron endpoint checks the DB before spending a call and exits early when nothing
is live, so a once-a-minute schedule is safe.

---

## Setup

**1. Supabase project** → SQL Editor → paste `supabase/migrations/0001_init.sql` → Run.
Seeds 32 teams, weeks 1–18 of 2026, and allowlists `mike.f.dietrich@gmail.com` as admin.

**2. Auth** → Authentication → URL Configuration → set Site URL and add
`{your-domain}/auth/callback` as a redirect URL. Email provider is on by default.

**3. Env** → copy `.env.local.example` to `.env.local`, fill it in.

**4. Install and run**

```bash
npm install
npm run probe     # confirms Tank01 field names against your key
npm run dev
```

**5. Sign in** with `mike.f.dietrich@gmail.com`. The signup trigger flags you admin and
creates your entry, so you're commissioner *and* player. Open **Commissioner → Sync
full season schedule**. That's your one `week=all` call.

**6. Invite** the rest of the pool from the Commissioner tab. Anyone not on the
allowlist is refused at signup — worth having when there's money in it.

**7. Deploy to Vercel, then set the cron.** `vercel.json` is already in the repo:

```json
{ "crons": [
  { "path": "/api/cron/sync-scores",              "schedule": "0 14 * * 2" },
  { "path": "/api/admin/sync-schedule?week=all",  "schedule": "0 17 * * 2" },
  { "path": "/api/cron/sync-odds",                "schedule": "0 20 * * 2" }
] }
```

All three run Tuesday, in that order, three hours apart. Order matters: scores
must settle first so the open week advances, the schedule refresh then picks up
flex moves, and odds are pulled last for the week that is now current. Vercel
cron times are always UTC and Hobby projects fire anywhere inside the given
hour, so the three-hour gaps are what keep them from overlapping.

Setting a `CRON_SECRET` environment variable in Vercel makes it send
`Authorization: Bearer <CRON_SECRET>` on every cron invocation — no extra work,
and the endpoints already check for it. They also accept a signed-in
commissioner, so any job can be forced from the browser.

Hobby allows at most one run per day per expression; weekly is well inside
that. Live in-game score polling would need Pro.

---

## How the rules are enforced

Rules live in Postgres, not just in the UI, so nobody can curl their way around them.

- **One team per season** — unique index `(season, user_id, team_id)`.
- **Lock** — a trigger rejects any write once `weeks.lock_at` has passed.
- **Hidden picks** — an RLS policy returns other people's picks only after `lock_at`.
  The `pick_status` view leaks a boolean and nothing else, which is how the check marks
  work. This is enforced at the database, so opening devtools doesn't reveal anything.
- **Wipeout weeks** — `weeks.exclusive` is mirrored onto each pick and covered by a
  partial unique index, making first-come-first-served race-proof.
- **Buy-backs** — one life each; a single $25 buy-back per person. The server action
  checks `rebuy_used` and blocks from week 17 on. A player on their buy-back life shows
  a gold `$` instead of a heart.
- **Scoring** — `scoreWeek()` in `src/actions/pool.ts`. Tie or no pick both count as a
  loss; if every survivor loses, no lives are deducted and next week goes exclusive.

Reveal is at kickoff and never re-hides, since after Monday night the week is history
and has to stay visible in the season grid anyway.

---

## Open questions

1. **17 or 18 weeks?** `seasons.final_week` is 17, matching your rules, but weeks 1–18
   exist in the table. Change one row if you want an 18-week pool.
2. **Byes and the no-pick rule.** Right now a missed pick is an automatic loss even if
   someone's plausible teams were on bye. Standard, but worth confirming.
3. **Push/tie games.** Currently a tie kills the picker only, not the other team's
   picker — that team's picker also gets a T, which also counts as a loss. So both
   sides of a tie lose. That matches your rule as written.
4. **Payouts.** Nothing tracks money owed beyond `rebuy_paid_at`. Want a pot tracker?
5. **Notifications.** No reminder email on Thursday morning for people who haven't
   picked. Easy to add with a second cron plus Resend.
