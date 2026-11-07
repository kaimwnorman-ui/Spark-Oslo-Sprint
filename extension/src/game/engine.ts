// The round engine: where Blot's replies, live bars and the exam come from.
// DemoEngine answers from a canned round (offline); ServerEngine talks to the Spark server.
import type { DemoRound, ExamResult, Language, SealedLesson, TranscriptEntry } from '../../../shared/types.ts';
import { sealLesson } from '../../../shared/lesson.ts';
import { demoBars, demoExam, demoReply, type BarsReply, type CreatureRequest } from '../../../shared/demo.ts';
import { wait } from './anim.ts';

export type { BarsReply, CreatureEvent, CreatureRequest } from '../../../shared/demo.ts';

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

/** Streams a canned line word by word, like a model would. */
async function* stream(text: string): AsyncIterable<string> {
  for (const part of text.split(/(\s+)/)) {
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

  async bars(ideaId: string, transcript: TranscriptEntry[]): Promise<BarsReply> {
    await wait(120);
    return demoBars(this.round, ideaId, transcript);
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
