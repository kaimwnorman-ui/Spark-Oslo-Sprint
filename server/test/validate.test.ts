import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepPageLinksOnly, normaliseUrl } from '../src/validate.ts';
import type { Lesson } from '../../shared/types.ts';

test('normalisation: fragments and trailing slashes do not matter', () => {
  assert.equal(normaliseUrl('https://example.com/a/'), 'https://example.com/a');
  assert.equal(normaliseUrl('https://example.com/a#part-2'), 'https://example.com/a');
  assert.equal(normaliseUrl(' https://example.com/a/#x '), 'https://example.com/a');
  assert.equal(normaliseUrl('https://example.com/a?q=1'), 'https://example.com/a?q=1');
  assert.equal(normaliseUrl('javascript:alert(1)'), null);
  assert.equal(normaliseUrl('not a url'), null);
});

const idea = (id: string, sourceUrl: string | null) => ({
  id, name: id, question: 'q', modelAnswer: 'a', keyPoints: ['k'], misread: 'm',
  whenOptions: [{ text: 'a', right: true }, { text: 'b', right: false }, { text: 'c', right: false }],
  sourceUrl, sourceTitle: sourceUrl ? 'Title' : null,
});
const lesson = (urls: (string | null)[]): Lesson => ({
  topic: 't', monsterName: 'M', monsterShape: 'crab', language: 'en', words: [],
  ideas: urls.map((u, i) => idea(`i${i + 1}`, u)),
});

test('URLs outside the page link list are dropped', () => {
  const links = [{ text: 'Tides', href: 'https://en.wikipedia.org/wiki/Tide' }, { text: 'NOAA', href: 'https://tidesandcurrents.noaa.gov/' }];
  const out = keepPageLinksOnly(
    lesson(['https://en.wikipedia.org/wiki/Tide#History', 'https://tidesandcurrents.noaa.gov', 'https://evil.example/phish', null, 'https://en.wikipedia.org/wiki/Moon']),
    links,
  );
  assert.deepEqual(out.ideas.map((i) => i.sourceUrl), [
    'https://en.wikipedia.org/wiki/Tide',
    'https://tidesandcurrents.noaa.gov/',
    null,
    null,
    null,
  ]);
  assert.equal(out.ideas[2]!.sourceTitle, null);
});

test('no links on the page means no source cards', () => {
  const out = keepPageLinksOnly(lesson(['https://a.example/x', 'https://b.example/y', null, null, null]), []);
  assert.ok(out.ideas.every((i) => i.sourceUrl === null));
});
