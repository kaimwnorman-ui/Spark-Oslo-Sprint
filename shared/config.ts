// Spark's constants. Pure data, shared by the extension, the server and the tools.

export const PRODUCT_NAME = 'Spark';
/** Tagline under the title (SPEC §0). Empty = no tagline. */
export const CHALLENGE_HOOK = '';
/** One line under the pitch on home: who Spark is for (README: "Who it is for"). */
export const AUDIENCE_LINE = 'Made for students who revise from articles and AI answers.';

// ---- Where things live ----
export const SERVER_PORT = 8787;
export const SERVER_URL = `http://localhost:${SERVER_PORT}`;
/** Fixed by the public `key` in extension/manifest.json (checked by shared/config.test.ts). */
export const EXTENSION_ID = 'mfkcdmkiehbhmcacmhmgofpcojipgknf';
/** Sent as the X-Spark header. Not a secret: it only keeps casual callers off the server. */
export const CLIENT_TOKEN = 'spark-oslo-2026';

// ---- AI roles (SPEC §12); the server reads MODEL_* from env and falls back to these ----
// Measured on tides.html, 5 calls per role (npm run measure): the Opus extractor's p50 was
// 13.8 s (target 12 s), so the extractor uses the Sonnet the claude-api skill names (p50 9.9 s,
// same prompt).
export const DEFAULT_MODELS = {
  extractor: 'claude-sonnet-5-5',
  creature: 'claude-haiku-5-5',
  /**
   * Grades one idea after each of the player's answers (SPEC §12.2). The same grade fills the live bar
   * and is the exam the bout uses, so the two can never disagree. Measured (npm run measure, 9 calibration
   * answers): Opus 5.5 at effort low, 9/9 in range, p50 2.3 s; Sonnet 5.5 thinking off 9/9, p50 2.4 s;
   * Haiku 5.5 thinking off 8/9 (it marked a vague but relevant answer 0), p50 1.3 s.
   */
  grader: 'claude-opus-5-5',
  /** Grades a flashback answer (SPEC §17): one short structured call. */
  recall: 'claude-haiku-5-5',
} as const;
export type Role = keyof typeof DEFAULT_MODELS;

// ---- Round ----
export const IDEA_COUNT = 5;
/**
 * Teaching starts with this much time (SPEC §7). Good answers earn more (TIME_BONUS), the clock starts with the
 * player's first action, and it waits while Blot thinks. Play-tested: a careful typist teaches all five ideas well.
 */
export const TEACH_SECONDS = 120;
/** A monster's comeback is about one idea. */
export const COMEBACK_SECONDS = 60;
/** Seconds earned per idea (SPEC §7): when Blot gets it, when Blot masters it, and for catching Blot's mix-up. */
export const TIME_BONUS = { ready: 20, mastered: 20, caught: 10 } as const;
/** Demo mode plays the set pieces and the bout 1.5x faster. */
export const DEMO_SPEED = 1.5;
export const MESSAGE_LIMIT = 400;
export const MESSAGE_COUNTER_FROM = 320;
/** First bell press arms it for this long; a second press inside it rings. */
export const BELL_ARM_MS = 3000;
/** Bar levels (SPEC §7): Blot is ready to fight with an idea at SOLID, and has mastered it at SIGNATURE. */
export const SOLID = 40;
export const SIGNATURE = 75;
/** Ideas whose bars Blot quietly misreads (SPEC §7 rule 3). */
export const MISREAD_COUNT = 2;
/** If the exam (normally the grades already given) is slower than this, the bout uses the bars (marked provisional). */
export const EXAMINER_WAIT_MS = 20_000;
export const TRAITS_WORN = 6;

// ---- Page capture (SPEC §13) ----
export const MAX_PAGE_WORDS = 6000;
export const MAX_LINKS = 200;
export const MAX_WORD_POSITIONS = 300;
export const MONSTER_WORDS = 120;

// ---- Server ----
export const LESSON_TTL_MS = 2 * 60 * 60 * 1000;
export const EXTRACT_CACHE_MS = 24 * 60 * 60 * 1000;
export const EXTRACTS_PER_HOUR = 20;
export const MAX_BODY_BYTES = 300_000;
/** Per lesson (one round): how many calls each paid route accepts before it asks for a break. */
export const LESSON_CALL_CAPS = { creature: 150, grade: 150, examine: 12 } as const;
/** All paid calls from one address in an hour. A loopback server sees one address, so this is a global safety net. */
export const CALLS_PER_HOUR = 1500;
/** Lessons kept in memory at once; the oldest go first. */
export const MAX_LESSONS = 1000;
/** How often the server forgets what has expired. */
export const SWEEP_MS = 10 * 60 * 1000;
/** Learner data stays in the browser this long after it was last used (shared/memory.ts, shared/insights.ts). */
export const RETAIN_DAYS = 180
/** Flashback grading calls per IP per hour. */
export const RECALLS_PER_HOUR = 60;
/** A real page's duel waits this long on the server for the friend. */
export const DUEL_TTL_MS = 24 * 60 * 60 * 1000;
export const DUELS_PER_HOUR = 20;
export const MAX_DUELS = 500;
