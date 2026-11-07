// The browser's on-device model (Opera WebAI; the same LanguageModel API as Chrome's built-in AI).
// Feature-detected: when it is missing, not switched on, or would need a download, Spark simply
// uses its server. Nothing here starts a model download.
import type { Language } from '../../../shared/types.ts';
import { JUDGE_SYSTEM, blotSystem, deviceLanguage, streamDelta } from '../../../shared/device.ts';

interface LMSession {
  prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  promptStreaming(input: string, options?: { signal?: AbortSignal }): AsyncIterable<string>;
  clone?(options?: { signal?: AbortSignal }): Promise<LMSession>;
  destroy?(): void;
}
interface LMCreateOptions {
  initialPrompts?: { role: 'system' | 'user' | 'assistant'; content: string }[];
  /** Opera WebAI: 'most-predictable' | 'predictable' | 'balanced' | 'creative' | 'most-creative'. */
  samplingMode?: string;
  expectedInputs?: { type: 'text'; languages: string[] }[];
  expectedOutputs?: { type: 'text'; languages: string[] }[];
  signal?: AbortSignal;
}
interface LMStatic {
  availability(options?: LMCreateOptions): Promise<string>;
  create(options?: LMCreateOptions): Promise<LMSession>;
}

/**
 * Opera starts its local AI service on first use, so the first session can take ~4–5 s and early
 * attempts may fail with "the service is not running". Keep trying, in the background, this long.
 */
const OPEN_DEADLINE_MS = 20_000;
const OPEN_RETRY_MS = 750;
const FIRST_PIECE_MS = 8000;
const ANSWER_MS = 6000;

export interface DeviceAi {
  /** Blot's reply, streamed as new text pieces. */
  blot(task: string, signal?: AbortSignal): AsyncIterable<string>;
  /** One short judge answer (a digit or yes/no). */
  judge(prompt: string): Promise<string>;
  /** One line from a one-off character (the monster's taunt), or '' if it takes too long. */
  line(system: string, prompt: string, timeoutMs: number): Promise<string>;
  /** One throwaway prompt, so the first real reply doesn't pay the model's wake-up time (~4 s). */
  warm(): Promise<void>;
  close(): void;
}

function lm(): LMStatic | null {
  const x = (globalThis as { LanguageModel?: LMStatic }).LanguageModel;
  return x && typeof x.create === 'function' && typeof x.availability === 'function' ? x : null;
}

/** Does this browser have the on-device model API at all? (Cheap; says nothing about readiness.) */
export function hasDeviceAi(): boolean {
  return !!lm();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Opens Blot's and the judge's sessions, or returns null when the device can't (or shouldn't) run
 * them. Slow on a cold start: callers run it in the background and use the server meanwhile.
 */
export async function openDeviceAi(language: Language): Promise<DeviceAi | null> {
  const LM = lm();
  if (!LM) return null;
  const lang = deviceLanguage(language);
  const inputs = [{ type: 'text' as const, languages: lang === 'en' ? ['en'] : ['en', lang] }];
  const deadline = Date.now() + OPEN_DEADLINE_MS;
  let last: unknown = null;
  while (Date.now() < deadline) {
    try {
      const ready = await LM.availability({ expectedInputs: inputs, expectedOutputs: [{ type: 'text', languages: [lang] }] });
      // "downloadable"/"downloading" would mean gigabytes on a judge's laptop: never start that here.
      if (ready === 'downloadable' || ready === 'downloading') {
        console.info(`Spark: on-device AI is "${ready}", using the server.`);
        return null;
      }
      // While Opera's AI service starts it can briefly say "unavailable": ask again.
      if (ready !== 'available') throw new Error(`availability: ${ready}`);
      // One at a time: two creates at once while the service starts can both fail.
      const blot = await LM.create({ expectedInputs: inputs, expectedOutputs: [{ type: 'text', languages: [lang] }], initialPrompts: [{ role: 'system', content: blotSystem(language) }] });
      // The judge answers the same way every time (Opera's samplingMode; clones keep it). Measured:
      // with default sampling the "which idea" answer wobbled between runs; most-predictable did not.
      const judgeOptions: LMCreateOptions = { expectedInputs: inputs, expectedOutputs: [{ type: 'text', languages: ['en'] }], initialPrompts: [{ role: 'system', content: JUDGE_SYSTEM }] };
      const judge = await LM.create({ ...judgeOptions, samplingMode: 'most-predictable' }).catch((err: unknown) => {
        // A browser with the API but without this option: plain sampling.
        if (err instanceof TypeError) return LM.create(judgeOptions);
        throw err;
      });
      return new WebAi(LM, blot, judge, language);
    } catch (err) {
      last = err;
      await sleep(OPEN_RETRY_MS);
    }
  }
  console.info('Spark: on-device AI did not start, using the server.', last instanceof Error ? last.message : last);
  return null;
}

class WebAi implements DeviceAi {
  private closed = false;
  private readonly LM: LMStatic;
  private readonly blotBase: LMSession;
  private readonly judgeBase: LMSession;
  private readonly language: Language;

  constructor(LM: LMStatic, blotBase: LMSession, judgeBase: LMSession, language: Language) {
    this.LM = LM;
    this.blotBase = blotBase;
    this.judgeBase = judgeBase;
    this.language = language;
  }

  /** A fresh copy of a base session, so replies never pile up in one conversation. */
  private async fork(base: LMSession, system: string, signal: AbortSignal): Promise<LMSession> {
    if (base.clone) return base.clone({ signal });
    return this.LM.create({ signal, initialPrompts: [{ role: 'system', content: system }] });
  }

  async *blot(task: string, signal?: AbortSignal): AsyncIterable<string> {
    if (this.closed) throw new Error('closed');
    const first = new AbortController();
    const stop = parentStop(signal, first);
    const timer = setTimeout(() => first.abort(new Error('no reply in time')), FIRST_PIECE_MS);
    const session = await this.fork(this.blotBase, blotSystem(this.language), stop);
    let soFar = '';
    try {
      for await (const chunk of session.promptStreaming(task, { signal: stop })) {
        clearTimeout(timer);
        const piece = streamDelta(soFar, chunk);
        soFar += piece;
        if (piece) yield piece;
      }
    } finally {
      clearTimeout(timer);
      session.destroy?.();
    }
  }

  async judge(prompt: string): Promise<string> {
    if (this.closed) throw new Error('closed');
    // Right after the model is switched on, an answer sometimes comes back empty: ask once more.
    for (let attempt = 0; attempt < 2; attempt++) {
      const signal = AbortSignal.timeout(ANSWER_MS);
      const session = await this.fork(this.judgeBase, JUDGE_SYSTEM, signal);
      try {
        const answer = (await session.prompt(prompt, { signal })).trim();
        if (answer) return answer;
      } finally {
        session.destroy?.();
      }
    }
    throw new Error('empty answer');
  }

  async line(system: string, prompt: string, timeoutMs: number): Promise<string> {
    if (this.closed) throw new Error('closed');
    const signal = AbortSignal.timeout(timeoutMs);
    const lang = deviceLanguage(this.language);
    const session = await this.LM.create({ signal, expectedInputs: [{ type: 'text', languages: lang === 'en' ? ['en'] : ['en', lang] }], expectedOutputs: [{ type: 'text', languages: [lang] }], initialPrompts: [{ role: 'system', content: system }] });
    try {
      return (await session.prompt(prompt, { signal })).trim();
    } finally {
      session.destroy?.();
    }
  }

  async warm(): Promise<void> {
    await Promise.allSettled([this.judge('Answer with one word: yes.'), drain(this.blot('Say hi to your coach in three words.'))]);
  }

  close(): void {
    this.closed = true;
    this.blotBase.destroy?.();
    this.judgeBase.destroy?.();
  }
}

/** One signal that stops on the caller's abort or ours. */
function parentStop(parent: AbortSignal | undefined, own: AbortController): AbortSignal {
  return parent ? AbortSignal.any([parent, own.signal]) : own.signal;
}

async function drain(it: AsyncIterable<string>): Promise<void> {
  for await (const _ of it) void _;
}
