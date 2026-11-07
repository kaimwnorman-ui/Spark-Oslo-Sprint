import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseTrait, finalBelief, keyWord, misreadIdeaIds, offlineExam, offlineScore, traitLook, weakestIdeaId } from './round.ts';
import type { Idea } from './types.ts';

const idea = (id: string, name: string): Idea => ({
  id, name, question: 'q?', modelAnswer: 'The Moon pulls the near side of the ocean harder than the far side.',
  keyPoints: ['difference in pull', 'near side pulled more'], whenOptions: [], misread: 'It is a magnet.',
  sourceUrl: null, sourceTitle: null,
});

test('exactly two misread ideas, the same for the same seed', () => {
  const ids = ['i1', 'i2', 'i3', 'i4', 'i5'];
  const a = misreadIdeaIds(ids, 99);
  assert.equal(a.length, 2);
  assert.deepEqual(a, misreadIdeaIds(ids, 99));
  assert.equal(new Set(a).size, 2);
});

test('beliefs: a held misread is wrong; otherwise the score decides', () => {
  assert.equal(finalBelief('misread', 90), 'wrong');
  assert.equal(finalBelief('none', 5), 'unknown');
  assert.equal(finalBelief('right', 45), 'partial');
  assert.equal(finalBelief('right', 72), 'right');
});

test('offline scoring rewards on-topic words only', () => {
  const i = idea('i1', 'The Moon’s uneven pull');
  assert.equal(offlineScore(i, 'I like turtles and pizza a lot', 70), 5);
  assert.equal(offlineScore(i, 'The ocean near the Moon gets pulled harder than the far side', 70), 70);
});

test('offline exam maps values and beliefs', () => {
  const ideas = [idea('i1', 'A'), idea('i2', 'B')];
  const canned = { i1: { right: 'R', partial: 'P', unknown: 'U', tip: 'T' }, i2: { right: 'R', partial: 'P', unknown: 'U', tip: 'T' } };
  const exam = offlineExam(ideas, { i1: 80, i2: 0 }, { i1: 'misread', i2: 'none' }, canned);
  assert.deepEqual(exam.results.map((r) => [r.belief, r.creatureAnswer]), [['wrong', 'It is a magnet.'], ['unknown', 'U']]);
});

test('traits: highest idea, look by score tier', () => {
  assert.equal(traitLook(59), 'wobbly');
  assert.equal(traitLook(60), 'solid');
  assert.equal(traitLook(85), 'shining');
  assert.equal(keyWord('Spring and neap tides'), 'Spring');
  const exam = { results: [
    { id: 'i1', score: 40, grounded: true, belief: 'partial' as const, creatureAnswer: '', tip: '' },
    { id: 'i2', score: 91, grounded: true, belief: 'right' as const, creatureAnswer: '', tip: '' },
  ] };
  const t = chooseTrait(exam, [{ id: 'i1', name: 'Two bulges' }, { id: 'i2', name: 'The late tide' }], { name: 'Tide Serpent', color: '#000' }, 1);
  assert.equal(t?.ideaName, 'The late tide');
  assert.equal(t?.look, 'shining');
  assert.equal(weakestIdeaId(exam), 'i1');
});
