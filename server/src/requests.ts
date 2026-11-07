// Checks on what the extension sends. Page text and player text are data: they are only
// length-checked here and wrapped in data blocks before any model sees them.
import { MAX_LINKS, MAX_PAGE_WORDS, MESSAGE_LIMIT } from '../../shared/config.ts';
import { LANGUAGES, type Language, type PageCapture, type PageLink, type TranscriptEntry } from '../../shared/types.ts';
import { HttpError } from './http.ts';
import type { RecallInput } from './prompts.ts';

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown, max: number): string => (typeof x === 'string' ? x.slice(0, max) : '');

export function readCapture(body: unknown): Pick<PageCapture, 'url' | 'title' | 'text' | 'links' | 'source'> {
  if (!isObj(body) || !isObj(body.capture)) throw new HttpError(400, 'Missing the page.');
  const c = body.capture;
  const text = str(c.text, 200_000).split(/\s+/).slice(0, MAX_PAGE_WORDS).join(' ');
  if (text.split(/\s+/).length < 60) throw new HttpError(422, 'This page has too few words to make a monster. Try a longer article.');
  const links: PageLink[] = Array.isArray(c.links)
    ? c.links.filter(isObj).slice(0, MAX_LINKS).map((l) => ({ text: str(l.text, 160), href: str(l.href, 2000) })).filter((l) => l.href)
    : [];
  return {
    url: str(c.url, 2000),
    title: str(c.title, 300),
    text,
    links,
    source: c.source === 'selection' ? 'selection' : 'page',
  };
}

export function readLessonId(body: unknown): string {
  if (!isObj(body) || typeof body.lessonId !== 'string' || body.lessonId.length > 80) throw new HttpError(400, 'Missing lessonId.');
  return body.lessonId;
}

export function readTranscript(body: unknown): TranscriptEntry[] {
  if (!isObj(body) || !Array.isArray(body.transcript)) return [];
  return body.transcript
    .filter(isObj)
    .slice(0, 200)
    .map((e) => {
      const entry: TranscriptEntry = { ideaId: str(e.ideaId, 8), move: str(e.move, 10) as TranscriptEntry['move'] };
      if (typeof e.text === 'string') entry.text = e.text.slice(0, MESSAGE_LIMIT);
      if (typeof e.tap === 'number' && Number.isInteger(e.tap) && e.tap >= 0 && e.tap < 3) entry.tap = e.tap;
      if (e.tap === 'yes' || e.tap === 'no') entry.tap = e.tap;
      return entry;
    })
    .filter((e) => ['say', 'example', 'when', 'check', 'why', 'same', 'dontknow'].includes(e.move));
}

export function readString(body: unknown, key: string, max: number): string {
  return isObj(body) ? str(body[key], max) : '';
}

export function readStrings(body: unknown, key: string): string[] {
  if (!isObj(body) || !Array.isArray(body[key])) return [];
  return (body[key] as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 10).map((x) => x.slice(0, 8));
}

/** A flashback answer to grade. The idea's revealed answer comes back from the client: it is data, length-checked. */
export function readRecall(body: unknown): RecallInput {
  if (!isObj(body)) throw new HttpError(400, 'Missing the answer.');
  const question = str(body.question, 300).trim();
  const modelAnswer = str(body.modelAnswer, 800).trim();
  if (!question || !modelAnswer) throw new HttpError(400, 'Missing the idea.');
  const keyPoints = Array.isArray(body.keyPoints)
    ? body.keyPoints.filter((k): k is string => typeof k === 'string').slice(0, 4).map((k) => k.slice(0, 160).trim()).filter(Boolean)
    : [];
  const language = LANGUAGES.includes(body.language as Language) ? (body.language as Language) : 'en';
  return { ideaName: str(body.ideaName, 120).trim(), question, modelAnswer, keyPoints, answer: str(body.answer, MESSAGE_LIMIT).trim(), language };
}

/** A duel code from a link: exactly 8 lowercase letters and digits. */
export function readDuelCode(body: unknown): string {
  const code = readString(body, 'code', 16);
  if (!/^[a-z0-9]{8}$/.test(code)) throw new HttpError(400, 'That is not a challenge code.');
  return code;
}
