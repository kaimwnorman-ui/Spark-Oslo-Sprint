import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_MS, MAX_POWER, REFILL_HP, afterRematch, applyRecall, dueCard, dueComebacks, earnPowerUp, emptyMemory, freshness,
  isDue, lockedScore, nextDueIn, normalizeMemory, planComeback, recallScore, recordCards, spendPowerUps, traitLookNow,
  upsertComeback, type MemoryCard,
} from './memory.ts';
import type { ExamResult, Trait } from './types.ts';

const T0 = Date.UTC(2026, 10, 1);

const card = (over: Partial<MemoryCard> = {}): MemoryCard => ({
  id: 'c1', ideaName: 'Spring tides', question: 'Why are some tides bigger?',
  keyPoints: ['Sun and Moon line up', 'their pulls add together'],
  modelAnswer: 'When the Sun and Moon line up, their pulls add together, so high tides are higher.',
  monsterName: 'The Tide Serpent', topic: 'Tides', color: '#0b7a8a', language: 'en', score: 70,
  learnedAt: T0, lastAt: T0, stage: 0, recalls: 0, sourceUrl: null, sourceTitle: null, ...over,
});

const exam = (scores: number[]): ExamResult => ({
  results: scores.map((score, n) => ({
    id: `i${n + 1}`, score, grounded: score > 0, belief: score >= 60 ? 'right' : score >= 10 ? 'partial' : 'unknown',
    creatureAnswer: '', tip: '', question: `Q${n + 1}?`, keyPoints: [`point ${n + 1}`], modelAnswer: `Answer ${n + 1}.`,
  })),
});
const ideas = [1, 2, 3, 4, 5].map((n) => ({ id: `i${n}`, name: `Idea ${n}`, sourceUrl: null, sourceTitle: null }));

test('freshness: fresh until due, fading for one interval, then faded', () => {
  const c = card();
  assert.equal(freshness(c, T0 + 2 * DAY_MS), 'fresh');
  assert.equal(freshness(c, T0 + 3 * DAY_MS), 'fading');
  assert.equal(freshness(c, T0 + 6 * DAY_MS), 'faded');
  assert.equal(freshness(card({ stage: 1 }), T0 + 6 * DAY_MS), 'fresh');
});

test('the due card is the most overdue; snoozed cards wait', () => {
  const a = card({ id: 'a', lastAt: T0 });
  const b = card({ id: 'b', lastAt: T0 - 5 * DAY_MS });
  assert.equal(dueCard([a, b], T0 + DAY_MS), b);
  assert.equal(dueCard([a], T0 + DAY_MS), null);
  assert.equal(dueCard([a, b], T0 + 4 * DAY_MS), b);
  assert.equal(dueCard([card({ id: 'weak', score: 20 }), card({ id: 'strong', score: 90 })], T0 + 4 * DAY_MS)!.id, 'weak');
  const snoozed = card({ id: 's', lastAt: T0 - 10 * DAY_MS, snoozeUntil: T0 + DAY_MS });
  assert.equal(isDue(snoozed, T0), false);
  assert.equal(dueCard([snoozed], T0), null);
  assert.equal(nextDueIn([a], T0 + DAY_MS), 2);
  assert.equal(nextDueIn([], T0), null);
});

test('recording: taught ideas with a revealed answer become cards; reteaching refreshes', () => {
  const input = { monster: { name: 'The Tide Serpent', color: '#0b7a8a' }, topic: 'Tides', language: 'en' as const, ideas, exam: exam([70, 5, 45, 0, 90]) };
  const first = recordCards(emptyMemory(), input, T0);
  assert.equal(first.state.cards.length, 3);
  assert.deepEqual(Object.keys(first.ids).sort(), ['i1', 'i3', 'i5']);
  const later = { ...first.state, cards: first.state.cards.map((c) => ({ ...c, stage: 2 })) };
  const again = recordCards(later, input, T0 + 9 * DAY_MS);
  assert.equal(again.state.cards.length, 3);
  const c = again.state.cards.find((x) => x.id === first.ids.i1)!;
  assert.equal(c.lastAt, T0 + 9 * DAY_MS);
  assert.equal(c.learnedAt, T0);
  assert.equal(c.stage, 2);
  const noAnswer: ExamResult = { results: [{ id: 'i1', score: 80, grounded: true, belief: 'right', creatureAnswer: '', tip: '' }] };
  assert.equal(recordCards(emptyMemory(), { ...input, exam: noAnswer }, T0).state.cards.length, 0);
});

test('offline recall grading: own words on the key points pass, the name alone does not', () => {
  const c = card();
  assert.equal(recallScore(c, 'spring tides'), 0);
  assert.ok(recallScore(c, 'Spring tides spring tides are spring tides ok') <= 10);
  assert.ok(recallScore(c, 'I have no idea about this one really') <= 10);
  const good = recallScore(c, 'When the sun and the moon line up their pulls add together, so the tide is bigger');
  assert.ok(good >= 85, `good ${good}`);
  const half = recallScore(c, 'The moon lines up with something and it gets bigger');
  assert.ok(half >= 30 && half < 85, `half ${half}`);
});

test('recall: a pass spreads the card out, a partial refreshes, a fail stays due (snoozed)', () => {
  const c = card({ stage: 1 });
  const pass = applyRecall(c, 80, T0 + 8 * DAY_MS);
  assert.equal(pass.stage, 2);
  assert.equal(pass.lastAt, T0 + 8 * DAY_MS);
  assert.equal(pass.recalls, 1);
  const partial = applyRecall(c, 40, T0 + 8 * DAY_MS);
  assert.equal(partial.stage, 1);
  assert.equal(partial.lastAt, T0 + 8 * DAY_MS);
  const fail = applyRecall(c, 10, T0 + 8 * DAY_MS);
  assert.equal(fail.stage, 0);
  assert.equal(fail.lastAt, T0);
  assert.equal(isDue(fail, T0 + 8 * DAY_MS), false);
  assert.equal(isDue(fail, T0 + 9 * DAY_MS), true);
});

test('power-ups: earned only by a passing recall, capped, spent one of each per bout', () => {
  let m = emptyMemory();
  assert.equal(earnPowerUp(m, 59).earned, null);
  assert.equal(earnPowerUp(m, 60).earned, 'refill');
  assert.equal(earnPowerUp(m, 85).earned, 'double');
  for (let i = 0; i < 5; i++) m = earnPowerUp(m, 70).state;
  assert.equal(m.powerUps.refill, MAX_POWER);
  m = earnPowerUp(m, 90).state;
  const spent = spendPowerUps(m);
  assert.deepEqual(spent.used, ['refill', 'double']);
  assert.equal(spent.boosts.bonusHp, REFILL_HP);
  assert.equal(spent.boosts.doubleFirstHit, true);
  assert.deepEqual(spent.state.powerUps, { refill: MAX_POWER - 1, double: 0 });
  assert.deepEqual(spendPowerUps(emptyMemory()).used, []);
});

test('comebacks: a lost fight or a weak idea comes back a day later, then is tamed by a good rematch', () => {
  const base = {
    monster: { name: 'The Tide Serpent', shape: 'serpent' as const, color: '#0b7a8a', words: ['tide', 'moon'] },
    topic: 'Tides', language: 'en' as const, demoId: 'tides', ideas,
  };
  assert.equal(planComeback({ ...base, exam: exam([80, 70, 65, 90, 75]), won: true }, T0), null);
  const weakWin = planComeback({ ...base, exam: exam([80, 30, 65, 90, 75]), won: true }, T0)!;
  assert.equal(weakWin.ideaId, 'i2');
  assert.equal(weakWin.dueAt, T0 + DAY_MS);
  const lost = planComeback({ ...base, exam: exam([20, 30, 0, 50, 10]), won: false, previous: [{ id: 'i4', score: 77 }] }, T0)!;
  assert.equal(lost.ideaId, 'i3');
  assert.equal(lost.ideas.find((i) => i.id === 'i4')!.score, 77);
  let m = upsertComeback(emptyMemory(), lost);
  m = upsertComeback(m, { ...lost, tries: 1 });
  assert.equal(m.comebacks.length, 1);
  assert.deepEqual(dueComebacks(m, T0), []);
  assert.equal(dueComebacks(m, T0 + DAY_MS).length, 1);
  const again = afterRematch(m, lost.id, { won: false, score: 40 }, T0 + DAY_MS);
  assert.equal(again.comebacks[0]!.tries, 2);
  assert.equal(again.comebacks[0]!.dueAt, T0 + 2 * DAY_MS);
  const tamed = afterRematch(again, lost.id, { won: true, score: 72 }, T0 + 2 * DAY_MS);
  assert.equal(tamed.comebacks.length, 0);
  assert.equal(tamed.tamed, 1);
  assert.equal(lockedScore(40), 70);
  assert.equal(lockedScore(88), 88);
});

test('traits fade with their memory', () => {
  const trait: Trait = { kind: 'horn', look: 'shining', word: 'tides', color: '#0b7a8a', monsterName: 'M', ideaName: 'Spring tides', score: 90, at: T0, cardId: 'c1' };
  const cards = [card()];
  assert.equal(traitLookNow(trait, cards, T0 + DAY_MS), 'shining');
  assert.equal(traitLookNow(trait, cards, T0 + 4 * DAY_MS), 'solid');
  assert.equal(traitLookNow(trait, cards, T0 + 7 * DAY_MS), 'faded');
  assert.equal(traitLookNow({ ...trait, cardId: undefined }, cards, T0 + 30 * DAY_MS), 'shining');
});

test('stored memory is normalised: junk never breaks the game', () => {
  assert.deepEqual(normalizeMemory(null), emptyMemory());
  const m = normalizeMemory({ cards: [{ nope: 1 }, card()], powerUps: { refill: 99, double: -3 }, comebacks: 'x', tamed: 2.7 });
  assert.equal(m.cards.length, 1);
  assert.deepEqual(m.powerUps, { refill: MAX_POWER, double: 0 });
  assert.deepEqual(m.comebacks, []);
  assert.equal(m.tamed, 2);
});
