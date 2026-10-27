import { SKILLS } from "./constants.js";
import { chooseTrainingSkill } from "./training.js";
import { xpForLevel } from "./utils.js";

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const trainable = SKILLS.filter(skill => skill !== "hitpoints");

// Shared, persisted changes survive across updates. Independent player noise
// averages away; a multi-hour regime and skill trend can move a whole ladder.
export function advanceTrainingClimate(previous, date, rng = Math.random) {
  if (previous?.until > date.getTime()) return previous;
  const roll = rng();
  const phase = roll < 0.25 ? "quiet" : roll < 0.55 ? "surge" : "steady";
  const ranges = { quiet: [0.5, 0.8], surge: [1.2, 1.8], steady: [0.85, 1.15] };
  const [low, high] = ranges[phase];
  const focusSkill = trainable[Math.min(trainable.length - 1, Math.floor(rng() * trainable.length))];
  return { phase, factor: low + rng() * (high - low), focusSkill,
    skillFactor: 1.3 + rng() * 0.9, startedAt: date.getTime(),
    until: date.getTime() + Math.round((1.5 + rng() * 7.5) * 3_600_000) };
}

export function personalTraining(user, { hours, activeHours, rng, climate, market }) {
  if (!(hours > 0)) return { multiplier: 1, skill: null, phase: "steady" };
  const state = user.trainingState ||= {
    aptitude: 0.75 + rng() * 0.5, fatigue: 0, momentum: 1, remaining: 0,
    phase: "steady", phaseRemaining: 0, focusSkill: null, targetXP: 0,
  };
  // Downtime restores stamina; high activity creates a delayed cost to a grind.
  state.fatigue = clamp(state.fatigue - Math.max(0, hours - activeHours) * 0.22, 0, 1);
  if (!(activeHours > 0)) return { multiplier: 1, skill: null, phase: state.phase };
  if (state.phaseRemaining <= 0 || (state.fatigue > 0.8 && state.phase !== "recovery")) {
    const roll = rng();
    state.phase = state.fatigue > 0.8 || roll < 0.2 ? "recovery" : roll < 0.55 ? "grind" : "steady";
    state.phaseRemaining = 0.75 + rng() * 4.25;
  }
  const focused = user.skills[state.focusSkill];
  if (state.remaining <= 0 || !focused || focused.xp >= Math.min(200_000_000, state.targetXP)) {
    state.focusSkill = chooseTrainingSkill(user, rng, { climate, market });
    const stat = user.skills[state.focusSkill];
    state.targetXP = stat ? stat.level < 99 ? xpForLevel(Math.min(99, stat.level + 2 + Math.floor(rng() * 4)))
      : Math.min(200_000_000, stat.xp + 1_000_000 + Math.floor(rng() * 4_000_000)) : 0;
    state.remaining = 1 + rng() * 7;
  }
  const phaseFactor = { recovery: 0.5, grind: 1.6, steady: 1 }[state.phase];
  // Slow personal momentum plus modest session noise: streaks, not a new
  // unrelated lottery jackpot on every tick.
  const elapsed = activeHours / 0.25;
  state.momentum = clamp(state.momentum + (rng() - 0.5) * 0.12 * Math.sqrt(elapsed), 0.65, 1.4);
  const execution = 0.85 + rng() * 0.3;
  const multiplier = clamp(state.aptitude * state.momentum * phaseFactor * (1 - state.fatigue * 0.35) * execution, 0.2, 2.5);
  const skill = rng() < 0.85 && state.focusSkill ? state.focusSkill : chooseTrainingSkill(user, rng, { climate, market });
  state.phaseRemaining -= activeHours;
  state.remaining -= activeHours;
  state.fatigue = clamp(state.fatigue + activeHours * (state.phase === "grind" ? 0.16 : state.phase === "recovery" ? -0.3 : 0.025), 0, 1);
  return { multiplier, skill, phase: state.phase, focusSkill: state.focusSkill };
}
