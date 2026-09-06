/**
 * Run once before trusting a live week:  node scripts/probe-tank01.mjs
 * Prints the raw shape of both endpoints so you can confirm field names.
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const HOST = env.RAPIDAPI_HOST;
const headers = { "x-rapidapi-key": env.RAPIDAPI_KEY, "x-rapidapi-host": HOST };

async function hit(path, params) {
  const url = `https://${HOST}/${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers });
  const json = await res.json();
  const body = json.body ?? json;
  const first = Array.isArray(body) ? body[0] : Object.values(body)[0];
  console.log(`\n=== ${path} (${res.status}) ===`);
  console.log("count:", Array.isArray(body) ? body.length : Object.keys(body).length);
  console.log("first record:", JSON.stringify(first, null, 2));
}

await hit("getNFLGamesForWeek", { season: "2026", week: "1", seasonType: "reg" });
await hit("getNFLScoresOnly", { season: "2026", gameWeek: "1", seasonType: "reg", topPerformers: "false" });
