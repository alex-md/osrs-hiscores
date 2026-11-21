import seed from '../../content/catalog.json' with { type: 'json' };

// Stable references let the UI and engine share a published catalog generation.
export const gameItems = {};
export const gameBosses = [];
export const gameBossByKey = {};
export const gameBossItems = {};
export const gameRareItems = {};
export const gameSkillOutputs = {};
export const gameSkillItems = {};
export const gameTrainingCeilings = {};
const listeners = new Set();
let current;
const replace = (target, source) => { for (const key of Object.keys(target)) delete target[key]; Object.assign(target, structuredClone(source)); };
export function applyGameContent(content = seed) {
  current = structuredClone(content);
  replace(gameItems, content.items);
  gameBosses.splice(0, gameBosses.length, ...structuredClone(content.bosses));
  replace(gameBossByKey, Object.fromEntries(gameBosses.map(b=>[b.key,b])));
  replace(gameBossItems, Object.fromEntries(gameBosses.map(b=>[b.key,[b.drops.find(d=>!d.rare)?.id || null,b.drops.find(d=>d.rare)?.id || null]])));
  replace(gameRareItems, Object.fromEntries(gameBosses.map(b=>[b.key,b.drops.filter(d=>d.rare).map(d=>[d.id,d.chance])])));
  replace(gameSkillOutputs, content.skillOutputs);
  replace(gameSkillItems, content.skillItems);
  replace(gameTrainingCeilings, content.trainingCeilings);
  for (const listener of listeners) listener();
}
export const currentGameContent = () => structuredClone(current);
export const onGameContent = listener => { listeners.add(listener); listener(); };
export { seed as defaultGameContent };
applyGameContent();
