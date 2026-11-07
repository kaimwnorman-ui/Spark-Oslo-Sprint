// Lessons live in server memory for 2 hours (SPEC §12.4); extractor results are cached by
// URL hash + text hash for 24 hours. Nothing else is stored.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DUEL_TTL_MS, EXTRACT_CACHE_MS, LESSON_TTL_MS, MAX_DUELS } from '../../shared/config.ts';
import type { DuelChallenge } from '../../shared/duel.ts';
import type { Lesson, PageCapture } from '../../shared/types.ts';

export interface StoredLesson {
  lesson: Lesson;
  /** The canned round answering for this lesson (AI_STUB and offline mode), else null. */
  roundId: string | null;
  /** The page's text, for grounding checks and the creature's context. */
  text: string;
  seed: number;
  /** The page's address and title (for a duel's "read the page first" link). */
  page: { url: string; title: string } | null;
  expires: number;
}

export function pageKey(capture: Pick<PageCapture, 'url' | 'text'>): string {
  const h = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);
  return `${h(capture.url)}:${h(capture.text)}`;
}

export class LessonStore {
  private lessons = new Map<string, StoredLesson>();
  private cache = new Map<string, { lesson: Lesson; expires: number }>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  put(
    lesson: Lesson,
    text: string,
    roundId: string | null = null,
    seed?: number,
    page: StoredLesson['page'] = null,
  ): { lessonId: string; seed: number } {
    this.sweep();
    const lessonId = randomUUID();
    const s = seed ?? parseInt(lessonId.replace(/-/g, '').slice(0, 8), 16) >>> 0;
    this.lessons.set(lessonId, { lesson, roundId, text, seed: s, page, expires: this.now() + LESSON_TTL_MS });
    return { lessonId, seed: s };
  }

  get(lessonId: string): StoredLesson | null {
    const stored = this.lessons.get(lessonId);
    if (!stored) return null;
    if (stored.expires < this.now()) {
      this.lessons.delete(lessonId);
      return null;
    }
    return stored;
  }

  cached(key: string): Lesson | null {
    const hit = this.cache.get(key);
    if (!hit || hit.expires < this.now()) return null;
    return hit.lesson;
  }

  remember(key: string, lesson: Lesson): void {
    this.cache.set(key, { lesson, expires: this.now() + EXTRACT_CACHE_MS });
  }

  private sweep(): void {
    const now = this.now();
    for (const [id, s] of this.lessons) if (s.expires < now) this.lessons.delete(id);
    for (const [k, c] of this.cache) if (c.expires < now) this.cache.delete(k);
  }
}

/** A real page's duel: the lesson (with its answers) waits on the server for the friend for 24 hours. */
export interface StoredDuel {
  lesson: Lesson;
  text: string;
  roundId: string | null;
  page: StoredLesson['page'];
  challenge: DuelChallenge;
  expires: number;
}

export class DuelStore {
  private duels = new Map<string, StoredDuel>();
  private readonly now: () => number;
  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** Returns a short code: 8 lowercase letters and digits. */
  put(duel: Omit<StoredDuel, 'expires'>): string {
    this.sweep();
    // Bounded memory: the oldest duels go first.
    while (this.duels.size >= MAX_DUELS) this.duels.delete(this.duels.keys().next().value!);
    let code = '';
    do code = codeFrom(randomBytes(8));
    while (this.duels.has(code));
    this.duels.set(code, { ...duel, expires: this.now() + DUEL_TTL_MS });
    return code;
  }

  get(code: string): StoredDuel | null {
    const duel = this.duels.get(code);
    if (!duel) return null;
    if (duel.expires < this.now()) {
      this.duels.delete(code);
      return null;
    }
    return duel;
  }

  private sweep(): void {
    const now = this.now();
    for (const [code, d] of this.duels) if (d.expires < now) this.duels.delete(code);
  }
}

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
function codeFrom(bytes: Buffer): string {
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Per-IP rate limit (e.g. /extract: 20 per hour). */
export class RateLimit {
  private hits = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  constructor(max: number, windowMs: number, now: () => number = Date.now) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
  }
  allow(ip: string): boolean {
    const t = this.now();
    const recent = (this.hits.get(ip) ?? []).filter((x) => t - x < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(ip, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(ip, recent);
    return true;
  }
}
