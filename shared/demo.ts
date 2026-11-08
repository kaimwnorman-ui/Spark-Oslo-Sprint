// Canned-round logic: how a demo round (demo/rounds/*.json) answers without any AI.
// Used by the game's demo mode, the server's AI_STUB routes and the offline fallback.
import type { Belief, DemoRound, ExamResult, Idea, IdeaGrade, Move, TranscriptEntry } from './types.ts';
import { barValue } from './bars.ts';
import { offlineExam, offlineScore, type TeachBelief } from './round.ts';
import { contentWords, stem } from './words.ts';

/**
 * What Blot is asked to say (SPEC §7). "check" is the teach-back after the player explains an idea (Blot says
 * what it understood and asks "Right?"); "fix" answers a correction; "askWhy" is Blot's "but WHY?" question;
 * "why" and "example" answer the player's reason or example.
 */
export type CreatureEvent = 'check' | 'fix' | 'askWhy' | 'why' | 'example';
export const CREATURE_EVENTS: readonly CreatureEvent[] = ['check', 'fix', 'askWhy', 'why', 'example'];

export interface CreatureRequest {
  ideaId: string;
  event: CreatureEvent;
  text?: string;
  /** Blot's belief about this idea when it replies. */
  belief: TeachBelief;
  /** Everything the player said about this idea so far (Blot explains it back from these). */
  transcript: TranscriptEntry[];
}

const NEGATION = /\b(not|no|isn't|isnt|doesn't|doesnt|never|ikke|nei|aldri)\b/i;

function ideaOf(round: DemoRound, id: string): Idea | undefined {
  return round.lesson.ideas.find((i) => i.id === id);
}

/** True when a message is about the idea (its words overlap the idea's own), for the canned Blot's reactions. */
function onTopic(idea: Idea, text: string): boolean {
  return offlineScore(idea, text, 100) >= 60;
}

/** The player's own words, cut short, for a canned Blot that did not follow. */
function quote(text: string, words = 12): string {
  const all = text.trim().split(/\s+/).filter(Boolean);
  return all.slice(0, words).join(' ').replace(/[.!?…]+$/, '') + (all.length > words ? '…' : '');
}

export function demoReply(round: DemoRound, req: CreatureRequest): string {
  const r = round.replies[req.ideaId];
  const idea = ideaOf(round, req.ideaId);
  if (!r || !idea) return '';
  const nb = round.lesson.language === 'nb' || round.lesson.language === 'nn';
  const said = req.transcript.filter((e) => e.text).at(-1)?.text ?? req.text ?? '';
  // A canned Blot only has lines for messages about the idea: anything else, it repeats back, puzzled.
  const lost = said && !onTopic(idea, said);
  switch (req.event) {
    case 'check':
      // The mix-up is said back as if it were what the player meant (SPEC §7 rule 3).
      if (req.belief === 'misread') return `${idea.misread} ${nb ? 'Ikke sant?' : 'Right?'}`;
      if (lost) return nb ? `Så… «${quote(said)}»? Er det det?` : `So… “${quote(said)}”? Is that it?`;
      return r.checkRight;
    case 'fix':
      if (lost) return nb ? `Hm… «${quote(said)}». Jeg prøver å skjønne det!` : `Hmm… “${quote(said)}”. I'm trying to get it!`;
      // The canned "fixed" line answers the mix-up; any other correction gets Blot's plain say-back.
      return req.belief === 'misread' ? r.fixed : r.say;
    case 'askWhy':
      return r.whyAsk;
    case 'why':
      if (lost) return nb ? 'Hm, jeg ser ikke helt hvorfor ennå, men jeg skriver det ned!' : "Hmm, I don't quite see the why yet, but I'm writing it down!";
      return r.why;
    case 'example':
      if (lost) return nb ? 'Hm, jeg skjønner ikke helt eksempelet, men takk!' : "Hmm, I don't quite get that example, but thanks!";
      return r.example;
    default:
      return '';
  }
}

/** A canned round's raw score for one idea, before the move caps. */
function demoRaw(round: DemoRound, idea: Idea, transcript: TranscriptEntry[]): { raw: number; contradictsMisread: boolean } {
  const canned = round.bars[idea.id] ?? {};
  const mine = transcript.filter((e) => e.ideaId === idea.id);
  let raw = 0;
  for (const e of mine) {
    if (e.text && (e.move === 'say' || e.move === 'example' || e.move === 'why')) {
      raw = Math.max(raw, offlineScore(idea, e.text, canned[e.move] ?? 30));
    } else if (e.move === 'when' && typeof e.tap === 'number') {
      raw = Math.max(raw, idea.whenOptions[e.tap]?.right ? (canned.when ?? 40) : 8);
    }
  }
  const last = mine.filter((e) => e.text).at(-1);
  const misreadStems = new Set(contentWords(idea.misread).map(stem));
  const lastStems = contentWords(last?.text ?? '').map(stem);
  const contradictsMisread = !!last?.text && NEGATION.test(last.text) && (onTopic(idea, last.text) || lastStems.some((s) => misreadStems.has(s)));
  return { raw, contradictsMisread };
}

function beliefFor(score: number): Belief {
  if (score < 10) return 'unknown';
  return score >= 60 ? 'right' : 'partial';
}

/** One idea's grade from a canned round (the same shape the live grader returns). */
export function demoGrade(round: DemoRound, ideaId: string, transcript: TranscriptEntry[]): IdeaGrade {
  const idea = ideaOf(round, ideaId);
  if (!idea) return { id: ideaId, score: 0, belief: 'unknown', grounded: false, contradictsMisread: false, creatureAnswer: '', tip: '' };
  const { raw, contradictsMisread } = demoRaw(round, idea, transcript);
  const belief = beliefFor(raw);
  const c = round.exam[ideaId];
  return {
    id: ideaId,
    score: raw,
    belief,
    grounded: raw >= 10,
    contradictsMisread,
    creatureAnswer: (belief === 'unknown' ? c?.unknown : belief === 'right' ? c?.right : c?.partial) ?? '',
    tip: c?.tip ?? '',
  };
}

/**
 * The scripted player of a canned round (smoke tests, rehearsals, the stage round): the teach-back on each idea, as a
 * careful player does it. Explain; ✓ Blot's say-back, or ✗ when Blot mixed it up and then put it right; answer the why.
 */
export function scriptedPlayer(round: Pick<DemoRound, 'lesson' | 'lines'>, ideaIds: readonly string[], misreads: readonly string[]): TranscriptEntry[] {
  return ideaIds.flatMap((id): TranscriptEntry[] => {
    const idea = ideaOf(round as DemoRound, id);
    const l = round.lines?.[id];
    if (!idea || !l) return [];
    const deep = idea.keyPoints.length >= 2 ? 'why' : 'example';
    return [
      { ideaId: id, move: 'say', text: l.say },
      ...(misreads.includes(id)
        ? ([{ ideaId: id, move: 'check', tap: 'no', caught: true }, { ideaId: id, move: 'say', text: l.fix }] satisfies TranscriptEntry[])
        : ([{ ideaId: id, move: 'check', tap: 'yes' }] satisfies TranscriptEntry[])),
      { ideaId: id, move: deep, text: deep === 'why' ? l.why : l.example },
    ];
  });
}

export function demoExam(round: DemoRound, transcript: TranscriptEntry[], heldMisreads: string[]): ExamResult {
  const values: Record<string, number> = {};
  const beliefs: Record<string, TeachBelief> = {};
  for (const idea of round.lesson.ideas) {
    const mine = transcript.filter((e) => e.ideaId === idea.id);
    const moves = mine.map((e) => e.move).filter((m): m is Move => m !== 'same' && m !== 'dontknow');
    values[idea.id] = barValue(moves, demoRaw(round, idea, transcript).raw);
    beliefs[idea.id] = heldMisreads.includes(idea.id) ? 'misread' : mine.length ? 'right' : 'none';
  }
  const exam = offlineExam(round.lesson.ideas, values, beliefs, round.exam);
  // After teaching, each idea's answer is revealed (replay, flashbacks, comebacks).
  return {
    results: exam.results.map((r) => {
      const idea = ideaOf(round, r.id);
      return { ...r, modelAnswer: idea?.modelAnswer, question: idea?.question, keyPoints: idea?.keyPoints };
    }),
  };
}
