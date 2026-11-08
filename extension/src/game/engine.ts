// The round engine: where Blot's replies, the grades and the exam come from.
// DemoEngine answers from a canned round (offline); ServerEngine talks to the Spark server.
import type { Belief, DemoRound, ExamItem, ExamResult, IdeaGrade, Language, Move, SealedLesson, TranscriptEntry } from '../../../shared/types.ts';
import { barValue } from '../../../shared/bars.ts';
import { sealLesson } from '../../../shared/lesson.ts';
import { demoExam, demoGrade, demoReply, type CreatureRequest } from '../../../shared/demo.ts';
import { wait } from './anim.ts';

export type { CreatureEvent, CreatureRequest } from '../../../shared/demo.ts';

export interface RoundEngine {
  readonly offline: boolean;
  readonly lesson: SealedLesson;
  readonly language: Language;
  readonly seed: number;
  /** Blot's reply, as streamed text chunks. */
  creature(req: CreatureRequest): AsyncIterable<string>;
  /** One idea's grade, from everything the player did on it: the live bar (the exam reuses it). */
  grade(ideaId: string, transcript: TranscriptEntry[]): Promise<IdeaGrade>;
  /** The exam, from the player's messages and taps only, plus the misreads Blot still holds. */
  examine(transcript: TranscriptEntry[], heldMisreads: string[]): Promise<ExamResult>;
}

/** Streams a canned line word by word, like a model would. */
async function* stream(text: string): AsyncIterable<string> {
  for (const part of text.split(/(\s+)/)) {
    if (!part) continue;
    yield part;
    if (part.trim()) await wait(28);
  }
}

const beliefFor = (score: number): Belief => (score < 10 ? 'unknown' : score >= 60 ? 'right' : 'partial');

export class DemoEngine implements RoundEngine {
  readonly offline = true;
  readonly lesson: SealedLesson;
  readonly language: Language;
  readonly seed: number;
  readonly round: DemoRound;

  constructor(round: DemoRound, lesson?: SealedLesson) {
    this.round = round;
    this.lesson = lesson ?? sealLesson(round.lesson, `demo-${round.id}`);
    this.language = round.lesson.language;
    this.seed = round.seed;
  }

  async *creature(req: CreatureRequest): AsyncIterable<string> {
    await wait(250);
    yield* stream(demoReply(this.round, req));
  }

  async grade(ideaId: string, transcript: TranscriptEntry[]): Promise<IdeaGrade> {
    await wait(200);
    return demoGrade(this.round, ideaId, transcript);
  }

  async examine(transcript: TranscriptEntry[], heldMisreads: string[]): Promise<ExamResult> {
    return demoExam(this.round, transcript, heldMisreads);
  }
}

export async function loadDemoRound(id: string): Promise<DemoRound> {
  const res = await fetch(`demo/rounds/${encodeURIComponent(id)}.json`);
  if (!res.ok) throw new Error(`No demo round called "${id}".`);
  return (await res.json()) as DemoRound;
}

/**
 * Offline Blot for a live lesson when the server is gone and no canned round matches (SPEC §13).
 * The sealed lesson has no answers, so Blot plays it safe: it repeats what it was told, and scores
 * come from the moves used and how much was said.
 */
export class OfflineEngine implements RoundEngine {
  readonly offline = true;
  readonly lesson: SealedLesson;
  readonly language: Language;
  readonly seed: number;

  constructor(lesson: SealedLesson, seed: number) {
    this.lesson = lesson;
    this.language = lesson.language;
    this.seed = seed;
  }

  private get nb(): boolean {
    return this.language === 'nb' || this.language === 'nn';
  }

  private name(id: string): string {
    return this.lesson.ideas.find((i) => i.id === id)?.name ?? '';
  }

  async *creature(req: CreatureRequest): AsyncIterable<string> {
    const last = req.transcript.filter((e) => e.text).at(-1)?.text ?? req.text ?? '';
    const quote = last.split(/\s+/).slice(0, 14).join(' ');
    const line: Record<string, string> = this.nb
      ? {
          check: `Du sa: «${quote}…» Stemmer det?`,
          fix: 'Åh, takk for at du rettet meg!',
          askWhy: `Men HVORFOR er «${this.name(req.ideaId)}» sånn?`,
          why: 'Så DET er grunnen! Hele klatten min kribler.',
          example: 'Å, et eksempel! Nå ser jeg det for meg.',
        }
      : {
          check: `You told me: "${quote}…" Right?`,
          fix: 'Ohh, thank you for fixing that!',
          askWhy: `But WHY does "${this.name(req.ideaId)}" work like that?`,
          why: "So THAT's why! My whole blob is tingling.",
          example: 'Ooh, an example! Now I can picture it.',
        };
    await wait(200);
    yield* stream(line[req.event] ?? line.check!);
  }

  /** Without the answers Blot cannot judge correctness, so it is cautious: an explanation is Ready, never Mastered. */
  async grade(ideaId: string, transcript: TranscriptEntry[]): Promise<IdeaGrade> {
    const words = (t?: string) => (t ?? '').split(/\s+/).filter(Boolean).length;
    let score = 0;
    const mine = transcript.filter((x) => x.ideaId === ideaId);
    for (const e of mine) {
      if (e.move === 'say' && words(e.text) >= 4) score = Math.max(score, 45);
      if ((e.move === 'why' || e.move === 'example') && words(e.text) >= 4) score = Math.max(score, 70);
    }
    const said = mine.filter((e) => e.text).at(-1)?.text;
    return {
      id: ideaId,
      score,
      belief: beliefFor(score),
      grounded: score > 0,
      contradictsMisread: false,
      creatureAnswer: said ? said.split(/\s+/).slice(0, 30).join(' ') : this.nb ? 'Jeg... kan ikke denne!' : "I... don't know this one!",
      tip: this.nb ? 'Si hvorfor, med dine egne ord.' : 'Say why, in your own words.',
    };
  }

  async examine(transcript: TranscriptEntry[], heldMisreads: string[]): Promise<ExamResult> {
    const results: ExamItem[] = [];
    for (const idea of this.lesson.ideas) {
      const moves = transcript.filter((e) => e.ideaId === idea.id).map((e) => e.move).filter((m): m is Move => m !== 'same' && m !== 'dontknow');
      const grade = await this.grade(idea.id, transcript);
      const score = barValue(moves, grade.score);
      results.push({ ...grade, score, belief: heldMisreads.includes(idea.id) ? 'wrong' : beliefFor(score), grounded: score > 0 });
    }
    return { results };
  }
}

/**
 * A comeback (SPEC §17): the ideas already beaten stay beaten (locked at their score), and only the
 * weak idea is taught again. Wraps any engine.
 */
export class LockedEngine implements RoundEngine {
  readonly inner: RoundEngine;
  private readonly locks: Readonly<Record<string, number>>;
  constructor(inner: RoundEngine, locks: Readonly<Record<string, number>>) {
    this.inner = inner;
    this.locks = locks;
  }
  get offline() {
    return this.inner.offline;
  }
  get lesson() {
    return this.inner.lesson;
  }
  get language() {
    return this.inner.language;
  }
  get seed() {
    return this.inner.seed;
  }
  creature(req: CreatureRequest): AsyncIterable<string> {
    return this.inner.creature(req);
  }
  grade(ideaId: string, transcript: TranscriptEntry[]): Promise<IdeaGrade> {
    if (ideaId in this.locks) {
      const score = this.locks[ideaId]!;
      return Promise.resolve({ id: ideaId, score, belief: 'right', grounded: true, contradictsMisread: false, creatureAnswer: '', tip: '' });
    }
    return this.inner.grade(ideaId, transcript);
  }
  async examine(transcript: TranscriptEntry[], heldMisreads: string[]): Promise<ExamResult> {
    const exam = await this.inner.examine(transcript, heldMisreads);
    return {
      results: exam.results.map((r) =>
        r.id in this.locks ? { ...r, score: this.locks[r.id]!, belief: 'right', grounded: true, creatureAnswer: r.creatureAnswer || '…' } : r,
      ),
    };
  }
}

/** What a comeback needs to grade its weak idea without the server's lesson (it expired days ago). */
export interface ComebackIdea {
  ideaId: string;
  ideaName: string;
  question: string;
  modelAnswer: string;
  keyPoints: string[];
}

/**
 * A real page's comeback: Blot repeats what it is told (like the offline Blot), and the weak idea is
 * graded against its revealed answer by /recall, or by word overlap when the server is away.
 */
export class ComebackEngine extends OfflineEngine {
  private readonly idea: ComebackIdea;
  private readonly gradeAnswer: (answer: string) => Promise<{ score: number; feedback: string }>;
  constructor(lesson: SealedLesson, seed: number, idea: ComebackIdea, grade: (answer: string) => Promise<{ score: number; feedback: string }>) {
    super(lesson, seed);
    this.idea = idea;
    this.gradeAnswer = grade;
  }
  private taught(transcript: TranscriptEntry[]): string {
    return transcript.filter((e) => e.ideaId === this.idea.ideaId && e.text).map((e) => e.text).join(' ');
  }
  override async grade(ideaId: string, transcript: TranscriptEntry[]): Promise<IdeaGrade> {
    if (ideaId !== this.idea.ideaId) return super.grade(ideaId, transcript);
    const text = this.taught(transcript);
    const graded = text ? await this.gradeAnswer(text) : { score: 0, feedback: '' };
    return {
      id: ideaId,
      score: graded.score,
      belief: beliefFor(graded.score),
      grounded: graded.score > 0,
      contradictsMisread: false,
      creatureAnswer: text ? text.split(/\s+/).slice(0, 30).join(' ') : '',
      tip: graded.feedback,
    };
  }
  override async examine(transcript: TranscriptEntry[], heldMisreads: string[]): Promise<ExamResult> {
    const exam = await super.examine(transcript, heldMisreads);
    const mine = transcript.filter((e) => e.ideaId === this.idea.ideaId);
    const moves = mine.map((e) => e.move).filter((m): m is Move => m !== 'same' && m !== 'dontknow');
    const graded = await this.grade(this.idea.ideaId, transcript);
    const score = barValue(moves, graded.score);
    return {
      results: exam.results.map((r) =>
        r.id === this.idea.ideaId
          ? {
              ...r,
              score,
              grounded: score > 0,
              belief: beliefFor(score),
              tip: graded.tip || r.tip,
              modelAnswer: this.idea.modelAnswer,
              question: this.idea.question,
              keyPoints: this.idea.keyPoints,
            }
          : r,
      ),
    };
  }
}
