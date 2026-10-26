import { UPDATE_INTERVAL_MS, UPDATE_MINUTES } from "../../frontend/lib/simulation-config.js";
import { weekendBonusMultiplier } from "./utils.js";

export const XP_SCALE = 18.5;
export const MAX_XP_SCALE = 31;
export const MIN_XP_SCALE = 6;
const DAY_MS = 86_400_000;
const PERIODS = DAY_MS / UPDATE_INTERVAL_MS;

// Date-seeded randomness keeps retries, isolates and all players on one world
// schedule without consuming session RNG or writing anything during public reads.
function randomFor(seed) {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (rng, min, max) => min + rng() * (max - min);
const bell = (hour, center, width) => {
  const distance = Math.min(Math.abs(hour - center), 24 - Math.abs(hour - center));
  return Math.exp(-0.5 * (distance / width) ** 2);
};
let cachedDay, cachedSchedule;
export function dailyXpSchedule(date = new Date()) {
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) throw new RangeError("Invalid XP schedule date");
  const dayIndex = Math.floor(timestamp / DAY_MS);
  if (cachedDay === dayIndex) return cachedSchedule;
  const day = new Date(dayIndex * DAY_MS).toISOString().slice(0, 10);
  const week = randomFor(`xp-v1-week:${Math.floor((dayIndex + 3) / 7)}`);
  const rng = randomFor(`xp-v1-day:${day}`);
  const weekendMultiplier = weekendBonusMultiplier(date);
  // Hierarchy: weekly population bias, daily intensity, independently perturbed
  // morning/lunch/evening waves, then correlated multi-hour and local variation.
  const weeklyShift = between(week, -0.6, 0.6);
  const weeklyIntensity = between(week, 0.97, 1.03);
  const dailyFactor = weeklyIntensity * between(rng, 0.94, 1.06);
  const meanScale = XP_SCALE * weekendMultiplier * dailyFactor;
  const weekendDelay = weekendMultiplier > 1 ? 0.75 : 0;
  const peaks = [
    [between(rng, 8, 10) + weeklyShift + weekendDelay, between(rng, 1.5, 2.8), between(rng, 0.18, 0.38)],
    [between(rng, 12, 14.5) + weeklyShift + weekendDelay, between(rng, 2, 3.5), between(rng, 0.4, 0.7)],
    [between(rng, 18, 21) + weeklyShift + weekendDelay, between(rng, 2.3, 3.8), between(rng, 0.9, 1.3)],
  ];
  const anchors = Array.from({ length: 8 }, () => between(rng, -0.1, 0.1));
  const raw = Array.from({ length: PERIODS }, (_, index) => {
    const hour = (index + 0.5) * 24 / PERIODS;
    const position = hour / 3;
    const left = Math.floor(position);
    const fraction = position - left;
    const smooth = fraction * fraction * (3 - 2 * fraction);
    const local = anchors[left % 8] * (1 - smooth) + anchors[(left + 1) % 8] * smooth;
    return peaks.reduce((sum, [center, width, height]) => sum + height * bell(hour, center, width), 0)
      + local + between(rng, -0.015, 0.015);
  });
  const mean = raw.reduce((sum, value) => sum + value, 0) / PERIODS;
  const low = Math.min(...raw), high = Math.max(...raw);
  const floor = between(rng, MIN_XP_SCALE, 10);
  // Some days reach 31x; others have a softer peak. Weekend uplift is already
  // included here, rather than multiplying the capped schedule a second time.
  const peak = between(rng, 27, 32);
  const ceiling = Math.min(MAX_XP_SCALE, peak);
  const amplitude = Math.min((ceiling - meanScale) / (high - mean), (meanScale - floor) / (mean - low));
  const scales = Object.freeze(raw.map(value => Math.max(MIN_XP_SCALE, Math.min(MAX_XP_SCALE, meanScale + (value - mean) * amplitude))));
  cachedDay = dayIndex;
  cachedSchedule = Object.freeze({
    day, timezone: "UTC", periodMinutes: UPDATE_MINUTES,
    dailyFactor, weekendMultiplier, meanScale,
    minScale: Math.min(...scales), maxScale: Math.max(...scales), scales,
  });
  return cachedSchedule;
}
export function xpModifier(date = new Date()) {
  const schedule = dailyXpSchedule(date);
  const index = Math.floor((date.getTime() % DAY_MS + DAY_MS) % DAY_MS / UPDATE_INTERVAL_MS);
  const scale = schedule.scales[index];
  return {
    scale, baseScale: XP_SCALE,
    timeOfDayFactor: scale / (XP_SCALE * schedule.weekendMultiplier * schedule.dailyFactor),
    dailyFactor: schedule.dailyFactor, weekendMultiplier: schedule.weekendMultiplier,
    nextChangeAt: (Math.floor(date.getTime() / UPDATE_INTERVAL_MS) + 1) * UPDATE_INTERVAL_MS,
  };
}
// Integrate the elapsed window, including midnight/weekend boundaries. Session
// activity occupies the sampled fraction of each period, preserving XP weighting.
let cachedWindow;
export function windowXpScale(date, hours) {
  const end = date.getTime();
  const duration = Math.max(0, Math.min(UPDATE_INTERVAL_MS, hours * 3_600_000));
  if (!duration) return xpModifier(date).scale;
  if (cachedWindow?.end === end && cachedWindow.duration === duration) return cachedWindow.scale;
  let cursor = end - duration, weighted = 0;
  while (cursor < end) {
    const next = Math.min(end, (Math.floor(cursor / UPDATE_INTERVAL_MS) + 1) * UPDATE_INTERVAL_MS);
    weighted += xpModifier(new Date(cursor)).scale * (next - cursor);
    cursor = next;
  }
  const scale = weighted / duration;
  cachedWindow = { end, duration, scale };
  return scale;
}
