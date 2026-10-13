// Offline calibration: no third-party requests or calibration KV writes at runtime.
import { writeFile } from "node:fs/promises";
import { calibrationModule } from "./calibration-module.mjs";
import { SKILLS } from "../frontend/lib/domain.js";
const base = "https://api.wiseoldman.net/v2";
async function get(path) {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  let response = await fetch(base + path, {
    signal: AbortSignal.timeout(20000),
  });
  if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 60000));
    response = await fetch(base + path, { signal: AbortSignal.timeout(20000) });
  }
  if (!response.ok)
    throw new Error(`WOM returned ${response.status} for ${path}`);
  return response.json();
}
const rates = await get("/efficiency/rates?type=main&metric=ehp");
const leaders = await get(
  "/deltas/leaderboard?metric=overall&period=week&limit=12",
);
const samples = [];
for (const { player } of leaders) {
  const gains = await get(
    `/players/${encodeURIComponent(player.username)}/gained?period=week`,
  );
  samples.push({
    username: player.username,
    startsAt: gains.startsAt,
    endsAt: gains.endsAt,
    gains: Object.fromEntries(
      SKILLS.map((s) => [
        s,
        Math.max(
          0,
          gains.data.skills[s === "runecraft" ? "runecrafting" : s]?.experience
            .gained || 0,
        ),
      ]),
    ),
  });
}
const methods = Object.fromEntries(
  SKILLS.map((s) => [
    s,
    (
      rates.find((r) => r.skill === (s === "runecraft" ? "runecrafting" : s))
        ?.methods || []
    )
      .map(({ startExp, rate, realRate }) => ({
        startExp,
        rate: realRate || rate,
      }))
      .sort((a, b) => a.startExp - b.startExp),
  ]),
);
const participation = Object.fromEntries(
  SKILLS.map((s) => [
    s,
    samples.filter((p) => p.gains[s] > 0).length / samples.length,
  ]),
);
const data = {
  fetchedAt: new Date().toISOString(),
  sources: {
    rates: base + "/efficiency/rates?type=main&metric=ehp",
    sample: base + "/deltas/leaderboard?metric=overall&period=week&limit=12",
    gains: base + "/players/:username/gained?period=week",
  },
  caveat:
    "Top weekly gainers are a biased competitive sample, not average players. XP gains do not reveal playtime. EHP methods are efficiency ceilings, not observed average XP/hour. Participation is only a small preference adjustment; realistic rates, level limits and session durations are design estimates.",
  methods,
  participation,
  samples,
};
await writeFile(
  new URL("../workers/data/calibration.json", import.meta.url),
  JSON.stringify(data, null, 2) + "\n",
);
await writeFile(
  new URL("../workers/data/calibration.js", import.meta.url),
  calibrationModule(data),
);
console.log(
  `Saved WOM rates and ${samples.length} weekly player gain samples.`,
);
