// The live round engine: the Spark server's /creature (streamed), /bars and /examine.
import { CLIENT_TOKEN } from '../../../shared/config.ts';
import type { BarValue, ExamResult, Language, RevealAsk, RevealReply, SealedLesson, TranscriptEntry } from '../../../shared/types.ts';
import type { BarsReply, CreatureRequest, RoundEngine } from './engine.ts';

export class ServerError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class ServerEngine implements RoundEngine {
  readonly offline: boolean;
  readonly lesson: SealedLesson;
  readonly language: Language;
  readonly seed: number;
  private readonly base: string;

  constructor(base: string, lesson: SealedLesson, seed: number, offline: boolean) {
    this.base = base;
    this.lesson = lesson;
    this.language = lesson.language;
    this.seed = seed;
    this.offline = offline;
  }

  private async post(path: string, body: unknown, timeoutMs: number): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-spark': CLIENT_TOKEN },
        body: JSON.stringify({ lessonId: this.lesson.lessonId, ...(body as object) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ServerError(0, 'Spark can’t reach its server.');
    }
    if (!res.ok) {
      const message = await res.json().then((b: { error?: string }) => b.error ?? '', () => '');
      throw new ServerError(res.status, message || `The server answered ${res.status}.`);
    }
    return res;
  }

  async *creature(req: CreatureRequest): AsyncIterable<string> {
    const res = await this.post('/creature', req, 20_000);
    if (!res.body) {
      yield await res.text();
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) yield text;
    }
  }

  async bars(ideaId: string, transcript: TranscriptEntry[]): Promise<BarsReply> {
    const res = await this.post('/bars', { ideaId, transcript }, 10_000);
    const body = (await res.json()) as { bars: BarValue[]; whenRight?: boolean };
    const bar = body.bars.find((b) => b.id === ideaId);
    return { raw: bar?.value ?? 0, contradictsMisread: !!bar?.contradictsMisread, whenRight: body.whenRight };
  }

  async examine(transcript: TranscriptEntry[], heldMisreads: string[]): Promise<ExamResult> {
    const res = await this.post('/examine', { transcript, heldMisreads }, 45_000);
    return (await res.json()) as ExamResult;
  }

  /** No AI and no player text: one fact the game is about to show (see /reveal on the server). */
  async reveal(ideaId: string, ask: RevealAsk): Promise<RevealReply> {
    const res = await this.post('/reveal', { ideaId, ...ask }, 5_000);
    return (await res.json()) as RevealReply;
  }
}
