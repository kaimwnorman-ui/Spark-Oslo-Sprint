import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGE_LIMIT } from './config.ts';
import {
  atLimit, barValue, capFor, clampMessage, counterVisible, effectiveMove, isPasted, levelOf, pastedShare,
  sourceWindows, wordsMissing,
} from './bars.ts';

test('caps per move combination', () => {
  assert.equal(capFor([]), 0);
  assert.equal(capFor(['say']), 30);
  assert.equal(capFor(['say', 'say']), 30);
  assert.equal(capFor(['when']), 40);
  assert.equal(capFor(['say', 'check']), 40);
  assert.equal(capFor(['say', 'when', 'check']), 40);
  assert.equal(capFor(['example']), 100);
  assert.equal(capFor(['say', 'why']), 100);
  assert.equal(capFor(['when', 'example']), 100);
});

test('bar value is min(cap, AI score)', () => {
  assert.equal(barValue(['say'], 90), 30);
  assert.equal(barValue(['say'], 12), 12);
  assert.equal(barValue(['say', 'when'], 90), 40);
  assert.equal(barValue(['say', 'example'], 88.4), 88);
  assert.equal(barValue(['example'], 140), 100);
  assert.equal(barValue(['example'], -5), 0);
});

test('levels', () => {
  assert.equal(levelOf(0), 'empty');
  assert.equal(levelOf(12), 'started');
  assert.equal(levelOf(40), 'solid');
  assert.equal(levelOf(75), 'signature');
});

const PAGE =
  'The Moon pulls hardest on the side of Earth that faces it, a little less on the middle, and least on the far side. ' +
  'That difference in pull stretches the oceans into two bulges, and the Earth turns through both of them every day.';
const source = sourceWindows(PAGE);

test('paste detection: a copied sentence is pasted', () => {
  const copied = 'That difference in pull stretches the oceans into two bulges, and the Earth turns through both of them every day.';
  assert.ok(isPasted(copied, source));
  assert.equal(effectiveMove('example', true), 'say');
});

test('paste detection: own words are not pasted', () => {
  const own = 'Think of the ocean being tugged unevenly, so it gets stretched like taffy toward and away from the Moon.';
  assert.equal(pastedShare(own, source), 0);
  assert.ok(!isPasted(own, source));
  assert.equal(effectiveMove('example', false), 'example');
});

test('paste detection: half copied, half own words counts as pasted at the 50% line', () => {
  const mixed = 'The Moon pulls hardest on the side of Earth that faces it a little, so I think water just gets tugged around';
  const share = pastedShare(mixed, source);
  assert.ok(share >= 0.5 && share < 1, `share ${share}`);
  assert.ok(isPasted(mixed, source));
  assert.ok(!isPasted('Short one.', source), 'under six words has no windows');
});

test('message limit: 400 characters, counter from 320', () => {
  const long = 'x'.repeat(500);
  assert.equal(clampMessage(long).length, MESSAGE_LIMIT);
  assert.ok(!counterVisible(319));
  assert.ok(counterVisible(320));
  assert.ok(atLimit(400));
  assert.ok(!atLimit(399));
});

test('minimum words per typed move', () => {
  assert.equal(wordsMissing('say', 'tides are big'), 1);
  assert.equal(wordsMissing('say', 'the moon tugs the near side more'), 0);
  assert.equal(wordsMissing('why', 'because gravity fades'), 1);
  assert.equal(wordsMissing('example', 'one two three four'), 0);
  assert.equal(wordsMissing('when', ''), 0);
});
