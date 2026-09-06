/**
 * Tank01 NFL client. Server-only — the RapidAPI key must never reach the browser.
 *
 * Endpoints used:
 *   GET /getNFLGamesForWeek?week={1..18|all}&seasonType=reg&season=2026   (Weekly Schedule)
 *   GET /getNFLScoresOnly?gameWeek={1..18}&seasonType=reg&season=2026     (live/final scores)
 *
 * Tank01 returns { statusCode, body } where body is sometimes an array and
 * sometimes an object keyed by gameID, so everything below normalizes to an array.
 * Run `npm run probe` once against your key to confirm the field names before
 * you trust a live week.
 */
import "server-only";

const HOST =
  process.env.RAPIDAPI_HOST ??
  "tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com";

export type RawGame = Record<string, unknown>;

export type NormalizedGame = {
  gameId: string;
  week: number;
  seasonType: string;
  homeAbbr: string;
  awayAbbr: string;
  kickoff: Date | null;
  status: "scheduled" | "live" | "final";
  homeScore: number | null;
  awayScore: number | null;
};

async function call(path: string, params: Record<string, string>) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error("RAPIDAPI_KEY is not set");

  const url = `https://${HOST}/${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { "x-rapidapi-key": key, "x-rapidapi-host": HOST },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Tank01 ${path} failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  const body = json?.body ?? json;
  if (Array.isArray(body)) return body as RawGame[];
  if (body && typeof body === "object") return Object.values(body) as RawGame[];
  return [];
}

const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/** "20260913" + "1:00p" (Eastern) -> Date. Prefers gameTime_epoch when present. */
function parseKickoff(g: RawGame): Date | null {
  const epoch = n(g.gameTime_epoch);
  if (epoch) return new Date(epoch * 1000);

  const date = s(g.gameDate); // YYYYMMDD
  const time = s(g.gameTime); // "1:00p"
  if (date.length !== 8) return null;

  const y = +date.slice(0, 4);
  const mo = +date.slice(4, 6);
  const d = +date.slice(6, 8);

  let hh = 13;
  let mm = 0;
  const m = time.match(/^(\d{1,2}):(\d{2})\s*([ap])/i);
  if (m) {
    hh = +m[1] % 12;
    mm = +m[2];
    if (m[3].toLowerCase() === "p") hh += 12;
  }
  // Eastern is UTC-4 during the season, UTC-5 from early November.
  const offset = mo > 11 || (mo === 11 && d >= 2) || mo < 3 ? 5 : 4;
  return new Date(Date.UTC(y, mo - 1, d, hh + offset, mm));
}

function parseStatus(g: RawGame): NormalizedGame["status"] {
  const raw = s(g.gameStatus ?? g.currentPeriod).toLowerCase();
  if (raw.includes("final")) return "final";
  if (raw.includes("progress") || raw.includes("half") || /q[1-4]/.test(raw))
    return "live";
  return "scheduled";
}

function normalize(g: RawGame): NormalizedGame | null {
  const gameId = s(g.gameID ?? g.gameId);
  if (!gameId) return null;
  // gameID looks like 20260913_KC@BAL — a reliable fallback for the teams.
  const fromId = gameId.split("_")[1]?.split("@") ?? [];
  return {
    gameId,
    week: n(g.gameWeek ?? g.week) ?? 0,
    seasonType: s(g.seasonType || "reg"),
    awayAbbr: s(g.away || fromId[0]).toUpperCase(),
    homeAbbr: s(g.home || fromId[1]).toUpperCase(),
    kickoff: parseKickoff(g),
    status: parseStatus(g),
    homeScore: n(g.homePts ?? g.homeScore),
    awayScore: n(g.awayPts ?? g.awayScore),
  };
}

/** week: "all" pulls the entire regular season in one request. */
export async function getWeeklySchedule(opts: {
  season: string;
  week: string;
  seasonType?: string;
}): Promise<NormalizedGame[]> {
  const raw = await call("getNFLGamesForWeek", {
    season: opts.season,
    week: opts.week,
    seasonType: opts.seasonType ?? "reg",
  });
  return raw.map(normalize).filter((g): g is NormalizedGame => g !== null);
}

/** Scores for one week. Cheap enough to poll while games are on. */
export async function getWeekScores(opts: {
  season: string;
  week: number;
  seasonType?: string;
}): Promise<NormalizedGame[]> {
  const raw = await call("getNFLScoresOnly", {
    season: opts.season,
    gameWeek: String(opts.week),
    seasonType: opts.seasonType ?? "reg",
    topPerformers: "false",
  });
  return raw.map(normalize).filter((g): g is NormalizedGame => g !== null);
}

/** Tank01 week numbers occasionally arrive as "Week 3". */
export function weekNumber(v: unknown): number {
  const m = String(v).match(/\d+/);
  return m ? +m[0] : 0;
}
