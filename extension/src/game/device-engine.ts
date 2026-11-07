// Blot and the live bars on the player's own device (Opera WebAI); the exam stays on the server.
//
// DeviceEngine wraps another engine (the server, a canned round, or the offline Blot). It answers
// Blot's replies and the live bars itself, and asks the inner engine only for the exam and for the
// two facts the game reveals anyway (was a "when" tap right; the misreading Blot holds). So while
// the player teaches, their words stay on the device. Any device failure falls back to the inner
// engine for that one call, so a round never stalls. Until the model is ready (Opera starts its AI
// service on first use, a few seconds), every call simply goes to the inner engine.
import type { BarsReply, CreatureRequest, RoundEngine } from './engine.ts';
import { OfflineEngine } from './engine.ts';
import type { DeviceAi } from './webai.ts';
import { hasDeviceAi, openDeviceAi } from './webai.ts';
import { misreadIdeaIds } from '../../../shared/round.ts';
import {
  WHEN_TAP_RAW, blotStarter, blotTask, checkPrompt, hasCauseOrExample, mayBeStarter, stripStarter, cleanReply, confirmTopic, denialPrompt, guardRaw, hasDenial, parseDigit, parseYesNo, pickPassage,
  rawFromChecks, topicOf, whichIdeaPrompt, wordTotal,
} from '../../../shared/device.ts';
import type { ExamResult, Language, RevealAsk, RevealReply, SealedIdea, SealedLesson, TranscriptEntry } from '../../../shared/types.ts';

/** Blot never says more than 60 words (SPEC §12). */
const MAX_WORDS = 60;

export class DeviceEngine implements RoundEngine {
  readonly lesson: SealedLesson;
  readonly language: Language;
  readonly seed: number;
  /** The engine for the exam, the reveals and any fallback. Swapped when the server goes away. */
  inner: RoundEngine;
  private readonly held: Set<string>;
  private readonly whenCache = new Map<string, boolean>();
  private readonly misreadCache = new Map<string, string | null>();
  /** Rotates Blot's openers. */
  private turn = 0;
  /** The device model, once it is ready (null before, or when it never starts). */
  private ai: DeviceAi | null = null;
  private readonly pageText: string;
  /** Resolves true once Blot runs on the device, false if it never will. */
  readonly ready: Promise<boolean>;

  constructor(inner: RoundEngine, ai: Promise<DeviceAi | null>, pageText: string) {
    this.inner = inner;
    this.pageText = pageText;
    this.ready = ai.then(
      (a) => !!(this.ai = a),
      () => false,
    );
    this.lesson = inner.lesson;
    this.language = inner.language;
    this.seed = inner.seed;
    this.held = new Set(misreadIdeaIds(this.lesson.ideas.map((i) => i.id), this.seed));
  }

  get offline(): boolean {
    return this.inner.offline;
  }

  /** True while Blot and the bars run on the device. */
  get onDevice(): boolean {
    return !!this.ai;
  }

  private idea(id: string): SealedIdea {
    const idea = this.lesson.ideas.find((i) => i.id === id);
    if (!idea) throw new Error(`Unknown idea ${id}`);
    return idea;
  }

  // ---------------------------------------------------------------- reveals (from the inner engine)

  reveal(ideaId: string, ask: RevealAsk): Promise<RevealReply> {
    return this.inner.reveal ? this.inner.reveal(ideaId, ask) : Promise.resolve({});
  }

  /** Was that "when" tap right? Unknown (undefined) when nothing can say, e.g. offline. */
  private async whenRight(ideaId: string, tap: number): Promise<boolean | undefined> {
    const key = `${ideaId}:${tap}`;
    if (this.whenCache.has(key)) return this.whenCache.get(key);
    const reply = await this.reveal(ideaId, { kind: 'when', tap }).catch(() => ({}) as RevealReply);
    if (typeof reply.right === 'boolean') this.whenCache.set(key, reply.right);
    return reply.right;
  }

  /** The misreading Blot holds on this idea, or null. */
  private async misread(ideaId: string): Promise<string | null> {
    if (!this.held.has(ideaId)) return null;
    if (this.misreadCache.has(ideaId)) return this.misreadCache.get(ideaId)!;
    const reply = await this.reveal(ideaId, { kind: 'misread' }).catch(() => ({}) as RevealReply);
    const misread = typeof reply.misread === 'string' ? reply.misread : null;
    if (misread) this.misreadCache.set(ideaId, misread);
    return misread;
  }

  // ---------------------------------------------------------------- Blot

  async *creature(req: CreatureRequest): AsyncIterable<string> {
    const ai = this.ai;
    if (!ai) {
      yield* this.inner.creature(req);
      return;
    }
    const idea = this.idea(req.ideaId);
    const coach = req.transcript.filter((e) => e.ideaId === req.ideaId && e.text).map((e) => e.text!);
    const tap = typeof req.tap === 'number' ? req.tap : undefined;
    const whenRight = req.event === 'when' && tap !== undefined ? await this.whenRight(req.ideaId, tap) : undefined;
    const starter = blotStarter(req.event, this.language, whenRight, this.turn++);
    const task = blotTask(req.event, {
      language: this.language,
      ideaName: idea.name,
      coach,
      belief: req.belief,
      whenText: tap !== undefined ? idea.whenOptions[tap]?.text : undefined,
      whenRight,
      misread: req.event === 'check' && req.belief === 'misread' ? await this.misread(req.ideaId) : undefined,
      starter,
    });
    if (task) {
      // Blot reacts at once with a short opener; the model writes the rest (~0.8 s to its first
      // sentence). The model's text is cleaned as a whole, and a repeated opener is dropped.
      const opener = `${starter} `;
      yield opener;
      const stop = new AbortController();
      let heard = '';
      let rest = '';
      try {
        for await (const piece of ai.blot(task, stop.signal)) {
          heard += piece;
          const cleaned = cleanReply(heard);
          if (mayBeStarter(cleaned, starter)) continue;
          const clean = stripStarter(cleaned, starter);
          if (!clean.startsWith(rest) || clean.length === rest.length) continue;
          const delta = clean.slice(rest.length);
          rest = clean;
          yield delta;
          if (wordTotal(opener + rest) >= MAX_WORDS) {
            stop.abort();
            break;
          }
        }
      } catch (err) {
        // Half a reply is still a reply; only the opener goes on with the fallback below.
        if (rest.trim()) return;
        console.info('Spark: on-device Blot failed, asking the server.', err instanceof Error ? err.message : err);
      }
      if (rest.trim()) return;
    }
    yield* this.inner.creature(req);
  }

  // ---------------------------------------------------------------- live bars

  async bars(ideaId: string, transcript: TranscriptEntry[]): Promise<BarsReply> {
    const ai = this.ai;
    if (!ai) return this.inner.bars(ideaId, transcript);
    const idea = this.idea(ideaId);
    const mine = transcript.filter((e) => e.ideaId === ideaId);
    const last = mine.at(-1);
    const whenRight = last?.move === 'when' && typeof last.tap === 'number' ? await this.whenRight(ideaId, last.tap) : undefined;
    let raw = 0;
    for (const e of mine) if (e.move === 'when' && typeof e.tap === 'number' && this.whenCache.get(`${ideaId}:${e.tap}`) === true) raw = WHEN_TAP_RAW;
    const typedEntries = mine.filter((e) => e.text && e.move !== 'same' && e.move !== 'dontknow');
    const typed = typedEntries.map((e) => e.text!);
    if (!typed.length) return { raw, contradictsMisread: false, whenRight };
    // An Example or an answer to Blot's "but WHY?" is a why/example by its move.
    const whyMove = typedEntries.some((e) => e.move === 'example' || e.move === 'why');
    try {
      const [score, contradictsMisread] = await Promise.all([this.score(ai, ideaId, idea.name, typed, whyMove), this.denies(ai, ideaId, typed.at(-1)!)]);
      return { raw: Math.max(raw, score), contradictsMisread, whenRight };
    } catch (err) {
      console.info('Spark: on-device bars failed, asking the server.', err instanceof Error ? err.message : err);
      const reply = await this.inner.bars(ideaId, transcript);
      return { ...reply, whenRight: reply.whenRight ?? whenRight };
    }
  }

  /**
   * Raw 0–100 for one idea: which idea is this about? is it correct? how/when? why/example? Each a
   * one-word answer judged against the page's own words; code adds them up and applies the caps.
   */
  private async score(ai: DeviceAi, ideaId: string, ideaName: string, typed: string[], whyMove: boolean): Promise<number> {
    const coachText = typed.join(' ');
    const passage = pickPassage(this.pageText, ideaName, coachText);
    const names = this.lesson.ideas.map((i) => i.name);
    const yes = async (check: 'correct' | 'how' | 'why') => {
      const answer = parseYesNo(await ai.judge(checkPrompt(check, ideaName, passage, typed)));
      if (answer === null) throw new Error(`no yes/no for ${check}`);
      return answer;
    };
    // Stage 1: which idea, and is it right? Off-topic or wrong ends here (half the calls).
    const [which, correct] = await Promise.all([ai.judge(whichIdeaPrompt(names, typed)), yes('correct')]);
    const self = this.lesson.ideas.findIndex((i) => i.id === ideaId) + 1;
    const picked = parseDigit(which, names.length);
    const topic = confirmTopic(topicOf([picked], self), picked, names, self, coachText);
    const words = wordTotal(coachText);
    if (topic === 'none' || !correct) return guardRaw(rawFromChecks({ topic, correct, how: false, why: false, words }), coachText, ideaName, passage);
    // Stage 2: how or when, and why or an example.
    const [how, whyAnswer] = await Promise.all([yes('how'), yes('why')]);
    const why = whyAnswer && (whyMove || hasCauseOrExample(coachText));
    return guardRaw(rawFromChecks({ topic, correct, how, why, words }), coachText, ideaName, passage);
  }

  /** Rule 3: does the latest message rule out the misreading? Needs an actual denial in the words. */
  private async denies(ai: DeviceAi, ideaId: string, latest: string): Promise<boolean> {
    if (!this.held.has(ideaId) || !hasDenial(latest)) return false;
    const misread = await this.misread(ideaId);
    if (!misread) return false;
    return parseYesNo(await ai.judge(denialPrompt(misread, latest))) === true;
  }

  // ---------------------------------------------------------------- the exam

  examine(transcript: TranscriptEntry[], heldMisreads: string[]): Promise<ExamResult> {
    // Offline (no server, no canned round): the device's own scores.
    if (this.ai && this.inner instanceof OfflineEngine) return this.inner.examineWith((id, t) => this.bars(id, t).then((r) => r.raw), transcript, heldMisreads);
    return this.inner.examine(transcript, heldMisreads);
  }
}

/**
 * The on-device engine around `inner` when this browser has the model API, else `inner` itself.
 * Never waits: the model opens and wakes in the background (during the monster's reveal), and
 * `onReady` runs once Blot is really on the device.
 */
export function withDevice(inner: RoundEngine, pageText: string, onReady?: () => void): RoundEngine {
  if (!hasDeviceAi()) return inner;
  const ai = openDeviceAi(inner.language).then(async (a) => {
    if (a) await a.warm();
    return a;
  });
  const engine = new DeviceEngine(inner, ai, pageText);
  void engine.ready.then((on) => on && onReady?.());
  return engine;
}
