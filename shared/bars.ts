// Bar rules (SPEC §7). Pure and unit-tested; the AI only supplies raw scores.
import { MESSAGE_COUNTER_FROM, MESSAGE_LIMIT, SIGNATURE, SOLID } from './config.ts';
import type { Move } from './types.ts';
import { tokens, windows } from './words.ts';

export const CAP_SAY = 30;
export const CAP_TAP = 40;
export const CAP_FULL = 100;

/** Minimum words for the typed moves: enough to say something, never a hurdle (the grader judges the rest). */
export const MIN_WORDS: Readonly<Partial<Record<Move, number>>> = { say: 4, example: 4, why: 4 };
export const TYPED_MOVES: readonly Move[] = ['say', 'example', 'why'];

/**
 * Rule 1: the cap from the moves used on one idea. 30 if it was only explained; 40 once the player has checked
 * Blot's say-back (or tapped a situation) and no typed why or example exists; 100 once a typed why or example exists.
 */
export function capFor(moves: Iterable<Move>): number {
  const used = new Set(moves);
  if (used.has('example') || used.has('why')) return CAP_FULL;
  if (used.has('when') || used.has('check')) return CAP_TAP;
  if (used.has('say')) return CAP_SAY;
  return 0;
}

/** Bar value = min(cap, AI score), as a whole number in 0..100. */
export function barValue(moves: Iterable<Move>, aiScore: number): number {
  const score = Math.round(Math.min(100, Math.max(0, aiScore)));
  return Math.min(capFor(moves), score);
}

export type Level = 'empty' | 'started' | 'solid' | 'signature';
export function levelOf(value: number): Level {
  if (value >= SIGNATURE) return 'signature';
  if (value >= SOLID) return 'solid';
  return value > 0 ? 'started' : 'empty';
}

// ---- Rule 2: pasted text is capped ----

/** The page's 6-word windows, built once per round. */
export function sourceWindows(text: string): Set<string> {
  return new Set(windows(text));
}

/** Share (0..1) of the message's 6-word windows that occur verbatim in the source. */
export function pastedShare(message: string, source: Set<string>): number {
  const own = windows(message);
  if (!own.length) return 0;
  return own.filter((w) => source.has(w)).length / own.length;
}

export function isPasted(message: string, source: Set<string>): boolean {
  return pastedShare(message, source) >= 0.5;
}

/** A pasted typed message counts as a bare explanation (cap 30). */
export function effectiveMove(move: Move, pasted: boolean): Move {
  return pasted && TYPED_MOVES.includes(move) ? 'say' : move;
}

// ---- Rule 7: message limit ----

export function clampMessage(text: string): string {
  return text.slice(0, MESSAGE_LIMIT);
}

export function counterVisible(length: number): boolean {
  return length >= MESSAGE_COUNTER_FROM;
}

export function atLimit(length: number): boolean {
  return length >= MESSAGE_LIMIT;
}

export function wordCount(text: string): number {
  return tokens(text).length;
}

/** Words still missing before a typed move counts (0 when long enough). */
export function wordsMissing(move: Move, text: string): number {
  return Math.max(0, (MIN_WORDS[move] ?? 0) - wordCount(text));
}
