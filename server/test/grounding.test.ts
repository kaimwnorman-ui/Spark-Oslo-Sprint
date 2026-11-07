// Grounding (SPEC §12.4), with the real examiner: npm run test:ai. Skipped in npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createAnthropic } from '../src/anthropic.ts';
import { loadSettings } from '../src/settings.ts';
import { makeLiveAi } from '../src/ai.ts';
import type { StoredLesson } from '../src/lessons.ts';
import type { DemoRound, TranscriptEntry } from '../../shared/types.ts';

const enabled = process.env.SPARK_TEST_AI === '1';
const settings = loadSettings(process.env);
const client = enabled ? createAnthropic(settings.keys) : null;
const ai = client ? makeLiveAi(client, settings, () => {}) : null;

const dir = new URL('../../demo/rounds/', import.meta.url);
const rounds = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as DemoRound)
  .filter((r) => r.id !== 'stage');
const pageText = (r: DemoRound) =>
  readFileSync(new URL(`../../${r.page}`, import.meta.url), 'utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const stored = (r: DemoRound): StoredLesson => ({ lesson: r.lesson, roundId: null, text: pageText(r), seed: 1, page: null, expires: Infinity });
const tides = rounds.find((r) => r.id === 'tides')!;

test('grounding: an empty transcript scores 0/5 on every demo page', { skip: !enabled }, async () => {
  assert.ok(ai, 'needs an Anthropic key');
  for (const r of rounds) {
    const exam = await ai!.examine(stored(r), [], []);
    assert.deepEqual(exam.results.map((x) => x.score), [0, 0, 0, 0, 0], r.id);
    assert.ok(exam.results.every((x) => x.belief === 'unknown' && !x.grounded), r.id);
  }
});

test('grounding: unrelated sentences score 0/5', { skip: !enabled }, async () => {
  const unrelated: TranscriptEntry[] = [
    { ideaId: 'i1', move: 'say', text: 'I made pasta with tomato sauce and fresh basil for dinner last night.' },
    { ideaId: 'i2', move: 'example', text: 'My bicycle had a flat tyre this morning so I walked to the shop and bought bread.' },
    { ideaId: 'i3', move: 'say', text: 'The football match on Saturday ended two all after a very late penalty.' },
    { ideaId: 'i4', move: 'example', text: 'My grandmother knits warm wool socks every winter and gives them to the whole family.' },
    { ideaId: 'i5', move: 'say', text: 'Cats usually sleep for most of the day and then run around the house at night.' },
  ];
  const exam = await ai!.examine(stored(tides), unrelated, []);
  const scores = exam.results.map((x) => x.score);
  assert.ok(scores.every((s) => s < 10), `scores ${scores}`);
});

test('grounding: two ideas taught well score ≥ 60 on those and ≤ 15 on the rest', { skip: !enabled }, async () => {
  const taught: TranscriptEntry[] = [
    { ideaId: 'i1', move: 'say', text: 'Gravity gets weaker with distance, so the Moon pulls the near ocean harder than the middle of the Earth and the far ocean the least.' },
    { ideaId: 'i1', move: 'why', text: 'Because a pull that gets weaker with distance is uneven across the planet, and that difference is what stretches the water, not the pull itself.' },
    { ideaId: 'i1', move: 'example', text: 'Like runners tied in a line: the front runner is yanked hardest, the last one least, so the line stretches out instead of just moving.' },
    { ideaId: 'i2', move: 'say', text: 'The stretch makes two bulges of water, one facing the Moon and one on the opposite side of the Earth.' },
    { ideaId: 'i2', move: 'why', text: 'The far bulge happens because the water there is pulled less than the solid Earth, so it is left behind while the Earth is pulled away from it.' },
    { ideaId: 'i2', move: 'example', text: 'As the Earth spins once a day a beach passes through both bulges, so you get high tide, low tide, high tide, low tide every day.' },
  ];
  const exam = await ai!.examine(stored(tides), taught, []);
  const by = Object.fromEntries(exam.results.map((x) => [x.id, x.score]));
  assert.ok(by.i1! >= 60 && by.i2! >= 60, `taught: ${by.i1}, ${by.i2}`);
  for (const id of ['i3', 'i4', 'i5']) assert.ok(by[id]! <= 15, `${id}: ${by[id]}`);
});
