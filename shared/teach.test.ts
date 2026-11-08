import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIME_BONUS } from './config.ts';
import { afterCheck, bonusSeconds, deepenMove, levelBonuses, readyCount } from './teach.ts';

test('time is earned once per level: Blot gets it at 40, masters it at 75', () => {
  assert.deepEqual(levelBonuses({}, 30), []);
  assert.deepEqual(levelBonuses({}, 40), ['ready']);
  assert.deepEqual(levelBonuses({}, 85), ['ready', 'mastered']);
  assert.deepEqual(levelBonuses({ ready: true }, 85), ['mastered']);
  assert.deepEqual(levelBonuses({ ready: true, mastered: true }, 100), []);
  assert.equal(bonusSeconds(['ready', 'mastered']), TIME_BONUS.ready + TIME_BONUS.mastered);
  assert.equal(bonusSeconds([]), 0);
});

test('a good round earns more time than it costs, a weak one does not', () => {
  // Five ideas taught well, two of them with a mix-up caught: what the bonuses add to the 90 s start.
  const perIdea = TIME_BONUS.ready + TIME_BONUS.mastered;
  const earned = 5 * perIdea + 2 * TIME_BONUS.caught;
  assert.ok(earned >= 150, `earned ${earned} s`);
  // Explaining alone (never reaching Ready) earns nothing.
  assert.equal(bonusSeconds(levelBonuses({}, 30)), 0);
});

test('the check sends Blot on to why, or the player puts it right', () => {
  assert.equal(afterCheck(true), 'why');
  assert.equal(afterCheck(false), 'fix');
});

test('Blot asks why when the idea has a reason behind it, else for an example', () => {
  assert.equal(deepenMove(true), 'why');
  assert.equal(deepenMove(false), 'example');
});

test('Blot is ready for an idea from 40', () => {
  assert.equal(readyCount([0, 39, 40, 80, 100]), 3);
  assert.equal(readyCount([]), 0);
});
