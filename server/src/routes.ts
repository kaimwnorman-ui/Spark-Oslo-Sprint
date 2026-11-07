// The four AI routes (SPEC §13). With AI_STUB=1, or with no Anthropic key, they answer from the
// demo round that matches the page (offline mode). Live AI: ai.ts.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { EXTRACTS_PER_HOUR } from '../../shared/config.ts';
import { demoAllBars, demoBars, demoExam, demoReply, type CreatureEvent } from '../../shared/demo.ts';
import { sealLesson } from '../../shared/lesson.ts';
import type { TeachBelief } from '../../shared/round.ts';
import type { DemoRound, Lesson } from '../../shared/types.ts';
import type { RouteHandler } from './app.ts';
import { createAnthropic } from './anthropic.ts';
import { roundById, roundForPage } from './fixtures.ts';
import { HttpError, clientIp } from './http.ts';
import { LessonStore, RateLimit, pageKey, type StoredLesson } from './lessons.ts';
import { readCapture, readLessonId, readString, readStrings, readTranscript } from './requests.ts';
import type { Settings } from './settings.ts';
import { keepPageLinksOnly } from './validate.ts';
import type { LiveAi } from './ai.ts';

const EVENTS: CreatureEvent[] = ['say', 'example', 'why', 'fix', 'when', 'check', 'askWhy'];
const BELIEFS: TeachBelief[] = ['none', 'right', 'misread'];

export interface RouteOptions {
  store?: LessonStore;
  /** Live AI roles; absent in stub/offline mode. */
  ai?: LiveAi | null;
  log?: (line: string) => void;
}

export function buildRoutes(settings: Settings, opts: RouteOptions = {}): Record<string, RouteHandler> {
  const store = opts.store ?? new LessonStore();
  const limit = new RateLimit(EXTRACTS_PER_HOUR, 60 * 60 * 1000);
  const live = settings.stub ? null : (opts.ai ?? null);

  const lessonFor = (body: unknown): StoredLesson => {
    const stored = store.get(readLessonId(body));
    if (!stored) throw new HttpError(410, 'The round expired, play it again.');
    return stored;
  };
  const cannedFor = (stored: StoredLesson): DemoRound | null => (stored.roundId ? roundById(stored.roundId) : null);

  const extract: RouteHandler = async (body, req) => {
    if (!limit.allow(clientIp(req))) throw new HttpError(429, 'That is a lot of monsters for one hour. Try again a bit later.');
    const capture = readCapture(body);
    let lesson: Lesson;
    let roundId: string | null = null;
    let seed: number | undefined;
    if (live) {
      const key = pageKey(capture);
      lesson = store.cached(key) ?? (await live.extract(capture));
      store.remember(key, lesson);
    } else {
      const round = roundForPage(capture) ?? (settings.stub ? roundById('tides') : null);
      if (!round) throw new HttpError(503, 'Spark’s AI is offline right now, so only the demo pages work.');
      lesson = round.lesson;
      roundId = round.id;
      seed = round.seed;
    }
    lesson = keepPageLinksOnly(lesson, capture.links);
    const put = store.put(lesson, capture.text, roundId, seed);
    return { lesson: sealLesson(lesson, put.lessonId), seed: put.seed, offline: !live, roundId };
  };

  const creature: RouteHandler = async (body, _req, res: ServerResponse) => {
    const stored = lessonFor(body);
    const ideaId = readString(body, 'ideaId', 8);
    if (!stored.lesson.ideas.some((i) => i.id === ideaId)) throw new HttpError(400, 'Unknown idea.');
    const event = readString(body, 'event', 10) as CreatureEvent;
    if (!EVENTS.includes(event)) throw new HttpError(400, 'Unknown event.');
    const belief = (BELIEFS.includes(readString(body, 'belief', 10) as TeachBelief) ? readString(body, 'belief', 10) : 'none') as TeachBelief;
    const tapRaw = (body as Record<string, unknown>).tap;
    const tap = typeof tapRaw === 'number' && Number.isInteger(tapRaw) ? tapRaw : undefined;
    const request = { ideaId, event, text: readString(body, 'text', 400) || undefined, tap, belief, transcript: readTranscript(body) };
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    const canned = cannedFor(stored);
    if (!live || canned) {
      res.end(canned ? demoReply(canned, request) : '');
      return undefined;
    }
    for await (const chunk of live.creature(stored, request)) res.write(chunk);
    res.end();
    return undefined;
  };

  const bars: RouteHandler = async (body) => {
    const stored = lessonFor(body);
    const ideaId = readString(body, 'ideaId', 8);
    const transcript = readTranscript(body);
    const canned = cannedFor(stored);
    if (!live || canned) {
      if (!canned) throw new HttpError(503, 'Offline.');
      return { bars: demoAllBars(canned, transcript), whenRight: demoBars(canned, ideaId, transcript).whenRight };
    }
    return live.bars(stored, ideaId, transcript);
  };

  const examine: RouteHandler = async (body) => {
    const stored = lessonFor(body);
    const transcript = readTranscript(body);
    const held = readStrings(body, 'heldMisreads');
    const canned = cannedFor(stored);
    if (!live || canned) {
      if (!canned) throw new HttpError(503, 'Offline.');
      return demoExam(canned, transcript, held);
    }
    return live.examine(stored, transcript, held);
  };

  return { '/extract': extract, '/creature': creature, '/bars': bars, '/examine': examine };
}

/** Builds the live AI roles when there is a key and AI_STUB is off. */
export function liveAiFor(settings: Settings, make: (client: NonNullable<ReturnType<typeof createAnthropic>>) => LiveAi): LiveAi | null {
  if (settings.stub) return null;
  const client = createAnthropic(settings.keys);
  return client ? make(client) : null;
}

export type { IncomingMessage };
