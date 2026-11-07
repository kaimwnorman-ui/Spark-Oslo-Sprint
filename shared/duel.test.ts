import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DUEL, challengeFrom, challengerIdeas, cleanName, decodeLocalDuel, encodeLocalDuel, isLocalDuel, isServerDuelCode, readChallenge, simulateDuel,
} from './duel.ts';
import type { Belief, BoutIdea, ExamResult } from './types.ts';

const side = (scores: number[], beliefs: Belief[] = []): BoutIdea[] =>
  scores.map((score, i) => ({ id: `i${i + 1}`, name: `Idea ${i + 1}`, score, belief: beliefs[i] ?? (score >= 60 ? 'right' : score >= 10 ? 'partial' : 'unknown') }));

function winRate(you: number[], them: number[], n = 1000): number {
  let wins = 0;
  for (let seed = 1; seed <= n; seed++) if (simulateDuel(side(them), side(you), seed).outcome === 'win') wins++;
  return wins / n;
}

test('the duel is deterministic', () => {
  assert.deepEqual(simulateDuel(side([70, 40, 0, 55, 80]), side([60, 60, 60, 60, 60]), 7), simulateDuel(side([70, 40, 0, 55, 80]), side([60, 60, 60, 60, 60]), 7));
});

test('the better teacher wins; equal teachers are a coin flip', () => {
  assert.ok(winRate([80, 80, 80, 80, 80], [40, 40, 40, 40, 40]) >= 0.95);
  assert.ok(winRate([40, 40, 40, 40, 40], [80, 80, 80, 80, 80]) <= 0.05);
  const even = winRate([60, 60, 60, 60, 60], [60, 60, 60, 60, 60]);
  assert.ok(even > 0.3 && even < 0.7, `even ${even}`);
});

test('a misreading backfires on its own Blot; an untaught idea fizzles', () => {
  const r = simulateDuel(side([0, 0, 0, 0, 0]), side([90, 0, 0, 0, 0], ['wrong']), 3);
  const first = r.exchanges.find((x) => x.ideaId === 'i1')!;
  assert.equal(first.player.kind, 'backfire');
  assert.equal(first.player.self, DUEL.backfire);
  assert.equal(first.challenger.kind, 'fizzle');
  assert.equal(r.outcome, 'lose');
  assert.equal(r.knockout, false);
});

test('a knockout ends the duel early', () => {
  const r = simulateDuel(side([0, 0, 0, 0, 0]), side([100, 100, 100, 100, 100]), 11);
  assert.equal(r.outcome, 'win');
  assert.equal(r.knockout, true);
  assert.equal(r.challengerHp, 0);
  assert.ok(r.exchanges.length < 5);
});

test('names are plain one-line text', () => {
  assert.equal(cleanName('  Kai  '), 'Kai');
  assert.equal(cleanName('<b>Bjørn</b>\n'), 'b Bjørn /b');
  assert.equal(cleanName(''), 'A friend');
  assert.equal(cleanName(42), 'A friend');
  assert.equal(cleanName('x'.repeat(60)).length, 24);
});

test('a demo duel survives the trip through a link', () => {
  const exam: ExamResult = { results: side([77, 0, 41, 90, 12]).map((i) => ({ id: i.id, score: i.score, grounded: true, belief: i.belief, creatureAnswer: '', tip: '' })) };
  const ch = challengeFrom({ name: 'Åse 🌊', demo: 'tides', topic: 'Tides', monsterName: 'The Tide Serpent', exam, seed: 4242, at: 1 });
  const token = encodeLocalDuel(ch);
  assert.ok(isLocalDuel(token));
  assert.ok(!isServerDuelCode(token));
  assert.match(token, /^L[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeLocalDuel(token), ch);
  assert.deepEqual(challengerIdeas(ch, [{ id: 'i2', name: 'Two' }])[0], { id: 'i2', name: 'Two', score: 0, belief: 'unknown' });
  assert.equal(decodeLocalDuel('Lnot-base64-json!!'), null);
  assert.equal(decodeLocalDuel(token.slice(0, 20)), null);
});

test('a tampered challenge is clamped or refused', () => {
  const ok = readChallenge({ v: 1, demo: null, name: 'K', topic: 't', monsterName: 'm', ideas: [{ id: 'i1', score: 900, belief: 'nope' }], seed: -1, at: 0 })!;
  assert.equal(ok.ideas[0]!.score, 100);
  assert.equal(ok.ideas[0]!.belief, 'unknown');
  assert.equal(ok.seed, 4294967295);
  assert.equal(readChallenge({ v: 1, demo: '../x', name: 'K', ideas: [{ id: 'i1', score: 1 }] }), null);
  assert.equal(readChallenge({ v: 2, ideas: [] }), null);
  assert.equal(readChallenge({ v: 1, demo: null, ideas: [{ id: '<script>', score: 1 }] }), null);
  assert.ok(isServerDuelCode('ab12cd34'));
  assert.ok(!isServerDuelCode('AB12CD34'));
});
