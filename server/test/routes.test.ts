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
