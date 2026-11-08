import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeLocalDuel, encodeLocalDuel } from './duel.ts';
import { DAY_MS, dueCard, dueComebacks, freshness, traitLookNow } from './memory.ts';
import { insights } from './insights.ts';
import { presenterSeed } from './presenter.ts';
import type { DemoRound } from './types.ts';

const load = (id: string) => JSON.parse(readFileSync(new URL(`../demo/rounds/${id}.json`, import.meta.url), 'utf8')) as DemoRound;
const NOW = Date.UTC(2026, 10, 8);
const seed = presenterSeed({ lost: load('tides'), won: load('pvalue'), wonIdeas: ['i1', 'i2', 'i4'] }, NOW);

test('the kit holds a believable learner: six memories, two fights, one monster coming back', () => {
  assert.equal(seed.memory.cards.length, 6);
  assert.equal(seed.history.length, 2);
  assert.deepEqual(seed.history.map((r) => r.outcome), ['win', 'lose']);
  assert.equal(seed.memory.comebacks.length, 1);
  assert.equal(seed.memory.comebacks[0]!.ideaId, 'i3');
  assert.equal(seed.memory.comebacks[0]!.id, seed.comebackId);
  assert.ok(seed.memory.cards.every((c) => c.live === false), 'demo pages are graded in the browser');
});

test('four days on: memories are fading and due, the monster is back, the trait is a step down; a week on it has faded', () => {
  const day4 = NOW + 4 * DAY_MS;
  assert.ok(dueCard(seed.memory.cards, day4));
  assert.equal(dueComebacks(seed.memory, day4).length, 1);
  assert.ok(seed.memory.cards.every((c) => freshness(c, day4) === 'fading'));
  const trait = seed.traits[0]!;
  assert.ok(trait.cardId);
  assert.equal(traitLookNow(trait, seed.memory.cards, NOW), 'shining');
  assert.equal(traitLookNow(trait, seed.memory.cards, day4), 'solid');
  assert.equal(traitLookNow(trait, seed.memory.cards, NOW + 7 * DAY_MS), 'faded');
});

test('Your Blot has something true to say: Blot fooled the player once', () => {
  const tips = insights(seed.history);
  assert.equal(tips[0]!.code, 'trust');
});

test('the friend’s challenge survives a link and fights the lost page', () => {
  const back = decodeLocalDuel(encodeLocalDuel(seed.challenge));
  assert.deepEqual(back, seed.challenge);
  assert.equal(seed.challenge.demo, 'tides');
  assert.equal(seed.challenge.name, 'Kai');
});
