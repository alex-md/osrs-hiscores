import baseline from "../data/ge-baseline.js";

// The first argument is ignored for saved callers; prices are fixed.
export const priceOf = (_market, id) => baseline[id].price;
export const SKILL_ITEMS = { fishing: 7944, mining: 444, woodcutting: 1515, hunter: 10034, runecraft: 560, farming: 257, slayer: 565, sailing: 1515 };
export { BOSS_ITEMS, RARE_ITEMS } from "../../frontend/lib/loot.js";
