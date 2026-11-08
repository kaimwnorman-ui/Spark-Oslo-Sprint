// Insights from the player's own history (SPEC §17): what they struggle with, in plain words and
// with their own numbers, plus the focus that personalises the next round. Pure and tested.
import { RETAIN_DAYS } from './config.ts';
import type { Belief, BoutOutcome, ExamResult, Move, TranscriptEntry } from './types.ts';

/** What the coach adapts to, in priority order. */
export const FOCUS_CODES = ['trust', 'why', 'coverage', 'paste'] as const;
export type FocusCode = (typeof FOCUS_CODES)[number];

/** Rounds the insights look at. */
export const RECENT_ROUNDS = 5;
export const MAX_HISTORY = 40;

export interface IdeaSummary {
  id: string;
  name: string;
  score: number;
  belief: Belief;
  moves: Move[];
}

/** One finished round, as kept in local storage (no page text, no messages). */
export interface RoundSummary {
  at: number;
  topic: string;
  monsterName: string;
  outcome: BoutOutcome;
  ideas: IdeaSummary[];
  /** ✓ on an explanation Blot had wrong. */
  fooled: number;
  /** ✗ that caught Blot holding a misreading. */
  caught: number;
  /** Typed messages that were mostly the page's own words. */
  pasted: number;
  typed: number;
  kind: 'round' | 'comeback' | 'duel';
}

export interface SummaryInput {
  at: number;
  topic: string;
  monsterName: string;
  outcome: BoutOutcome;
  ideas: readonly { id: string; name: string }[];
  transcript: readonly TranscriptEntry[];
  exam: ExamResult;
  kind?: RoundSummary['kind'];
}

export function summarizeRound(input: SummaryInput): RoundSummary {
  const t = input.transcript;
  return {
    at: input.at,
    topic: input.topic,
    monsterName: input.monsterName,
    outcome: input.outcome,
    ideas: input.ideas.map((i) => {
      const r = input.exam.results.find((x) => x.id === i.id);
      const moves = t.filter((e) => e.ideaId === i.id).map((e) => e.move).filter((m): m is Move => m !== 'same' && m !== 'dontknow');
      return { id: i.id, name: i.name, score: r?.score ?? 0, belief: r?.belief ?? 'unknown', moves };
    }),
    fooled: t.filter((e) => e.fooled).length,
    caught: t.filter((e) => e.caught).length,
    pasted: t.filter((e) => e.pasted).length,
    typed: t.filter((e) => e.text).length,
    kind: input.kind ?? 'round',
  };
}

export function addRound(history: readonly RoundSummary[], round: RoundSummary): RoundSummary[] {
  return [...history, round].slice(-MAX_HISTORY);
}

/** Rounds older than RETAIN_DAYS are forgotten. Pass the real clock, not a simulated one. */
export function pruneHistory(history: readonly RoundSummary[], now: number, days: number = RETAIN_DAYS): RoundSummary[] {
  return history.filter((r) => r.at >= now - days * 86_400_000);
}

// ---------------------------------------------------------------- numbers

const taughtIdeas = (rounds: readonly RoundSummary[]) => rounds.flatMap((r) => r.ideas.filter((i) => i.moves.length > 0));
const avg = (xs: readonly number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export interface Stats {
  rounds: number;
  wins: number;
  /** Average exam score of the ideas the player taught. */
  average: number | null;
  best: { name: string; score: number; monsterName: string } | null;
}

export function stats(history: readonly RoundSummary[]): Stats {
  const all = history.flatMap((r) => r.ideas.filter((i) => i.moves.length).map((i) => ({ ...i, monsterName: r.monsterName })));
  const best = [...all].sort((a, b) => b.score - a.score)[0];
  return {
    rounds: history.length,
    wins: history.filter((r) => r.outcome === 'win').length,
    average: avg(all.map((i) => i.score)),
    best: best ? { name: best.name, score: best.score, monsterName: best.monsterName } : null,
  };
}

/** Average score of taught ideas with and without a move: the player's own evidence. */
export function moveImpact(rounds: readonly RoundSummary[], move: Move): { with: number | null; without: number | null; used: number; taught: number } {
  const taught = taughtIdeas(rounds);
  const withMove = taught.filter((i) => i.moves.includes(move));
  return {
    with: avg(withMove.map((i) => i.score)),
    without: avg(taught.filter((i) => !i.moves.includes(move)).map((i) => i.score)),
    used: withMove.length,
    taught: taught.length,
  };
}

/** Like moveImpact, for Blot's third question: ideas where the player answered why or gave an example. */
export function deepImpact(rounds: readonly RoundSummary[]): { with: number | null; without: number | null; used: number; taught: number } {
  const taught = taughtIdeas(rounds);
  const deep = (i: (typeof taught)[number]) => i.moves.includes('why') || i.moves.includes('example');
  return {
    with: avg(taught.filter(deep).map((i) => i.score)),
    without: avg(taught.filter((i) => !deep(i)).map((i) => i.score)),
    used: taught.filter(deep).length,
    taught: taught.length,
  };
}

// ---------------------------------------------------------------- insights

export interface Insight {
  code: FocusCode | 'praise';
  title: string;
  /** The evidence, in the player's own numbers (Your Blot). */
  detail: string;
  /** One short thing to do next time (the replay's one line). */
  action: string;
}

/** Up to three insights from the last rounds: tips first (in FOCUS_CODES order), then praise. */
export function insights(history: readonly RoundSummary[]): Insight[] {
  const recent = history.slice(-RECENT_ROUNDS);
  if (!recent.length) return [];
  const out: Insight[] = [];
  const taught = taughtIdeas(recent);
  const sum = (f: (r: RoundSummary) => number) => recent.reduce((a, r) => a + f(r), 0);
  const fooled = sum((r) => r.fooled);
  const caught = sum((r) => r.caught);
  const held = sum((r) => r.ideas.filter((i) => i.belief === 'wrong').length);
  const pasted = sum((r) => r.pasted);
  const typed = sum((r) => r.typed);
  const untaught = sum((r) => r.ideas.filter((i) => !i.moves.length).length);
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const lastFights = recent.length === 1 ? 'your last fight' : `your last ${recent.length} fights`;

  // trust: the player let Blot keep a misreading.
  const slips = fooled + held;
  if (slips > 0 && slips >= caught) {
    out.push({
      code: 'trust',
      title: 'Blot fooled you',
      action: 'Read what Blot says back, and press ✗ when it’s wrong.',
      detail:
        fooled > 0
          ? `You said ✓ to a wrong explanation ${plural(fooled, 'time')} lately. When Blot says an idea back, check every word.`
          : `Blot went into the fight with ${plural(held, 'mix-up')} you never caught. Read every word Blot says back.`,
    });
  }

  // why: the player rarely answers Blot's third question (why, or an example), and it shows in their scores.
  const ex = moveImpact(recent, 'example');
  const deep = deepImpact(recent);
  if (deep.taught >= 3 && deep.used / deep.taught < 0.5) {
    out.push({
      code: 'why',
      title: 'Answer Blot’s why',
      action: 'Answer Blot’s “but why?” on every idea.',
      detail:
        deep.with !== null && deep.without !== null && deep.with > deep.without
          ? `Ideas where you answered why scored ${deep.with} on average. The rest: ${deep.without}.`
          : `You answered Blot’s why on ${deep.used} of ${deep.taught} ideas. The why is what lifts an idea from Ready to Mastered.`,
    });
  }

  // coverage: ideas left empty fizzle in the fight.
  if (untaught / recent.length >= 2) {
    out.push({
      code: 'coverage',
      title: 'Teach all five',
      action: 'A sentence on every idea beats a speech on one.',
      detail: `${plural(untaught, 'idea')} went into ${lastFights} untaught, and each one fizzled. A sentence each beats a speech on one.`,
    });
  }

  // paste: copying the page is capped.
  if (pasted >= 2 || (typed >= 3 && pasted / typed >= 0.3)) {
    out.push({
      code: 'paste',
      title: 'Use your own words',
      action: 'Copied text is capped: say it your way.',
      detail: `${plural(pasted, 'message')} lately were the page's own words. Copied text is capped at 30.`,
    });
  }

  // Praise fills the rest: what is going well, in the player's numbers.
  const praise: Insight[] = [];
  const say = (title: string, detail: string) => praise.push({ code: 'praise', title, detail, action: detail });
  if (caught > 0) say('Sharp eye', `You caught Blot's mix-ups ${plural(caught, 'time')}. Blot can't fool you.`);
  const best = [...taught].sort((a, b) => b.score - a.score)[0];
  if (best && best.score >= 60) say('Your strongest idea', `“${best.name}”: ${best.score}. Teach the others like that one.`);
  const wins = recent.filter((r) => r.outcome === 'win').length;
  if (wins >= 2) say('On a roll', `${wins} wins in ${lastFights}.`);
  if (ex.taught >= 2 && ex.used / ex.taught >= 0.6) say('Great examples', `You gave an example for ${ex.used} of ${ex.taught} ideas.`);

  return [...out, ...praise].slice(0, 3);
}

/** The coach's focus for the next round: the top two tips. */
export function focusCodes(history: readonly RoundSummary[]): FocusCode[] {
  return insights(history)
    .map((i) => i.code)
    .filter((c): c is FocusCode => c !== 'praise')
    .slice(0, 2);
}

/** What the coach changes, said to the player once at the start of teaching. */
export const COACH_NOTES: Record<FocusCode, string> = {
  trust: 'Blot will try to fool you more this time. Read what it says back, and press ✗ when it’s wrong.',
  why: 'Answer Blot’s “but why?” on every idea: that is how Blot masters it.',
  coverage: 'Teach all five: an empty idea fizzles in the fight.',
  paste: 'Your own words only: pasted text is capped.',
};
