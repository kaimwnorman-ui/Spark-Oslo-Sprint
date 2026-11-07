// Demo rounds from demo/rounds/*.json: AI_STUB answers and the offline fallback (SPEC §13).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { DemoRound, PageCapture } from '../../shared/types.ts';
import { contentWords } from '../../shared/words.ts';

const ROUNDS = fileURLToPath(new URL('../../demo/rounds/', import.meta.url));

let cache: DemoRound[] | null = null;
export function demoRounds(): DemoRound[] {
  if (!cache) {
    cache = existsSync(ROUNDS)
      ? readdirSync(ROUNDS).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(path.join(ROUNDS, f), 'utf8')) as DemoRound)
      : [];
  }
  return cache;
}

/** The canned round for a page: same file name as a demo page, else the closest by words. */
export function roundForPage(capture: Pick<PageCapture, 'url' | 'text'>): DemoRound | null {
  const rounds = demoRounds().filter((r) => r.id !== 'stage');
  if (!rounds.length) return null;
  let file = '';
  try {
    file = path.basename(new URL(capture.url).pathname);
  } catch {
    // not a URL
  }
  const byName = rounds.find((r) => path.basename(r.page) === file);
  if (byName) return byName;
  const words = new Set(contentWords(capture.text));
  let best: DemoRound | null = null;
  let bestScore = 0;
  for (const r of rounds) {
    const score = r.lesson.words.filter((w) => words.has(w.toLowerCase())).length;
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return bestScore >= 20 ? best : null;
}

export function roundById(id: string): DemoRound | null {
  return demoRounds().find((r) => r.id === id) ?? null;
}
