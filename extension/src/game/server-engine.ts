// The live round engine: the Spark server's /creature (streamed), /bars and /examine.
// Also the small helpers every other server call uses (/recall, /duel).
import { CLIENT_TOKEN, SERVER_URL } from '../../../shared/config.ts';
import type { BarValue, ExamResult, Language, SealedLesson, TranscriptEntry } from '../../../shared/types.ts';
import type { BarsReply, CreatureRequest, RoundEngine } from './engine.ts';
import { getLocal } from './storage.ts';

/** Where the server is: this page's own server when it serves the game (/app/), else the configured one. */
export async function serverBase(): Promise<string> {
  if (/^https?:$/.test(location.protocol) && location.pathname.startsWith('/app/')) return location.origin;
  return (await getLocal<string>('serverUrl', '')) || SERVER_URL;
}

/** POST JSON to the server; throws ServerError (status 0 when it cannot be reached). */
export async function postJson<T>(path: string, body: unknown, timeoutMs = 15_000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${await serverBase()}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-spark': CLIENT_TOKEN },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ServerError(0, 'Spark can’t reach its server.');
  }
  if (!res.ok) {
    const message = await res.json().then((b: { error?: string }) => b.error ?? '', () => '');
    throw new ServerError(res.status, message || `The server answered ${res.status}.`);
  }
  return (await res.json()) as T;
}

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
}
