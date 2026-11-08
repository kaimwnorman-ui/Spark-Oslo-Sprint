import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addRound, deepImpact, focusCodes, insights, moveImpact, pruneHistory, stats, summarizeRound, MAX_HISTORY, type RoundSummary } from './insights.ts';
import type { ExamResult, Move, TranscriptEntry } from './types.ts';

const names = [1, 2, 3, 4, 5].map((n) => ({ id: `i${n}`, name: `Idea ${n}` }));

function round(moves: Move[][], scores: number[], extra: Partial<RoundSummary> = {}): RoundSummary {
  return {
    at: 0, topic: 'Tides', monsterName: 'The Tide Serpent', outcome: 'lose', kind: 'round',
    ideas: names.map((n, i) => ({ id: n.id, name: n.name, score: scores[i] ?? 0, belief: (scores[i] ?? 0) >= 60 ? 'right' : 'partial', moves: moves[i] ?? [] })),
    fooled: 0, caught: 0, pasted: 0, typed: 0, ...extra,
  };
}

test('a round summary counts moves, slips, catches and pastes from the transcript', () => {
  const transcript: TranscriptEntry[] = [
    { ideaId: 'i1', move: 'say', text: 'a b c d e f' },
    { ideaId: 'i1', move: 'check', tap: 'yes', fooled: true },
    { ideaId: 'i2', move: 'say', text: 'copied', pasted: true },
    { ideaId: 'i2', move: 'check', tap: 'no', caught: true },
    { ideaId: 'i2', move: 'dontknow' },
  ];
  const exam: ExamResult = { results: names.map((n, i) => ({ id: n.id, score: i * 10, grounded: true, belief: 'partial', creatureAnswer: '', tip: '' })) };
  const s = summarizeRound({ at: 5, topic: 'T', monsterName: 'M', outcome: 'win', ideas: names, transcript, exam });
  assert.deepEqual(s.ideas[0]!.moves, ['say', 'check']);
  assert.deepEqual(s.ideas[1]!.moves, ['say', 'check']);
  assert.deepEqual(s.ideas[2]!.moves, []);
  assert.equal(s.fooled, 1);
  assert.equal(s.caught, 1);
  assert.equal(s.pasted, 1);
  assert.equal(s.typed, 2);
  assert.equal(s.kind, 'round');
});

test('no history, no insights', () => {
  assert.deepEqual(insights([]), []);
  assert.deepEqual(focusCodes([]), []);
});

test('trust comes first when Blot fooled the player', () => {
  const h = [round([['say', 'check'], ['say', 'example']], [30, 70], { fooled: 2 })];
  const out = insights(h);
  assert.equal(out[0]!.code, 'trust');
  assert.match(out[0]!.detail, /2 times/);
  assert.equal(focusCodes(h)[0], 'trust');
});

test('why: answering Blot’s third question (why or an example) uses the player’s own numbers when they show the gap', () => {
  const h = [round([['say', 'check', 'why'], ['say', 'check'], ['say', 'check'], ['say', 'example'], ['say']], [80, 30, 25, 70, 20])];
  const why = insights(h).find((i) => i.code === 'why')!;
  assert.match(why.detail, /answered why scored 75 on average\. The rest: 25/);
  assert.deepEqual(deepImpact(h), { with: 75, without: 25, used: 2, taught: 5 });
  assert.deepEqual(moveImpact(h, 'example'), { with: 70, without: 39, used: 1, taught: 5 });
  // Answering why on most ideas: no tip.
  assert.equal(insights([round([['say', 'why'], ['say', 'why'], ['say', 'example'], ['say']], [80, 75, 70, 20])]).some((i) => i.code === 'why'), false);
});

test('coverage and paste tips; at most three insights; focus is the top two tips', () => {
  const h = [
    round([['say'], ['say']], [30, 30], { pasted: 2, typed: 3 }),
    round([['say']], [30], { pasted: 1, typed: 1 }),
  ];
  const codes = insights(h).map((i) => i.code);
  assert.ok(codes.includes('coverage'));
  assert.ok(insights(h).length <= 3);
  assert.equal(focusCodes(h).length, 2);
  assert.deepEqual(focusCodes(h), codes.filter((c) => c !== 'praise').slice(0, 2));
});

test('a good player gets praise, not tips', () => {
  const all: Move[] = ['say', 'example', 'why'];
  const h = [
    round([all, all, all, all, all], [90, 85, 80, 75, 88], { outcome: 'win', caught: 2 }),
    round([all, all, all, all, all], [91, 82, 78, 70, 85], { outcome: 'win' }),
  ];
  const out = insights(h);
  assert.ok(out.length > 0);
  assert.ok(out.every((i) => i.code === 'praise'));
  assert.deepEqual(focusCodes(h), []);
  const s = stats(h);
  assert.equal(s.rounds, 2);
  assert.equal(s.wins, 2);
  assert.equal(s.best!.score, 91);
});

test('history is capped', () => {
  let h: RoundSummary[] = [];
  for (let i = 0; i < MAX_HISTORY + 7; i++) h = addRound(h, round([], [], { at: i }));
  assert.equal(h.length, MAX_HISTORY);
  assert.equal(h.at(-1)!.at, MAX_HISTORY + 6);
});

test('rounds older than the retention window are forgotten', () => {
  const day = 86_400_000;
  const now = 400 * day;
  const h = [round([], [], { at: now - 200 * day }), round([], [], { at: now - 30 * day })];
  assert.deepEqual(pruneHistory(h, now).map((r) => r.at), [now - 30 * day]);
  assert.equal(pruneHistory(h, now, 365).length, 2);
});
