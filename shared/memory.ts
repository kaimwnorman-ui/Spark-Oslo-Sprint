// The learning loop (SPEC §17): what Blot was taught fades unless the player remembers it.
// Memory cards, spaced flashbacks, power-ups earned by remembering, and monsters that come back.
// Pure: the game keeps a MemoryState in local storage and passes `now` in.
import type { BoutBoosts } from './bout.ts';
import type { ExamResult, Language, MonsterShape, Trait, TraitLook } from './types.ts';
import { hashString } from './random.ts';
import { contentWords, stem, tokens } from './words.ts';

export const DAY_MS = 86_400_000;
/** Days until a card is due again. Every good recall moves it one step (spaced retrieval). */
export const INTERVAL_DAYS = [3, 7, 14, 30, 60] as const;
/** A recall at or above this passes (and earns a power-up). */
export const RECALL_PASS = 60;
/** A recall at or above this earns Double ink instead of an Ink refill. */
export const RECALL_STRONG = 85;
/** Below this a recall failed: the card stays due (asked again after a short snooze). */
export const RECALL_PARTIAL = 30;
export const SNOOZE_MS = 12 * 60 * 60 * 1000;
export const REFILL_HP = 20;
/** At most this many of each power-up are kept. */
export const MAX_POWER = 3;
export const MAX_CARDS = 60;
export const MAX_COMEBACKS = 5;
/** A monster comes back this long after the round. */
export const COMEBACK_DAYS = 1;
/** In a comeback, the ideas already beaten count at least this much. */
export const COMEBACK_LOCK = 70;

export type Freshness = 'fresh' | 'fading' | 'faded';
export type PowerUp = 'refill' | 'double';

/** One idea the player taught, kept so Blot can ask about it again later. */
export interface MemoryCard {
  id: string;
  ideaName: string;
  /** The idea's hidden question, revealed after teaching. */
  question: string;
  keyPoints: string[];
  modelAnswer: string;
  monsterName: string;
  topic: string;
  color: string;
  language: Language;
  /** The exam score when it was taught. */
  score: number;
  learnedAt: number;
  /** Last time it was taught or remembered. */
  lastAt: number;
  /** Index into INTERVAL_DAYS. */
  stage: number;
  recalls: number;
  lastRecall?: number;
  /** A failed recall is not asked again before this. */
  snoozeUntil?: number;
  sourceUrl: string | null;
  sourceTitle: string | null;
}

/** A monster that got away (or won on a weak idea) and will come back for a rematch. */
export interface Comeback {
  id: string;
  monsterName: string;
  shape: MonsterShape;
  color: string;
  topic: string;
  words: string[];
  language: Language;
  /** The demo round it came from (its rematch runs offline), or null for a real page. */
  demoId: string | null;
  /** The weak idea the monster comes back with. */
  ideaId: string;
  ideaName: string;
  question: string;
  keyPoints: string[];
  modelAnswer: string;
  /** Every idea's name and best score so far: the others start the rematch already beaten. */
  ideas: { id: string; name: string; score: number }[];
  sourceUrl: string | null;
  sourceTitle: string | null;
  createdAt: number;
  dueAt: number;
  /** Rematches lost so far. */
  tries: number;
}

export interface MemoryState {
  cards: MemoryCard[];
  powerUps: Record<PowerUp, number>;
  comebacks: Comeback[];
  /** Monsters beaten for good in a comeback. */
  tamed: number;
}

export function emptyMemory(): MemoryState {
  return { cards: [], powerUps: { refill: 0, double: 0 }, comebacks: [], tamed: 0 };
}

/** Anything from storage, made safe to use (old or partial data never breaks the game). */
export function normalizeMemory(x: unknown): MemoryState {
  const m = (x && typeof x === 'object' ? x : {}) as Partial<MemoryState>;
  const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(MAX_POWER, Math.floor(n))) : 0);
  return {
    cards: Array.isArray(m.cards) ? m.cards.filter((c) => c && typeof c.id === 'string' && typeof c.question === 'string') : [],
    powerUps: { refill: count(m.powerUps?.refill), double: count(m.powerUps?.double) },
    comebacks: Array.isArray(m.comebacks) ? m.comebacks.filter((c) => c && typeof c.id === 'string' && Array.isArray(c.ideas)) : [],
    tamed: typeof m.tamed === 'number' ? Math.max(0, Math.floor(m.tamed)) : 0,
  };
}

// ---------------------------------------------------------------- cards

export function cardId(monsterName: string, ideaName: string): string {
  return `c${hashString(`${monsterName.toLowerCase()}|${ideaName.toLowerCase()}`).toString(36)}`;
}

export function intervalDays(stage: number): number {
  return INTERVAL_DAYS[Math.max(0, Math.min(INTERVAL_DAYS.length - 1, stage))]!;
}

export function dueAt(card: Pick<MemoryCard, 'lastAt' | 'stage'>): number {
  return card.lastAt + intervalDays(card.stage) * DAY_MS;
}

/** Fresh until the card is due; fading for one more interval; then faded. */
export function freshness(card: Pick<MemoryCard, 'lastAt' | 'stage'>, now: number): Freshness {
  const elapsed = now - card.lastAt;
  const interval = intervalDays(card.stage) * DAY_MS;
  if (elapsed < interval) return 'fresh';
  return elapsed < 2 * interval ? 'fading' : 'faded';
}

/** 1 when just taught, 0 when faded: for the freshness bars. */
export function freshnessShare(card: Pick<MemoryCard, 'lastAt' | 'stage'>, now: number): number {
  const interval = intervalDays(card.stage) * DAY_MS;
  return Math.max(0, Math.min(1, 1 - (now - card.lastAt) / (2 * interval)));
}

export function isDue(card: MemoryCard, now: number): boolean {
  return now >= dueAt(card) && !(card.snoozeUntil && now < card.snoozeUntil);
}

/** The card Blot asks about: the most overdue one (ties: the weaker one). */
export function dueCard(cards: readonly MemoryCard[], now: number): MemoryCard | null {
  const due = cards.filter((c) => isDue(c, now));
  if (!due.length) return null;
  const overdue = (c: MemoryCard) => (now - c.lastAt) / (intervalDays(c.stage) * DAY_MS);
  return [...due].sort((a, b) => overdue(b) - overdue(a) || a.score - b.score || a.id.localeCompare(b.id))[0]!;
}

/** Days until the next card is due (0 when one is due now), or null with no cards. */
export function nextDueIn(cards: readonly MemoryCard[], now: number): number | null {
  if (!cards.length) return null;
  const soonest = Math.min(...cards.map((c) => Math.max(dueAt(c), c.snoozeUntil ?? 0)));
  return Math.max(0, Math.ceil((soonest - now) / DAY_MS));
}

export interface RecordInput {
  monster: { name: string; color: string };
  topic: string;
  language: Language;
  ideas: readonly { id: string; name: string; sourceUrl: string | null; sourceTitle: string | null }[];
  exam: ExamResult;
}

/**
 * After the exam: every idea the player actually taught becomes (or refreshes) a card.
 * Ideas without a revealed question (offline Blot) are skipped: there is nothing to ask later.
 */
export function recordCards(state: MemoryState, input: RecordInput, now: number): { state: MemoryState; ids: Record<string, string> } {
  const cards = [...state.cards];
  const ids: Record<string, string> = {};
  for (const r of input.exam.results) {
    const idea = input.ideas.find((i) => i.id === r.id);
    if (!idea || r.score < 10 || !r.question || !r.modelAnswer) continue;
    const id = cardId(input.monster.name, idea.name);
    ids[r.id] = id;
    const old = cards.findIndex((c) => c.id === id);
    const prev = old >= 0 ? cards[old]! : null;
    const card: MemoryCard = {
      id,
      ideaName: idea.name,
      question: r.question,
      keyPoints: r.keyPoints ?? prev?.keyPoints ?? [],
      modelAnswer: r.modelAnswer,
      monsterName: input.monster.name,
      topic: input.topic,
      color: input.monster.color,
      language: input.language,
      score: r.score,
      learnedAt: prev?.learnedAt ?? now,
      lastAt: now,
      stage: prev?.stage ?? 0,
      recalls: prev?.recalls ?? 0,
      ...(prev?.lastRecall !== undefined ? { lastRecall: prev.lastRecall } : {}),
      sourceUrl: idea.sourceUrl,
      sourceTitle: idea.sourceTitle,
    };
    if (prev) cards.splice(old, 1);
    cards.push(card);
  }
  // Keep the newest cards.
  const kept = cards.sort((a, b) => a.lastAt - b.lastAt).slice(-MAX_CARDS);
  return { state: { ...state, cards: kept }, ids };
}

// ---------------------------------------------------------------- recall

/**
 * Offline grading of a recall (when the server cannot grade it): how much of the idea's key
 * points and model answer the player's own words cover. Repeating the idea's name earns nothing.
 */
export function recallScore(card: Pick<MemoryCard, 'ideaName' | 'keyPoints' | 'modelAnswer'>, answer: string): number {
  const words = tokens(answer).length;
  if (words < 3) return 0;
  const nameStems = new Set(contentWords(card.ideaName).map(stem));
  const own = new Set(contentWords(answer).map(stem).filter((s) => !nameStems.has(s)));
  const stemsOf = (text: string) => contentWords(text).map(stem).filter((s) => !nameStems.has(s));
  const points = card.keyPoints.filter((k) => stemsOf(k).length);
  const pointHits = points.filter((k) => stemsOf(k).some((s) => own.has(s))).length;
  const modelHits = new Set(stemsOf(card.modelAnswer).filter((s) => own.has(s))).size;
  if (!pointHits && !modelHits) return words >= 6 ? 10 : 0;
  const coverage = points.length ? pointHits / points.length : Math.min(1, modelHits / 4);
  return Math.round(Math.min(100, 25 + 55 * coverage + 5 * Math.min(4, modelHits)));
}

export type RecallGrade = 'pass' | 'partial' | 'fail';
export function recallGrade(score: number): RecallGrade {
  if (score >= RECALL_PASS) return 'pass';
  return score >= RECALL_PARTIAL ? 'partial' : 'fail';
}

/** A pass moves the card a step further apart; a partial refreshes it; a fail leaves it due. */
export function applyRecall(card: MemoryCard, score: number, now: number): MemoryCard {
  const grade = recallGrade(score);
  const next: MemoryCard = { ...card, recalls: card.recalls + 1, lastRecall: score };
  delete next.snoozeUntil;
  if (grade === 'pass') {
    next.stage = Math.min(INTERVAL_DAYS.length - 1, card.stage + 1);
    next.lastAt = now;
  } else if (grade === 'partial') {
    next.lastAt = now;
  } else {
    next.stage = 0;
    next.snoozeUntil = now + SNOOZE_MS;
  }
  return next;
}

export function replaceCard(state: MemoryState, card: MemoryCard): MemoryState {
  return { ...state, cards: state.cards.map((c) => (c.id === card.id ? card : c)) };
}

// ---------------------------------------------------------------- power-ups (earned only by remembering)

export function powerUpFor(score: number): PowerUp | null {
  if (score >= RECALL_STRONG) return 'double';
  return score >= RECALL_PASS ? 'refill' : null;
}

export function earnPowerUp(state: MemoryState, score: number): { state: MemoryState; earned: PowerUp | null } {
  const earned = powerUpFor(score);
  if (!earned) return { state, earned: null };
  const powerUps = { ...state.powerUps, [earned]: Math.min(MAX_POWER, state.powerUps[earned] + 1) };
  return { state: { ...state, powerUps }, earned };
}

/** At the start of a bout Blot uses one of each power-up it holds. */
export function spendPowerUps(state: MemoryState): { state: MemoryState; boosts: BoutBoosts; used: PowerUp[] } {
  const used: PowerUp[] = [];
  const boosts: BoutBoosts = {};
  const powerUps = { ...state.powerUps };
  if (powerUps.refill > 0) {
    powerUps.refill--;
    boosts.bonusHp = REFILL_HP;
    used.push('refill');
  }
  if (powerUps.double > 0) {
    powerUps.double--;
    boosts.doubleFirstHit = true;
    used.push('double');
  }
  return { state: { ...state, powerUps }, boosts, used };
}

// ---------------------------------------------------------------- comebacks

export interface ComebackInput {
  monster: { name: string; shape: MonsterShape; color: string; words: readonly string[] };
  topic: string;
  language: Language;
  demoId: string | null;
  ideas: readonly { id: string; name: string; sourceUrl: string | null; sourceTitle: string | null }[];
  exam: ExamResult;
  won: boolean;
  /** Scores from an earlier meeting with this monster (a comeback keeps the best). */
  previous?: readonly { id: string; score: number }[];
}

/**
 * A monster comes back when it got away, or when Blot won on a weak idea (below the pass mark):
 * it returns with that idea a day later. Ideas without a revealed answer cannot come back.
 */
export function planComeback(input: ComebackInput, now: number): Comeback | null {
  const best = (id: string, score: number) => Math.max(score, input.previous?.find((p) => p.id === id)?.score ?? 0);
  const ideas = input.ideas.map((i) => ({ id: i.id, name: i.name, score: best(i.id, input.exam.results.find((r) => r.id === i.id)?.score ?? 0) }));
  const weakest = [...input.exam.results].filter((r) => r.question && r.modelAnswer).sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))[0];
  if (!weakest) return null;
  if (input.won && weakest.score >= RECALL_PASS) return null;
  const idea = input.ideas.find((i) => i.id === weakest.id)!;
  return {
    id: comebackId(input.monster.name),
    monsterName: input.monster.name,
    shape: input.monster.shape,
    color: input.monster.color,
    topic: input.topic,
    words: input.monster.words.slice(0, 160),
    language: input.language,
    demoId: input.demoId,
    ideaId: weakest.id,
    ideaName: idea.name,
    question: weakest.question!,
    keyPoints: weakest.keyPoints ?? [],
    modelAnswer: weakest.modelAnswer!,
    ideas,
    sourceUrl: idea.sourceUrl,
    sourceTitle: idea.sourceTitle,
    createdAt: now,
    dueAt: now + COMEBACK_DAYS * DAY_MS,
    tries: 0,
  };
}

export function comebackId(monsterName: string): string {
  return `m${hashString(monsterName.toLowerCase()).toString(36)}`;
}

/** One comeback per monster (the newest wins); at most MAX_COMEBACKS kept. */
export function upsertComeback(state: MemoryState, comeback: Comeback): MemoryState {
  const others = state.comebacks.filter((c) => c.id !== comeback.id);
  return { ...state, comebacks: [...others, comeback].slice(-MAX_COMEBACKS) };
}

export function dropComeback(state: MemoryState, id: string): MemoryState {
  return { ...state, comebacks: state.comebacks.filter((c) => c.id !== id) };
}

export function dueComebacks(state: MemoryState, now: number): Comeback[] {
  return state.comebacks.filter((c) => c.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt);
}

/** How strong an already-beaten idea counts in a comeback. */
export function lockedScore(previous: number): number {
  return Math.max(previous, COMEBACK_LOCK);
}

/** After a comeback: tamed for good on a win with the weak idea learned; otherwise it returns again. */
export function afterRematch(state: MemoryState, id: string, result: { won: boolean; score: number }, now: number): MemoryState {
  const cb = state.comebacks.find((c) => c.id === id);
  if (!cb) return state;
  if (result.won && result.score >= RECALL_PASS) return { ...dropComeback(state, id), tamed: state.tamed + 1 };
  const ideas = cb.ideas.map((i) => (i.id === cb.ideaId ? { ...i, score: Math.max(i.score, result.score) } : i));
  return upsertComeback(state, { ...cb, ideas, tries: cb.tries + 1, dueAt: now + COMEBACK_DAYS * DAY_MS });
}

// ---------------------------------------------------------------- traits fade with their memory

const DOWN: Record<TraitLook, TraitLook> = { shining: 'solid', solid: 'wobbly', wobbly: 'wobbly', faded: 'faded' };

/** How a trait looks now: as earned while its memory is fresh, a step down while fading, then faded. */
export function traitLookNow(trait: Trait, cards: readonly MemoryCard[], now: number): TraitLook {
  const card = trait.cardId ? cards.find((c) => c.id === trait.cardId) : undefined;
  if (!card) return trait.look;
  const f = freshness(card, now);
  if (f === 'fresh') return trait.look;
  return f === 'fading' ? DOWN[trait.look] : 'faded';
}

export function wornTraits(traits: readonly Trait[], cards: readonly MemoryCard[], now: number, count: number): Trait[] {
  return traits.slice(-count).map((t) => ({ ...t, look: traitLookNow(t, cards, now) }));
}
