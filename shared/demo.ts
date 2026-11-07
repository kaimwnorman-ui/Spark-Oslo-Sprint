// Canned-round logic: how a demo round (demo/rounds/*.json) answers without any AI.
// Used by the game's demo mode, the server's AI_STUB routes and the offline fallback.
import type { BarValue, DemoRound, ExamResult, Idea, Move, TranscriptEntry } from './types.ts';
import { barValue } from './bars.ts';
import { offlineExam, offlineScore, type TeachBelief } from './round.ts';
import { contentWords, stem } from './words.ts';

export type CreatureEvent = 'say' | 'example' | 'why' | 'fix' | 'when' | 'check' | 'askWhy';

export interface CreatureRequest {
  ideaId: string;
  event: CreatureEvent;
  text?: string;
  tap?: number;
  /** Blot's belief about this idea when it replies. */
  belief: TeachBelief;
  /** Everything the player said about this idea so far (for "check": Blot explains it back). */
  transcript: TranscriptEntry[];
}

export interface BarsReply {
  /** Raw score 0..100 before caps (the game applies shared/bars.ts). */
  raw: number;
  contradictsMisread: boolean;
  /** For a Tell when tap: was it the right situation? */
  whenRight?: boolean;
}

const NEGATION = /\b(not|no|isn't|isnt|doesn't|doesnt|never|ikke|nei|aldri)\b/i;

function ideaOf(round: DemoRound, id: string): Idea | undefined {
  return round.lesson.ideas.find((i) => i.id === id);
}

export function demoReply(round: DemoRound, req: CreatureRequest): string {
  const r = round.replies[req.ideaId];
  const idea = ideaOf(round, req.ideaId);
  if (!r || !idea) return '';
  switch (req.event) {
    case 'when':
      return idea.whenOptions[req.tap ?? -1]?.right ? r.whenRight : r.whenWrong;
    case 'check':
      return req.belief === 'misread' ? idea.misread : r.checkRight;
    case 'askWhy':
      return r.whyAsk;
    case 'fix':
      return req.belief === 'right' ? r.fixed : r.say;
    default:
      return r[req.event];
  }
}

export function demoBars(round: DemoRound, ideaId: string, transcript: TranscriptEntry[]): BarsReply {
  const idea = ideaOf(round, ideaId);
  if (!idea) return { raw: 0, contradictsMisread: false };
  const canned = round.bars[ideaId] ?? {};
  const mine = transcript.filter((e) => e.ideaId === ideaId);
  let raw = 0;
  for (const e of mine) {
    if (e.text && (e.move === 'say' || e.move === 'example' || e.move === 'why')) {
      raw = Math.max(raw, offlineScore(idea, e.text, canned[e.move] ?? 30));
    } else if (e.move === 'when' && typeof e.tap === 'number') {
      raw = Math.max(raw, idea.whenOptions[e.tap]?.right ? (canned.when ?? 40) : 8);
    } else if (e.move === 'check' && e.tap === 'yes') {
      raw = Math.max(raw, canned.check ?? 40);
    }
  }
  const last = mine.at(-1);
  const misreadStems = new Set(contentWords(idea.misread).map(stem));
  const lastStems = contentWords(last?.text ?? '').map(stem);
  const onTopic = last?.text ? offlineScore(idea, last.text, 100) >= 60 : false;
  const contradictsMisread = !!last?.text && NEGATION.test(last.text) && (onTopic || lastStems.some((s) => misreadStems.has(s)));
  const whenRight = last?.move === 'when' && typeof last.tap === 'number' ? !!idea.whenOptions[last.tap]?.right : undefined;
  return { raw, contradictsMisread, whenRight };
}

/** All five bars (the live-bars shape, SPEC §12.2). */
export function demoAllBars(round: DemoRound, transcript: TranscriptEntry[]): BarValue[] {
  return round.lesson.ideas.map((i) => {
    const b = demoBars(round, i.id, transcript);
    return { id: i.id, value: b.raw, contradictsMisread: b.contradictsMisread };
  });
}

export function demoExam(round: DemoRound, transcript: TranscriptEntry[], heldMisreads: string[]): ExamResult {
  const values: Record<string, number> = {};
  const beliefs: Record<string, TeachBelief> = {};
  for (const idea of round.lesson.ideas) {
    const mine = transcript.filter((e) => e.ideaId === idea.id);
    const moves = mine.map((e) => e.move).filter((m): m is Move => m !== 'same' && m !== 'dontknow');
    values[idea.id] = barValue(moves, demoBars(round, idea.id, transcript).raw);
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
