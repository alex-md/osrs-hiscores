import test from 'node:test';
import assert from 'node:assert/strict';

import { levelFromXp, xpForLevel } from './utils.js';

test('xpForLevel uses OSRS thresholds', () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(2), 83);
  assert.equal(xpForLevel(98), 11_805_606);
  assert.equal(xpForLevel(99), 13_034_431);
});

test('levelFromXp honors exact level boundaries', () => {
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(82), 1);
  assert.equal(levelFromXp(83), 2);
  assert.equal(levelFromXp(13_034_430), 98);
  assert.equal(levelFromXp(13_034_431), 99);
  assert.equal(levelFromXp(14_391_160), 99);
});
