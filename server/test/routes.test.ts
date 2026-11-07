import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { createApp } from '../src/app.ts';
import { buildRoutes } from '../src/routes.ts';
import { loadSettings } from '../src/settings.ts';
import { CLIENT_TOKEN } from '../../shared/config.ts';
import type { DemoRound } from '../../shared/types.ts';
import { misreadIdeaIds } from '../../shared/round.ts';

const pageText = readFileSync(new URL('../../demo/pages/tides.html', import.meta.url), 'utf8').replace(/<[^>]+>/g, ' ');
const tides = JSON.parse(readFileSync(new URL('../../demo/rounds/tides.json', import.meta.url), 'utf8')) as DemoRound;

async function withStub(fn: (post: (path: string, body: unknown) => Promise<Response>) => Promise<void>) {
  const settings = loadSettings({ AI_STUB: '1' });
  const app = createApp({ settings, routes: buildRoutes(settings), log: () => {} });
  const server: Server = createServer((req, res) => void app(req, res));
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown) =>
    fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-spark': CLIENT_TOKEN }, body: JSON.stringify(body) });
  try {
    await fn(post);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('AI_STUB: extract returns a sealed lesson; the other routes answer from it', async () => {
  await withStub(async (post) => {
    const capture = {
      url: 'http://localhost:8787/pages/tides.html', title: 'Tides', text: pageText, source: 'page',
      links: [{ text: 'Tidal force', href: 'https://en.wikipedia.org/wiki/Tidal_force' }],
    };
    const ex = await post('/extract', { capture });
    assert.equal(ex.status, 200);
    const { lesson } = await ex.json();
    assert.equal(lesson.ideas.length, 5);
    assert.equal(JSON.stringify(lesson).includes('modelAnswer'), false);
    // Only the one link the page had survives as a source.
    assert.deepEqual(lesson.ideas.map((i: { sourceUrl: string | null }) => i.sourceUrl).filter(Boolean), ['https://en.wikipedia.org/wiki/Tidal_force']);

    const cr = await post('/creature', { lessonId: lesson.lessonId, ideaId: 'i2', event: 'say', belief: 'right', transcript: [] });
    assert.equal(cr.status, 200);
    assert.equal(await cr.text(), tides.replies.i2!.say, 'Blot answers with the canned reply');

    const transcript = [{ ideaId: 'i2', move: 'say', text: tides.lines?.i2?.say ?? 'There are two bulges of water, one toward the Moon and one on the far side.' }];
    const bars = await (await post('/bars', { lessonId: lesson.lessonId, ideaId: 'i2', transcript })).json();
    assert.equal(bars.bars.length, 5);
    assert.ok(bars.bars.find((b: { id: string }) => b.id === 'i2').value > 0);

    const exam = await (await post('/examine', { lessonId: lesson.lessonId, transcript, heldMisreads: [] })).json();
    assert.equal(exam.results.length, 5);
    assert.ok(exam.results.every((r: { modelAnswer?: string }) => r.modelAnswer));
  });
});

test('an unknown lesson says the round expired', async () => {
  await withStub(async (post) => {
    const res = await post('/bars', { lessonId: 'nope', ideaId: 'i1', transcript: [] });
    assert.equal(res.status, 410);
  });
});

test('/reveal tells an on-device Blot only what the game shows anyway', async () => {
  await withStub(async (post) => {
    const capture = { url: 'http://localhost:8787/pages/tides.html', title: 'Tides', text: pageText, source: 'page', links: [] };
    const { lesson, seed } = await (await post('/extract', { capture })).json();
    const held = misreadIdeaIds(tides.lesson.ideas.map((i) => i.id), seed);
    for (const idea of tides.lesson.ideas) {
      const m = await (await post('/reveal', { lessonId: lesson.lessonId, ideaId: idea.id, kind: 'misread' })).json();
      assert.deepEqual(m, { misread: held.includes(idea.id) ? idea.misread : null });
      const right = idea.whenOptions.findIndex((o) => o.right);
      for (let tap = 0; tap < idea.whenOptions.length; tap++) {
        const w = await (await post('/reveal', { lessonId: lesson.lessonId, ideaId: idea.id, kind: 'when', tap })).json();
        assert.deepEqual(w, { right: tap === right });
      }
    }
    // Nothing else: no answers, and bad questions are refused.
    assert.equal((await post('/reveal', { lessonId: lesson.lessonId, ideaId: 'i1', kind: 'answer' })).status, 400);
    assert.equal((await post('/reveal', { lessonId: lesson.lessonId, ideaId: 'i1', kind: 'when', tap: 7 })).status, 400);
    assert.equal((await post('/reveal', { lessonId: lesson.lessonId, ideaId: 'i9', kind: 'misread' })).status, 400);
    assert.equal((await post('/reveal', { lessonId: 'nope', ideaId: 'i1', kind: 'misread' })).status, 410);
  });
});

const tidesCapture = {
  url: 'http://localhost:8787/pages/tides.html', title: 'Why the sea breathes', text: pageText, source: 'page',
  links: [{ text: 'Tidal force', href: 'https://en.wikipedia.org/wiki/Tidal_force' }],
};

test('after the exam, each idea’s question and key points are revealed (flashbacks need them)', async () => {
  await withStub(async (post) => {
    const { lesson } = await (await post('/extract', { capture: tidesCapture })).json();
    const transcript = [{ ideaId: 'i1', move: 'say', text: 'The moon pulls the water on the near side harder than on the far side.' }];
    const exam = await (await post('/examine', { lessonId: lesson.lessonId, transcript, heldMisreads: [] })).json();
    for (const r of exam.results) {
      const idea = tides.lesson.ideas.find((i) => i.id === r.id)!;
      assert.equal(r.question, idea.question);
      assert.deepEqual(r.keyPoints, idea.keyPoints);
    }
  });
});

test('/recall grades a flashback answer (offline: word overlap) and checks its input', async () => {
  await withStub(async (post) => {
    const idea = tides.lesson.ideas[0]!;
    const card = { ideaName: idea.name, question: idea.question, modelAnswer: idea.modelAnswer, keyPoints: idea.keyPoints, language: 'en' };
    const good = await (await post('/recall', { ...card, answer: idea.modelAnswer })).json();
    assert.ok(good.score >= 60, `good ${good.score}`);
    assert.equal(good.offline, true);
    const empty = await (await post('/recall', { ...card, answer: '' })).json();
    assert.equal(empty.score, 0);
    assert.equal((await post('/recall', { answer: 'hello there friend' })).status, 400);
  });
});

test('a real page’s duel: stored by code, joined as a fresh sealed round on the same seed', async () => {
  await withStub(async (post) => {
    const ex = await (await post('/extract', { capture: tidesCapture })).json();
    const ideas = ex.lesson.ideas.map((i: { id: string }, n: number) => ({ id: i.id, score: n * 20, belief: 'partial' }));
    const made = await post('/duel', { lessonId: ex.lesson.lessonId, name: '  Kai <3 ', ideas });
    assert.equal(made.status, 200);
    const { code } = await made.json();
    assert.match(code, /^[a-z0-9]{8}$/);
    const joined = await (await post('/duel/join', { code })).json();
    assert.notEqual(joined.lesson.lessonId, ex.lesson.lessonId);
    assert.equal(joined.seed, ex.seed);
    assert.equal(JSON.stringify(joined.lesson).includes('modelAnswer'), false);
    assert.equal(joined.challenge.name, 'Kai 3');
    assert.deepEqual(joined.challenge.ideas.map((i: { score: number }) => i.score), [0, 20, 40, 60, 80]);
    assert.equal(joined.page.title, 'Why the sea breathes');
    // The joined round works like any other.
    const bars = await post('/bars', { lessonId: joined.lesson.lessonId, ideaId: 'i1', transcript: [] });
    assert.equal(bars.status, 200);
    assert.equal((await post('/duel/join', { code: 'zzzzzzzz' })).status, 410);
    assert.equal((await post('/duel/join', { code: '../../x' })).status, 400);
    assert.equal((await post('/duel', { lessonId: ex.lesson.lessonId, name: 'K', ideas: [] })).status, 400);
  });
});
