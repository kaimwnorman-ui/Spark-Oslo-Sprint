// Runs inside game.html in Opera (bundled by tools/eval-device.mjs): the real DeviceEngine on a demo
// round, with an inner engine that marks any fallback, so every number below is the device's own.
import { DeviceEngine } from '../extension/src/game/device-engine.ts';
import { DemoEngine, OfflineEngine, type BarsReply, type CreatureRequest } from '../extension/src/game/engine.ts';
import { sealLesson } from '../shared/lesson.ts';
import { openDeviceAi } from '../extension/src/game/webai.ts';
import { wordTotal } from '../shared/device.ts';
import type { DemoRound, TranscriptEntry } from '../shared/types.ts';

const FELL_BACK = '[fell back to the inner engine]';

/** The canned round for reveals and the exam; Blot and bars must never come from it here. */
class MarkedEngine extends DemoEngine {
  override async *creature(_req: CreatureRequest): AsyncIterable<string> {
    yield FELL_BACK;
  }
  override async bars(): Promise<BarsReply> {
    return { raw: -1, contradictsMisread: false };
  }
}

export interface ScoreCase {
  label: string;
  ideaId: string;
  texts: string[];
  min?: number;
  max?: number;
}
export interface BlotCase {
  label: string;
  /** Blot's request, plus what the coach already typed on that idea. */
  req: Omit<CreatureRequest, 'transcript'> & { said?: string[] };
}
export interface EvalInput {
  round: string;
  language: string;
  pageText: string;
  scores: ScoreCase[];
  blot: BlotCase[];
  /** The offline exam (no server, no canned round): what the player typed, by idea. */
  offline: { ideaId: string; text: string }[];
}

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : 0);

async function run(input: EvalInput, checks: Record<string, (reply: string) => string | null>) {
  const t0 = performance.now();
  const round = (await (await fetch(`demo/rounds/${input.round}.json`)).json()) as DemoRound;
  const ai = await openDeviceAi(round.lesson.language);
  if (!ai) return { skipped: 'WebAI is not available in this Opera profile (switch on "Enable Web AI API" and enable a model on chrome://webai/).' };
  const openMs = Math.round(performance.now() - t0);
  const t1 = performance.now();
  await ai.warm();
  const warmMs = Math.round(performance.now() - t1);
  const engine = new DeviceEngine(new MarkedEngine(round), Promise.resolve(ai), input.pageText);
  await engine.ready;

  const scores = [];
  for (const c of input.scores) {
    const transcript: TranscriptEntry[] = c.texts.map((text) => ({ ideaId: c.ideaId, move: 'say', text }));
    const ts = performance.now();
    const reply = await engine.bars(c.ideaId, transcript);
    const ms = Math.round(performance.now() - ts);
    const problems = [];
    if (reply.raw < 0) problems.push('fell back');
    if (c.min !== undefined && reply.raw < c.min) problems.push(`< ${c.min}`);
    if (c.max !== undefined && reply.raw > c.max) problems.push(`> ${c.max}`);
    scores.push({ label: c.label, raw: reply.raw, want: `${c.min ?? 0}–${c.max ?? 100}`, ms, problem: problems.join(', ') || null });
  }

  const blot = [];
  for (const c of input.blot) {
    const transcript: TranscriptEntry[] = (c.req.said ?? []).map((text) => ({ ideaId: c.req.ideaId, move: 'say', text }));
    const ts = performance.now();
    // The first piece is Blot's opener (shown at once); the second is the model's first words.
    const times: number[] = [];
    let reply = '';
    for await (const piece of engine.creature({ ...c.req, transcript })) {
      if (times.length < 2) times.push(Math.round(performance.now() - ts));
      reply += piece;
    }
    const first = times[1] ?? times[0] ?? 0;
    const shown = times[0] ?? 0;
    const problems = [];
    if (reply.includes(FELL_BACK)) problems.push('fell back');
    if (!reply.trim()) problems.push('empty');
    if (wordTotal(reply) > 60) problems.push('over 60 words');
    if (/[<>*#]/.test(reply)) problems.push('markup');
    const extra = checks[c.label]?.(reply);
    if (extra) problems.push(extra);
    blot.push({ label: c.label, reply: reply.trim(), first, shown, ms: Math.round(performance.now() - ts), problem: problems.join(', ') || null });
  }
  // The offline exam: the device scores and writes Blot's answers; untaught ideas stay unknown.
  const offlineEngine = new DeviceEngine(new OfflineEngine(sealLesson(round.lesson, 'eval-offline'), round.seed), Promise.resolve(ai), input.pageText);
  await offlineEngine.ready;
  const taught = new Set(input.offline.map((o) => o.ideaId));
  const offlineTranscript: TranscriptEntry[] = input.offline.map((o) => ({ ideaId: o.ideaId, move: 'say', text: o.text }));
  const te = performance.now();
  const exam = await offlineEngine.examine(offlineTranscript, []);
  const examMs = Math.round(performance.now() - te);
  const offline = exam.results.map((r) => {
    const said = input.offline.find((o) => o.ideaId === r.id)?.text ?? '';
    const problems = [];
    if (taught.has(r.id)) {
      if (r.score <= 0) problems.push('no score');
      if (said.startsWith(r.creatureAnswer.slice(0, 40))) problems.push('echoes the coach instead of Blot answering');
      if (wordTotal(r.creatureAnswer) > 40 || /[<>*#]/.test(r.creatureAnswer)) problems.push('too long or markup');
    } else if (r.score !== 0) problems.push('scored an idea nobody taught');
    return { id: r.id, score: r.score, answer: r.creatureAnswer, problem: problems.join(', ') || null };
  });

  // Chat only (comebacks, duels): Blot's reply from the device, the bar and taunt from the inner engine.
  const chat = new DeviceEngine(new MarkedEngine(round), Promise.resolve(ai), input.pageText, { chatOnly: true });
  await chat.ready;
  const chatIdea = input.offline[0]!;
  const chatTranscript: TranscriptEntry[] = [{ ideaId: chatIdea.ideaId, move: 'say', text: chatIdea.text }];
  const chatBar = await chat.bars(chatIdea.ideaId, chatTranscript);
  let chatReply = '';
  for await (const piece of chat.creature({ ideaId: chatIdea.ideaId, event: 'say', belief: 'right', transcript: chatTranscript })) chatReply += piece;
  const chatTaunt = await chat.taunt(round.lesson.monsterName, round.lesson.topic);
  const chatOnly = {
    reply: chatReply.trim(),
    problem:
      [chatBar.raw !== -1 && 'the bar did not come from the inner engine', (chatReply.includes(FELL_BACK) || !chatReply.trim()) && 'the reply did not come from the device', chatTaunt !== null && 'it wrote a taunt']
        .filter(Boolean)
        .join(', ') || null,
  };

  return {
    openMs,
    warmMs,
    examMs,
    offline,
    chatOnly,
    barsMedianMs: median(scores.map((s) => s.ms)),
    blotFirstMedianMs: median(blot.map((b) => b.first)),
    blotShownMedianMs: median(blot.map((b) => b.shown)),
    scores,
    blot,
  };
}

/** Checks that need code (they can't cross from Node as JSON), by Blot case label. */
const CHECKS: Record<string, (reply: string) => string | null> = {
  'check (misread)': (r) => (/(right|stemmer det)\?\s*$/i.test(r) ? null : 'does not end with the "Right?" question'),
  'check (right)': (r) => (/(right|stemmer det)\?\s*$/i.test(r) ? null : 'does not end with the "Right?" question'),
  'ask why': (r) => (/^\s*(but why|men hvorfor|men kvifor)/i.test(r) ? null : 'does not start with "But WHY"'),
  'men hvorfor': (r) => (/^\s*men hvorfor/i.test(r) ? null : 'does not start with "Men HVORFOR"'),
};

(globalThis as unknown as { __sparkEval: (input: EvalInput) => ReturnType<typeof run> }).__sparkEval = (input) => run(input, CHECKS);
