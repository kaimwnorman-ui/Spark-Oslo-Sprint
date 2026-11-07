// Insights from the player's own history (SPEC §17): what they struggle with, in plain words and
// with their own numbers, plus the focus that personalises the next round. Pure and tested.
import type { Belief, BoutOutcome, ExamResult, Move, TranscriptEntry } from './types.ts';

/** What the coach adapts to, in priority order. */
export const FOCUS_CODES = ['trust', 'examples', 'why', 'coverage', 'paste'] as const;
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
      action: 'Use Check it, and press ✗ when Blot gets it wrong.',
      detail:
        fooled > 0
          ? `You said ✓ to a wrong explanation ${plural(fooled, 'time')} lately. When Blot explains back, check every word.`
          : `Blot went into the fight with ${plural(held, 'mix-up')} you never caught. Use Check it before you ring the bell.`,
    });
  }

  // examples: the player rarely gives one, and it shows in their scores.
  const ex = moveImpact(recent, 'example');
  if (ex.taught >= 2 && ex.used / ex.taught < 0.4) {
    out.push({
      code: 'examples',
      title: 'Give more examples',
      action: 'Give each idea a real-life example.',
      detail:
        ex.with !== null && ex.without !== null && ex.with > ex.without
          ? `Ideas with an example scored ${ex.with} on average. Without one: ${ex.without}.`
          : `You gave an example for ${ex.used} of the ${ex.taught} ideas you taught. An example lifts an idea's limit from 40 to 100.`,
    });
  }

  // why: the player rarely says why.
  const why = moveImpact(recent, 'why');
  if (why.taught >= 3 && why.used / why.taught < 0.3) {
    out.push({
      code: 'why',
      title: 'Say why',
      action: 'Tell Blot why, not just what.',
      detail:
        why.with !== null && why.without !== null && why.with > why.without
          ? `Ideas where you said why scored ${why.with}. The rest: ${why.without}.`
          : `You said why for ${why.used} of ${why.taught} ideas. The why is what makes an idea stick.`,
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
      action: 'Copied text only counts as Say it.',
      detail: `${plural(pasted, 'message')} lately were the page's own words. Those count as Say it only (limit 30).`,
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
  trust: 'Blot will try to fool you more this time. Use Check it, and press ✗ when it’s wrong.',
  examples: 'Blot will ask you for examples. Real ones score higher.',
  why: 'Blot will ask why sooner. Ideas with a why score higher.',
  coverage: 'Teach all five: an empty idea fizzles in the fight.',
  paste: 'Your own words only: pasted text is capped.',
};
