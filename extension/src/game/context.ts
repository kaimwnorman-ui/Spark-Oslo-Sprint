// Everything one round carries from screen to screen.
import type {
  BoutResult, DemoRound, ExamResult, Lesson, MonsterShape, Move, PageCapture, SealedLesson, TranscriptEntry, Trait,
} from '../../../shared/types.ts';
import type { TeachBelief } from '../../../shared/round.ts';
import type { Earned, Step } from '../../../shared/teach.ts';
import type { BoutBoosts } from '../../../shared/bout.ts';
import type { DuelChallenge } from '../../../shared/duel.ts';
import type { FocusCode, Insight } from '../../../shared/insights.ts';
import type { Comeback, PowerUp } from '../../../shared/memory.ts';
import type { RoundEngine } from './engine.ts';
import type { Lines } from './lines.ts';

export interface IdeaProgress {
  moves: Move[];
  /** The latest grade's raw score (0..100, before the move caps). */
  raw: number;
  /** The bar: the raw score under the move caps (shared/bars.ts). The exam uses the same grade. */
  value: number;
  belief: TeachBelief;
  /** Where the teach-back is for this idea (shared/teach.ts). */
  step: Step;
  /** The time this idea has earned (each kind once). */
  earned: Earned;
  /** The grader's one-line tip on the latest grade. */
  tip?: string;
  /** What Blot said back at the check step (shown again when the player returns to this idea). */
  saidBack?: string;
  /** Blot's why (or example) question for this idea, once asked. */
  blotAsked?: string;
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
  /**
   * The stage round (SPEC §13): some ideas arrive taught for the player. A rehearsal: it records no
   * history or comeback, offers no duel, and only what the player teaches themselves becomes a memory.
   */
  stage: { ideas: string[]; entries: number } | null;
  /** Where this round is kept so a reload can resume it (resume.ts); null for rounds that are not resumable. */
  resumeKey: string | null;
  /** Set when a saved round was resumed: the time left, instead of a fresh teaching timer. */
  resumeRemainingMs: number | null;
  /** Saves the round as it is (called by the teach screen as things change). */
  persist?: (remainingMs: number) => void;
  /** What the loop planned after the round, for the replay. */
  after: { comeback: Comeback | null; tamed: boolean; recallDays: number | null; tip: Insight | null };
}

/** Ideas the player worked on themselves this round: not locked (a comeback), not taught for them (stage). */
export function ownIdeaIds(ctx: Pick<RoundCtx, 'transcript' | 'locked' | 'stage' | 'lesson'>): Set<string> {
  const touched = new Set(ctx.transcript.slice(ctx.stage?.entries ?? 0).map((e) => e.ideaId));
  return new Set(ctx.lesson.ideas.map((i) => i.id).filter((id) => touched.has(id) && !(id in ctx.locked)));
}

/** Ideas that count as done before the player did anything: beaten in an earlier fight, or taught for them. */
export function scriptedIdeaIds(ctx: Pick<RoundCtx, 'locked' | 'stage'>): Set<string> {
  return new Set([...Object.keys(ctx.locked), ...(ctx.stage?.ideas ?? [])]);
}

export function newProgress(lesson: SealedLesson): Record<string, IdeaProgress> {
  return Object.fromEntries(
    lesson.ideas.map((i) => [i.id, { moves: [], raw: 0, value: 0, belief: 'none', step: 'explain', earned: {} } satisfies IdeaProgress]),
  );
}
