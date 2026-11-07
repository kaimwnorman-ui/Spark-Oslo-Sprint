// The round engine: where Blot's replies, live bars and the exam come from.
// DemoEngine answers from a canned round (offline); ServerEngine talks to the Spark server.
import type { DemoRound, ExamItem, ExamResult, Language, Move, SealedLesson, TranscriptEntry } from '../../../shared/types.ts';
import { barValue } from '../../../shared/bars.ts';
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

  private name(id: string): string {
    return this.lesson.ideas.find((i) => i.id === id)?.name ?? '';
  }

  async *creature(req: CreatureRequest): AsyncIterable<string> {
    const nb = this.language === 'nb' || this.language === 'nn';
    const last = req.transcript.filter((e) => e.text).at(-1)?.text ?? req.text ?? '';
    const quote = last.split(/\s+/).slice(0, 14).join(' ');
    const line: Record<string, string> = nb
      ? {
          say: `Skjønner! «${quote}…» Det skriver jeg på dryppen min.`,
          example: 'Å, et eksempel! Nå ser jeg det for meg.',
          why: 'Så DET er grunnen! Hele klatten min kribler.',
          fix: 'Åh, takk for at du rettet meg!',
          when: 'Da skal jeg bruke den? Notert!',
          check: `Du sa: «${quote}…» Stemmer det?`,
          askWhy: `Men HVORFOR er «${this.name(req.ideaId)}» sånn?`,
        }
      : {
          say: `Got it! "${quote}…" I'm writing that on my drip.`,
          example: 'Ooh, an example! Now I can picture it.',
          why: "So THAT's why! My whole blob is tingling.",
          fix: 'Ohh, thank you for fixing that!',
          when: "That's when I'd use it? Noted!",
          check: `You told me: "${quote}…" Right?`,
          askWhy: `But WHY does "${this.name(req.ideaId)}" work like that?`,
        };
    await wait(200);
    yield* stream(line[req.event] ?? line.say!);
  }

  async bars(ideaId: string, transcript: TranscriptEntry[]): Promise<BarsReply> {
    const words = (t?: string) => (t ?? '').split(/\s+/).filter(Boolean).length;
    let raw = 0;
    for (const e of transcript.filter((x) => x.ideaId === ideaId)) {
      if (e.move === 'say' && words(e.text) >= 6) raw = Math.max(raw, 28);
      if (e.move === 'example' && words(e.text) >= 8) raw = Math.max(raw, 62);
      if (e.move === 'why' && words(e.text) >= 8) raw = Math.max(raw, 72);
      if (e.move === 'when') raw = Math.max(raw, 30);
      if (e.move === 'check' && e.tap === 'yes') raw = Math.max(raw, 40);
    }
    return { raw, contradictsMisread: false };
  }

  async examine(transcript: TranscriptEntry[], heldMisreads: string[]): Promise<ExamResult> {
    const nb = this.language === 'nb' || this.language === 'nn';
    const results = [];
    for (const idea of this.lesson.ideas) {
      const mine = transcript.filter((e) => e.ideaId === idea.id);
      const moves = mine.map((e) => e.move).filter((m): m is Move => m !== 'same' && m !== 'dontknow');
      const score = barValue(moves, (await this.bars(idea.id, transcript)).raw);
      const belief = heldMisreads.includes(idea.id) ? 'wrong' : score < 10 ? 'unknown' : score >= 60 ? 'right' : 'partial';
      const said = mine.filter((e) => e.text).at(-1)?.text;
      results.push({
        id: idea.id,
        score,
        grounded: score > 0,
        belief: belief as ExamItem['belief'],
        creatureAnswer: said ? said.split(/\s+/).slice(0, 30).join(' ') : nb ? 'Jeg... kan ikke denne!' : "I... don't know this one!",
        tip: nb ? 'Gi et eksempel og si hvorfor.' : 'Give an example and say why.',
      });
    }
    return { results };
  }
}
