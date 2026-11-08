// The player's learning loop, kept in local storage: memory cards, power-ups, comebacks, round
// history and traits. ?days=N moves the clock forward (presenters and tests: show a fading memory).
import { RETAIN_DAYS, TRAITS_WORN } from '../../../shared/config.ts';
import { addRound, pruneHistory, type RoundSummary } from '../../../shared/insights.ts';
import { DAY_MS, emptyMemory, normalizeMemory, pruneMemory, wornTraits, type MemoryState } from '../../../shared/memory.ts';
import type { Trait } from '../../../shared/types.ts';
import { clearRoundHandoffs, getLocal, removeLocal, setLocal } from './storage.ts';

const days = Math.max(0, Math.min(365, Number(new URLSearchParams(location.search).get('days')) || 0));

/** A link inside the game that keeps any ?days=N time travel. */
export function navUrl(path: string): string {
  return days ? `${path}${path.includes('?') ? '&' : '?'}days=${days}` : path;
}

/** Now, plus any ?days=N time travel. */
export function now(): number {
  return Date.now() + days * DAY_MS;
}

// What is kept is forgotten after RETAIN_DAYS of not being used. The real clock decides, never ?days=.
export async function loadMemory(): Promise<MemoryState> {
  return pruneMemory(normalizeMemory(await getLocal<unknown>('memory', emptyMemory())), Date.now());
}

export async function saveMemory(memory: MemoryState): Promise<void> {
  await setLocal('memory', memory);
}

/** Read, change and write the memory in one step. */
export async function updateMemory(change: (m: MemoryState) => MemoryState): Promise<MemoryState> {
  const next = change(await loadMemory());
  await saveMemory(next);
  return next;
}

export async function loadHistory(): Promise<RoundSummary[]> {
  const h = await getLocal<unknown>('history', []);
  return pruneHistory(Array.isArray(h) ? (h as RoundSummary[]).filter((r) => r && Array.isArray(r.ideas)) : [], Date.now());
}

export async function recordRound(round: RoundSummary): Promise<RoundSummary[]> {
  const next = addRound(await loadHistory(), round);
  await setLocal('history', next);
  return next;
}

export async function allTraits(): Promise<Trait[]> {
  const t = await getLocal<unknown>('traits', []);
  return Array.isArray(t) ? (t as Trait[]).filter((x) => x && x.at >= Date.now() - RETAIN_DAYS * DAY_MS) : [];
}

/** Everything Spark remembers about the player, from this browser: memories, history, traits, name, notice, saved pages. */
export async function clearMyData(): Promise<void> {
  await removeLocal(['memory', 'history', 'traits', 'playerName', 'played', 'consent']);
  await clearRoundHandoffs();
}

/** The traits Blot wears, each looking as fresh as its memory. */
export async function currentTraits(memory?: MemoryState): Promise<Trait[]> {
  const m = memory ?? (await loadMemory());
  return wornTraits(await allTraits(), m.cards, now(), TRAITS_WORN);
}

export async function addTrait(trait: Trait): Promise<void> {
  await setLocal('traits', [...(await allTraits()), trait].slice(-50));
}

export async function playerName(): Promise<string> {
  return getLocal<string>('playerName', '');
}

export async function setPlayerName(name: string): Promise<void> {
  await setLocal('playerName', name);
}
