// Everything one round carries from screen to screen.
import type {
  BoutResult, DemoRound, ExamResult, Lesson, MonsterShape, Move, PageCapture, SealedLesson, TranscriptEntry, Trait,
} from '../../../shared/types.ts';
import type { TeachBelief } from '../../../shared/round.ts';
import type { BoutBoosts } from '../../../shared/bout.ts';
import type { DuelChallenge } from '../../../shared/duel.ts';
import type { FocusCode, Insight } from '../../../shared/insights.ts';
import type { Comeback, PowerUp } from '../../../shared/memory.ts';
import type { RoundEngine } from './engine.ts';
import type { Lines } from './lines.ts';

export interface IdeaProgress {
  moves: Move[];
  raw: number;
  value: number;
  belief: TeachBelief;
  said: boolean;
  asked: boolean;
  askedWhen?: boolean;
  askedExample?: boolean;
}

/** A normal round, a monster's comeback, or a duel against a friend's Blot (SPEC §17). */
export type RoundKind = 'round' | 'comeback' | 'duel';

export interface RoundCtx {
  kind: RoundKind;
  engine: RoundEngine;
  lines: Lines;
  lesson: SealedLesson;
  /** The full lesson (demo mode only) for the replay's "stronger" column. */
  fullLesson: Lesson | null;
  demo: DemoRound | null;
  /** Demo page URL shown before the transformation (demo mode). */
  pageSrc: string | null;
  capture: PageCapture | null;
  /** The page's text, for paste detection. */
  pageText: string;
  monster: { name: string; shape: MonsterShape; color: string; words: string[] };
  traits: Trait[];
  firstRound: boolean;
  teachSeconds: number;
  misreads: string[];
  transcript: TranscriptEntry[];
  progress: Record<string, IdeaProgress>;
  exam: ExamResult | null;
  provisional: boolean;
  bout: BoutResult | null;
  trait: Trait | null;
  /** 1 for the first bout, 2+ for rematches. */
  attempt: number;
  /** Idea to start on (rematch). */
  focus: string | null;
  onHome: () => void;
  onPlayAgain: () => void;
  /** Called when the server fails mid-round (M7: switch to offline mode). */
  onEngineError?: (err: unknown) => void;
  /** The demo round's id (demo pages), for duel links and comebacks. */
  demoId: string | null;
  /** The coach's focus for this round, from the player's own history. */
  coach: FocusCode[];
  /** Comeback: the ideas already beaten, with the score each counts for (not teachable). */
  locked: Record<string, number>;
  comeback: Comeback | null;
  /** Duel: the friend's Blot, and how the duel ended. */
  duel: DuelChallenge | null;
  duelOutcome: BoutResult['outcome'] | null;
  /** Power-ups Blot uses in the coming bout. */
  boosts: BoutBoosts;
  boostsUsed: PowerUp[];
  /** Each taught idea's memory card (set after the exam). */
  cardIds: Record<string, string>;
  /** What the loop planned after the round, for the replay. */
  after: { comeback: Comeback | null; tamed: boolean; recallDays: number | null; tip: Insight | null };
}

export function newProgress(lesson: SealedLesson): Record<string, IdeaProgress> {
  return Object.fromEntries(
    lesson.ideas.map((i) => [i.id, { moves: [], raw: 0, value: 0, belief: 'none', said: false, asked: false } satisfies IdeaProgress]),
  );
}
