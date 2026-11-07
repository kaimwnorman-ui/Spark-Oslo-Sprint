// Spark's data shapes. Shared by the extension, the server and the tools.

export const MONSTER_SHAPES = ['serpent', 'golem', 'bird', 'spider', 'crab'] as const;
export type MonsterShape = (typeof MONSTER_SHAPES)[number];

export const LANGUAGES = ['en', 'nb', 'nn', 'other'] as const;
export type Language = (typeof LANGUAGES)[number];

export const BELIEFS = ['right', 'partial', 'wrong', 'unknown'] as const;
/** What Blot believes about an idea at the end of teaching (SPEC §8). */
export type Belief = (typeof BELIEFS)[number];

/** The five teaching moves (SPEC §7). */
export const MOVES = ['say', 'example', 'when', 'check', 'why'] as const;
export type Move = (typeof MOVES)[number];

// ---------------------------------------------------------------- the lesson

export interface WhenOption {
  text: string;
  right: boolean;
}

/** One key idea, as the extractor writes it (SPEC §12.1). Server-side only. */
export interface Idea {
  id: string;
  name: string;
  question: string;
  modelAnswer: string;
  keyPoints: string[];
  whenOptions: WhenOption[];
  misread: string;
  sourceUrl: string | null;
  sourceTitle: string | null;
}

/** The extractor's full output. The answers stay on the server (and in demo/ fixtures). */
export interface Lesson {
  topic: string;
  monsterName: string;
  monsterShape: MonsterShape;
  language: Language;
  ideas: Idea[];
  words: string[];
}

/** An idea with the answers stripped: what the extension gets (SPEC §12.4). */
export interface SealedIdea {
  id: string;
  name: string;
  whenOptions: { text: string }[];
  /** True when Blot may ask "but WHY?" (the idea has two or more key points). */
  asksWhy: boolean;
  sourceUrl: string | null;
  sourceTitle: string | null;
}

export interface SealedLesson {
  lessonId: string;
  topic: string;
  monsterName: string;
  monsterShape: MonsterShape;
  language: Language;
  ideas: SealedIdea[];
  words: string[];
}

// ---------------------------------------------------------------- the page

export interface PageLink {
  text: string;
  href: string;
}

/** A word's box on screen when the player clicked, for the lift-off animation. */
export interface WordBox {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** CSS pixels. */
  size: number;
  /** The page's font family and weight for this word, for the lift-off. */
  font?: string;
  weight?: number;
}

/** What the background stores for the game tab (chrome.storage.session, key round:<id>). */
export interface RoundHandoff {
  capture: PageCapture;
  lesson: SealedLesson;
  seed: number;
  /** True when the server answered from a canned round (AI_STUB or no key). */
  offline: boolean;
  roundId: string | null;
  server: string;
}

export interface PageCapture {
  source: 'page' | 'selection' | 'demo';
  url: string;
  title: string;
  text: string;
  links: PageLink[];
  boxes: WordBox[];
  viewport: { w: number; h: number };
}

// ---------------------------------------------------------------- teaching

/** One thing the player did, as the examiner sees it (never Blot's replies). */
export interface TranscriptEntry {
  ideaId: string;
  move: Move | 'same' | 'dontknow';
  /** Typed text (say, example, why, or the answer after "then what is it?"). */
  text?: string;
  /** Tapped option index (when) or answer (check, same). */
  tap?: number | 'yes' | 'no';
  /** Client-only notes for the player's insights (never sent to the AI). */
  pasted?: boolean;
  /** ✓ on an explanation Blot had wrong. */
  fooled?: boolean;
  /** ✗ that caught Blot holding a misreading. */
  caught?: boolean;
}

/**
 * What an on-device Blot may ask the server (POST /reveal): only facts the game shows the player
 * at that moment anyway. Whether a "when" tap was the right one (the button turns green or red),
 * and the misreading Blot holds on an idea (Check it says it aloud). Never a model answer.
 */
export type RevealAsk = { kind: 'when'; tap: number } | { kind: 'misread' };
export interface RevealReply {
  /** kind "when": was that the right situation? */
  right?: boolean;
  /** kind "misread": Blot's wrong belief, or null when Blot holds no misreading on this idea. */
  misread?: string | null;
}

export interface BarValue {
  id: string;
  value: number;
  contradictsMisread: boolean;
}

/** Live bars output (SPEC §12.2). */
export interface BarsResult {
  bars: BarValue[];
}

export interface ExamItem {
  id: string;
  score: number;
  grounded: boolean;
  belief: Belief;
  /** In Blot's words, at most 40 words. */
  creatureAnswer: string;
  tip: string;
  /** Revealed only after teaching, for the replay's "stronger" column. */
  modelAnswer?: string;
  /** The hidden question, revealed after teaching (Blot asks it again later). */
  question?: string;
  /** Revealed after teaching, for grading later recalls offline. */
  keyPoints?: string[];
}

/** Examiner output (SPEC §12.3). */
export interface ExamResult {
  results: ExamItem[];
}

// ---------------------------------------------------------------- the bout

export interface BoutIdea {
  id: string;
  name: string;
  score: number;
  belief: Belief;
}

export type BoutOutcome = 'win' | 'lose' | 'draw';

export interface BoutExchange {
  ideaId: string;
  name: string;
  kind: 'hit' | 'backfire' | 'fizzle';
  /** Damage Blot deals to the monster. */
  dealt: number;
  /** Damage the monster deals to Blot. */
  taken: number;
  blotHp: number;
  monsterHp: number;
  suddenDeath: boolean;
  /** A Double ink power-up doubled this hit. */
  doubled?: boolean;
}

export interface BoutResult {
  exchanges: BoutExchange[];
  outcome: BoutOutcome;
  /** True when one side reached 0 HP (otherwise decided on HP left). */
  knockout: boolean;
  blotHp: number;
  monsterHp: number;
  /** Blot's starting HP (100, more with an Ink refill). */
  startHp: number;
}

// ---------------------------------------------------------------- traits

export type TraitKind = 'horn' | 'fin' | 'tail' | 'spikes';
/** How a trait looks. 'faded' is only ever shown, never stored: a memory nobody refreshed (shared/memory.ts). */
export type TraitLook = 'wobbly' | 'solid' | 'shining' | 'faded';

export interface Trait {
  kind: TraitKind;
  look: TraitLook;
  /** The inherited idea's key word, written on the trait. */
  word: string;
  /** The monster's ink colour. */
  color: string;
  monsterName: string;
  ideaName: string;
  score: number;
  at: number;
  /** The memory card this trait belongs to: its look fades with the card (shared/memory.ts). */
  cardId?: string;
}

// ---------------------------------------------------------------- demo rounds (demo/rounds/*.json)

/** Blot's scripted lines for one idea in a canned round. */
export interface DemoReplies {
  say: string;
  example: string;
  whenRight: string;
  whenWrong: string;
  checkRight: string;
  why: string;
  whyAsk: string;
  fixed: string;
}

export interface DemoRound {
  id: string;
  title: string;
  /** Path of the demo page, relative to the extension root. */
  page: string;
  seed: number;
  lesson: Lesson;
  replies: Record<string, DemoReplies>;
  /** Raw scores a good message of each move reaches, per idea. */
  bars: Record<string, Partial<Record<Move, number>>>;
  /** The examiner's words per belief, per idea. */
  exam: Record<string, { right: string; partial: string; unknown: string; tip: string }>;
  /** The scripted player (smoke test, presenter autoplay). */
  script: TranscriptEntry[];
  /** The scripted player's lines per idea (baked rounds). */
  lines?: Record<string, { say: string; example: string; why: string; fix: string }>;
  /** Stage round: ideas already taught when the round starts. */
  pretaught?: TranscriptEntry[];
}
