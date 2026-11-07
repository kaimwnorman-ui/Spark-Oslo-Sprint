// Spark's constants. Pure data, shared by the extension, the server and the tools.

export const PRODUCT_NAME = 'Spark';
/** Tagline under the title (SPEC §0). Empty = no tagline. */
export const CHALLENGE_HOOK = '';

// ---- Where things live ----
export const SERVER_PORT = 8787;
export const SERVER_URL = `http://localhost:${SERVER_PORT}`;
/** Fixed by the public `key` in extension/manifest.json (checked by shared/config.test.ts). */
export const EXTENSION_ID = 'mfkcdmkiehbhmcacmhmgofpcojipgknf';
/** Sent as the X-Spark header. Not a secret: it only keeps casual callers off the server. */
export const CLIENT_TOKEN = 'spark-oslo-2026';

// ---- AI roles (SPEC §12); the server reads MODEL_* from env and falls back to these ----
export const DEFAULT_MODELS = {
  extractor: 'claude-opus-5-5',
  creature: 'claude-haiku-5-5',
  bars: 'claude-haiku-5-5',
  examiner: 'claude-opus-5-5',
} as const;
export type Role = keyof typeof DEFAULT_MODELS;

// ---- Round ----
export const IDEA_COUNT = 5;
export const TEACH_SECONDS = 120;
export const DEMO_TEACH_SECONDS = 45;
/** Demo mode plays the set pieces and the bout 1.5x faster. */
export const DEMO_SPEED = 1.5;
export const MESSAGE_LIMIT = 400;
export const MESSAGE_COUNTER_FROM = 320;
export const BARS_DEBOUNCE_MS = 800;
/** First bell press arms it for this long; a second press inside it rings. */
export const BELL_ARM_MS = 3000;
/** Blot never asks two questions within this gap. */
export const QUESTION_GAP_MS = 6000;
/** Bar levels (SPEC §7). */
export const SOLID = 40;
export const SIGNATURE = 75;
/** Ideas whose bars Blot quietly misreads (SPEC §7 rule 3). */
export const MISREAD_COUNT = 2;
/** If the examiner is slower than this, the bout uses the live bars (marked provisional). */
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
