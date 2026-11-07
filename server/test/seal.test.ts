import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { sealLesson, checkLesson } from '../../shared/lesson.ts';
import type { DemoRound } from '../../shared/types.ts';

const FORBIDDEN = new Set(['modelAnswer', 'keyPoints', 'question', 'misread', 'right']);

function forbiddenKeys(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => forbiddenKeys(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => [...(FORBIDDEN.has(k) ? [`${path}.${k}`] : []), ...forbiddenKeys(v, `${path}.${k}`)]);
  }
  return [];
}

const dir = new URL('../../demo/rounds/', import.meta.url);
const rounds = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as DemoRound);

test('every demo round has a valid lesson', () => {
  assert.ok(rounds.length >= 1);
  for (const r of rounds) checkLesson(r.lesson);
});

test('the sealed lesson has no answers in it (deep check)', () => {
  for (const r of rounds) {
    const sealed = sealLesson(r.lesson, 'L1');
    assert.deepEqual(forbiddenKeys(sealed), [], `round ${r.id}`);
    assert.equal(sealed.lessonId, 'L1');
    assert.equal(sealed.ideas.length, 5);
    assert.ok(sealed.ideas.every((i) => i.whenOptions.length === 3 && i.whenOptions.every((o) => typeof o.text === 'string')));
    // The answers really were there before sealing.
    assert.ok(forbiddenKeys(r.lesson).length > 0);
  }
});
