import baseline from "../data/ge-baseline.js";
import { readJSON, writeJSON } from "./store.js";

export const PRICE_URL = "https://prices.runescape.wiki/api/v1/osrs/latest";
export const priceOf = (market, id) => market?.prices?.[id] ?? baseline[id].price;
export const basePrice = id => baseline[id].price;
export const supplyIndex = market => (priceOf(market, 385) / basePrice(385) + priceOf(market, 2434) / basePrice(2434)) / 2;
export const SKILL_ITEMS = { fishing: 7944, mining: 444, woodcutting: 1515, hunter: 10034, runecraft: 560, farming: 257, slayer: 565, sailing: 1515 };
// Representative tradeable rewards, not full drop tables. Untradeable rewards
// (e.g. Scurrius spines and pets) never receive a GE price.
export const BOSS_ITEMS = {
  scurrius: [560, null], "giant-mole": [7416, null], barrows: [565, null],
  sarachnis: [6291, null], "dagannoth-kings": [536, 6737], zulrah: [12934, 12922],
  vorkath: [536, 22111], "phantom-muspah": [27616, 27614],
  "general-graardor": [560, 11834], "commander-zilyana": [560, 11814],
  "kril-tsutsaroth": [560, 11824], kreearra: [560, 11828],
  "alchemical-hydra": [536, 22966], "chambers-of-xeric": [565, 21034],
  "theatre-of-blood": [565, 22477], "tombs-of-amascut": [565, 25975],
};
// Authored reward mixes: preserve the long tail of raid rewards instead of
// pricing every purple as one cheap ring or as a jackpot. Not exact loot tables.
export const RARE_ITEMS = {
  barrows: [[4749, 1], [4726, 1], [4712, 1], [4718, 1], [4736, 1], [4757, 1]],
  sarachnis: [[23528, 1]],
  "chambers-of-xeric": [[21034, 20], [21079, 20], [21000, 4], [21012, 4], [21015, 3], [13652, 3], [21018, 3], [21021, 3], [21024, 3], [21043, 2], [21003, 2], [20997, 2]],
  "theatre-of-blood": [[22477, 8], [22324, 2], [22481, 2], [22326, 1], [22327, 1], [22328, 1], [22486, 1]],
  "tombs-of-amascut": [[25975, 7], [26219, 7], [25985, 3], [27226, 2], [27229, 2], [27232, 2], [27277, 1]],
};

export async function dailyMarket(env, date, fetcher = env.GE_FETCH || fetch) {
  const key = "system:ge-prices";
  const previous = await readJSON(env, key, {});
  const day = date.toISOString().slice(0, 10);
  if (previous.attemptDay === day) return previous;
  const market = { ...previous, attemptDay: day };
  try {
    const response = await fetcher(PRICE_URL, {
      headers: { "User-Agent": "osrs-hiscores daily simulation prices (github.com/alex-md/osrs-hiscores)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`GE HTTP ${response.status}`);
    const { data } = await response.json();
    const prices = {}, observations = {};
    // Accept only complete, recent snapshots. A malformed or partial response
    // must not replace yesterday's usable prices or silently mix capture dates.
    for (const id of Object.keys(baseline)) {
      const entry = data?.[id];
      const sides = ["high", "low"].filter(side => Number.isFinite(entry?.[side]) && entry[side] > 0 && entry[side] <= 1_000_000_000_000
        && Number.isFinite(entry[`${side}Time`]) && entry[`${side}Time`] * 1000 <= date.getTime() + 300000
        && entry[`${side}Time`] * 1000 >= date.getTime() - 7 * 86400000);
      if (!sides.length) throw new Error(`GE missing recent price for ${id}`);
      prices[id] = Math.round(sides.reduce((sum, side) => sum + entry[side], 0) / sides.length);
      observations[id] = Math.max(...sides.map(side => entry[`${side}Time`]));
    }
    Object.assign(market, { prices, observations, capturedAt: date.getTime(), source: PRICE_URL, status: "current" });
    delete market.error;
  } catch (error) {
    market.status = previous.capturedAt ? "stale" : "fallback";
    market.error = String(error.message).slice(0, 160);
  }
  await writeJSON(env, key, market);
  return market;
}
