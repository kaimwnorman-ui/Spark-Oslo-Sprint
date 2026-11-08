// The pitch recipes in README.md ("Presenting") are checked here, so they cannot go stale:
// teaching these ideas (Say it, then Give an example) wins each demo page with the game's own
// canned scoring and bout, and teaching only two usually does not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulateBout } from './bout.ts';
import { demoExam } from './demo.ts';
import { boutIdeas, misreadIdeaIds } from './round.ts';
import type { DemoRound, TranscriptEntry } from './types.ts';

const load = (id: string) => JSON.parse(readFileSync(new URL(`../demo/rounds/${id}.json`, import.meta.url), 'utf8')) as DemoRound;

/** The ideas the README tells a presenter to teach, per page (none of them is a misread idea). */
export const PITCH_RECIPES: Record<string, string[]> = {
  tides: ['i2', 'i4', 'i5'],
  pvalue: ['i1', 'i2', 'i4'],
  solar: ['i1', 'i4', 'i5'],
  sove: ['i2', 'i3', 'i5'],
  'ai-answer': ['i1', 'i4', 'i5'],
};

function play(round: DemoRound, taught: string[]) {
  const lines = round.lines!;
  const transcript: TranscriptEntry[] = taught.flatMap((ideaId) => [
    { ideaId, move: 'say' as const, text: lines[ideaId]!.say },
    { ideaId, move: 'example' as const, text: lines[ideaId]!.example },
  ]);
  const held = taught.filter((i) => misreadIdeaIds(round.lesson.ideas.map((x) => x.id), round.seed).includes(i));
  const exam = demoExam(round, transcript, held);
  return { held, bout: simulateBout(boutIdeas(round.lesson.ideas, exam), (round.seed + 7919) >>> 0) };
}

for (const [id, recipe] of Object.entries(PITCH_RECIPES)) {
  test(`pitch recipe: ${id}, teaching ${recipe.join(' + ')} wins`, () => {
    const round = load(id);
    const { held, bout } = play(round, recipe);
    assert.deepEqual(held, [], 'the recipe never teaches a misread idea without catching it');
    assert.equal(bout.outcome, 'win');
  });
}

test('pitch recipe: on Tides, teaching two ideas does not win (the README says so)', () => {
  const { bout } = play(load('tides'), ['i2', 'i4']);
  assert.notEqual(bout.outcome, 'win');
});

test('stage round: four ideas are pre-taught and exactly one is left for the juror', () => {
  const stage = load('stage');
  const taught = new Set(stage.pretaught!.map((e) => e.ideaId));
  assert.equal(taught.size, 4);
  assert.equal(stage.lesson.ideas.filter((i) => !taught.has(i.id)).length, 1);
});
