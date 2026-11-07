// The round engine: where Blot's replies, live bars and the exam come from.
// DemoEngine answers from a canned round (offline); the server engine talks to /creature, /bars, /examine.
import type { DemoRound, ExamResult, Idea, Language, Move, SealedLesson, TranscriptEntry } from '../../../shared/types.ts';
import { barValue } from '../../../shared/bars.ts';
import { sealLesson } from '../../../shared/lesson.ts';
import { offlineExam, offlineScore, type TeachBelief } from '../../../shared/round.ts';
import { contentWords, stem } from '../../../shared/words.ts';
import { wait } from './anim.ts';

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
  /** Raw score 0..100 before caps (the UI applies shared/bars.ts). */
  raw: number;
  contradictsMisread: boolean;
  /** For a Tell when tap: was it the right situation? */
  whenRight?: boolean;
}

export interface RoundEngine {
  readonly offline: boolean;
  readonly lesson: SealedLesson;
  readonly language: Language;
  readonly seed: number;
  /** Blot's reply, as streamed text chunks. */
  creature(req: CreatureRequest): AsyncIterable<string>;
  /** Live bars for one idea, from everything the player did on it. */
  bars(ideaId: string, transcript: TranscriptEntry[]): Promise<BarsReply>;
  /** The exam, from the player's messages and taps only, plus the misreads Blot still holds. */
  examine(transcript: TranscriptEntry[], heldMisreads: string[]): Promise<ExamResult>;
}

const NEGATION = /\b(not|no|isn't|isnt|doesn't|doesnt|never|ikke|nei|aldri)\b/i;

/** Streams a canned line word by word, like a model would. */
async function* stream(text: string): AsyncIterable<string> {
  const parts = text.split(/(\s+)/);
  for (const part of parts) {
    if (!part) continue;
    yield part;
    if (part.trim()) await wait(28);
  }
}

export class DemoEngine implements RoundEngine {
  readonly offline = true;
  readonly lesson: SealedLesson;
  readonly language: Language;
  readonly seed: number;
  private readonly round: DemoRound;

  constructor(round: DemoRound) {
    this.round = round;
    this.lesson = sealLesson(round.lesson, `demo-${round.id}`);
    this.language = round.lesson.language;
    this.seed = round.seed;
  }

  private idea(id: string): Idea {
    return this.round.lesson.ideas.find((i) => i.id === id)!;
  }

  async *creature(req: CreatureRequest): AsyncIterable<string> {
    const r = this.round.replies[req.ideaId];
    const idea = this.idea(req.ideaId);
    if (!r) return;
    let text: string;
    switch (req.event) {
      case 'when':
        text = idea.whenOptions[req.tap ?? -1]?.right ? r.whenRight : r.whenWrong;
        break;
      case 'check':
        text = req.belief === 'misread' ? idea.misread : r.checkRight;
        break;
      case 'askWhy':
        text = r.whyAsk;
        break;
      case 'fix':
        text = req.belief === 'right' ? r.fixed : r.say;
        break;
      default:
        text = r[req.event];
    }
    await wait(250);
    yield* stream(text);
  }

  async bars(ideaId: string, transcript: TranscriptEntry[]): Promise<BarsReply> {
    const idea = this.idea(ideaId);
    const canned = this.round.bars[ideaId] ?? {};
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
    const contradictsMisread =
      !!last?.text && NEGATION.test(last.text) && (onTopic || lastStems.some((s) => misreadStems.has(s)));
    const whenRight = last?.move === 'when' && typeof last.tap === 'number' ? !!idea.whenOptions[last.tap]?.right : undefined;
    await wait(120);
    return { raw, contradictsMisread, whenRight };
  }

  async examine(transcript: TranscriptEntry[], heldMisreads: string[]): Promise<ExamResult> {
    const values: Record<string, number> = {};
    const beliefs: Record<string, TeachBelief> = {};
    for (const idea of this.round.lesson.ideas) {
      const mine = transcript.filter((e) => e.ideaId === idea.id);
      const moves = mine.map((e) => e.move).filter((m): m is Move => m !== 'same' && m !== 'dontknow');
      const { raw } = await this.bars(idea.id, transcript);
      values[idea.id] = barValue(moves, raw);
      beliefs[idea.id] = heldMisreads.includes(idea.id) ? 'misread' : mine.length ? 'right' : 'none';
    }
    return offlineExam(this.round.lesson.ideas, values, beliefs, this.round.exam);
  }
}

export async function loadDemoRound(id: string): Promise<DemoRound> {
  const res = await fetch(`demo/rounds/${encodeURIComponent(id)}.json`);
  if (!res.ok) throw new Error(`No demo round called "${id}".`);
  return (await res.json()) as DemoRound;
}
