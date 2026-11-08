// A round survives a reload (SPEC §18): what the player has taught, what Blot believes and the time left are kept
// in this tab only (sessionStorage: gone when the tab closes, never sent anywhere) and offered back as "Resume".
import type { TranscriptEntry } from '../../../shared/types.ts';
import type { IdeaProgress } from './context.ts';

/** A saved round older than this is not offered. */
export const RESUME_MAX_AGE_MS = 30 * 60 * 1000;
/** A resumed round always has at least this long, so the player can ring the bell straight away. */
export const RESUME_MIN_MS = 10_000;

export interface RoundSave {
  /** 2: the teach-back round (each idea has a step). Older saves are not offered. */
  v: 2;
  at: number;
  /** Which lesson this belongs to (its seed and idea names), so a new lesson never resumes into an old round. */
  fingerprint: string;
  transcript: TranscriptEntry[];
  progress: Record<string, IdeaProgress>;
  misreads: string[];
  remainingMs: number;
  attempt: number;
  focus: string | null;
  pageText: string;
}

export const fingerprintOf = (names: readonly string[], seed: number): string => `${seed >>> 0}:${names.join('|')}`;

const slot = (key: string) => `spark:resume:${key}`;

export function saveRound(key: string, save: RoundSave): void {
  try {
    sessionStorage.setItem(slot(key), JSON.stringify(save));
  } catch {
    // Storage is full or off: the round simply cannot be resumed.
  }
}

export function loadRound(key: string, fingerprint: string, now = Date.now()): RoundSave | null {
  try {
    const raw = sessionStorage.getItem(slot(key));
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<RoundSave>;
    if (s.v !== 2 || s.fingerprint !== fingerprint || typeof s.at !== 'number' || now - s.at > RESUME_MAX_AGE_MS) return null;
    if (!Array.isArray(s.transcript) || !s.progress || typeof s.progress !== 'object' || !Array.isArray(s.misreads)) return null;
    return s as RoundSave;
  } catch {
    return null;
  }
}

export function clearRound(key: string): void {
  try {
    sessionStorage.removeItem(slot(key));
  } catch {
    // Nothing to clear.
  }
}

/** Ideas the player has taught so far (any move), for the "2 of 5 taught" line. */
export function taughtCount(save: Pick<RoundSave, 'progress'>): number {
  return Object.values(save.progress).filter((p) => p.moves.length > 0).length;
}
