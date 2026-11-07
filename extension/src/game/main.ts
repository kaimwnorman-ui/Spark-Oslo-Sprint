// Spark's game tab: home, demo rounds (?demo=tides), rounds from real pages (?round=), and the
// learning loop (SPEC §17): Your Blot (?blot=1), comebacks (?comeback=), duels (?duel=).
import { DEMO_SPEED, DEMO_TEACH_SECONDS, MISREAD_COUNT, MONSTER_WORDS, TEACH_SECONDS } from '../../../shared/config.ts';
import { barValue } from '../../../shared/bars.ts';
import { decodeLocalDuel, isLocalDuel, isServerDuelCode, readChallenge, type DuelChallenge } from '../../../shared/duel.ts';
import { focusCodes, insights, summarizeRound, type FocusCode } from '../../../shared/insights.ts';
import {
  afterRematch, comebackId, dropComeback, dueCard, dueComebacks, intervalDays, lockedScore, planComeback, recallScore, recordCards,
  spendPowerUps, upsertComeback,
} from '../../../shared/memory.ts';
import { misreadIdeaIds, monsterInk } from '../../../shared/round.ts';
import type { DemoRound, Move, RoundHandoff, SealedLesson, Trait } from '../../../shared/types.ts';
import { distinctiveWords } from '../../../shared/words.ts';
import { setSpeed } from './anim.ts';
import { newProgress, type RoundCtx } from './context.ts';
import { h } from './dom.ts';
import { ComebackEngine, DemoEngine, LockedEngine, OfflineEngine, loadDemoRound, type RoundEngine } from './engine.ts';
import { DeviceEngine, withDevice } from './device-engine.ts';
import { linesFor } from './lines.ts';
import { currentTraits, loadHistory, loadMemory, navUrl, now, recordRound, saveMemory, updateMemory } from './memory-store.ts';
import { ServerEngine, ServerError, postJson, serverBase } from './server-engine.ts';
import { initSound } from './sound.ts';
import { getLocal, getSession, setLocal } from './storage.ts';
import { primary, secondary, showDeviceNote, showOfflineNote, showScreen } from './ui.ts';
import { formingScreen, homeScreen, pageScreen } from './screens/intro.ts';
import { teachScreen } from './screens/teach.ts';
import { boutScreen, eatScreen, examScreen, loseScreen } from './screens/fight.ts';
import { replayScreen } from './screens/replay.ts';
import { flashbackScreen } from './screens/flashback.ts';
import { yourBlotScreen } from './screens/your-blot.ts';
import { duelBoutScreen, duelIntroScreen, duelResultScreen } from './screens/duel.ts';

const params = new URLSearchParams(location.search);
/** Tests only: run the whole round near-instantly. */
const FAST = params.has('fast');
/** Demo page, but through the server (real AI, or AI_STUB). */
const LIVE = params.get('live') === '1';
/** Optional teaching time in seconds (presenters, tests). */
const TEACH = Math.min(300, Math.max(20, Number(params.get('teach')) || 0)) || null;
/** A comeback is about one idea: one minute is plenty. */
const COMEBACK_SECONDS = 60;
/**
 * On-device Blot (Opera WebAI): on by default for rounds from real pages, off for the scripted demo
 * rounds. ?device=1 turns it on for a demo round, ?device=0 turns it off everywhere.
 */
const DEVICE = params.get('device');

/** Blot on the device when this browser can, around `inner`; the label shows once it really is. */
function onDevice(inner: RoundEngine, pageText: string, wanted: boolean): RoundEngine {
  if (!wanted || DEVICE === '0') return inner;
  return withDevice(inner, pageText, () => showDeviceNote(linesFor(inner.language).onDevice));
}

const go = (path: string) => {
  location.href = navUrl(path);
};
const goHome = () => go('game.html');

function baseCtx(engine: RoundEngine, traits: Trait[], firstRound: boolean, teachSeconds: number, coach: FocusCode[] = []): RoundCtx {
  const lesson = engine.lesson;
  return {
    kind: 'round',
    engine,
    lines: linesFor(engine.language),
    lesson,
    fullLesson: null,
    demo: null,
    pageSrc: null,
    capture: null,
    pageText: '',
    monster: { name: lesson.monsterName, shape: lesson.monsterShape, color: monsterInk(lesson.monsterName), words: lesson.words },
    traits,
    firstRound,
    teachSeconds,
    // Coach focus "trust": a player who lets Blot's mix-ups slide gets one more to catch.
    misreads: misreadIdeaIds(lesson.ideas.map((i) => i.id), engine.seed, coach.includes('trust') ? MISREAD_COUNT + 1 : MISREAD_COUNT),
    transcript: [],
    progress: newProgress(lesson),
    exam: null,
    provisional: false,
    bout: null,
    trait: null,
    attempt: 1,
    focus: null,
    onHome: goHome,
    onPlayAgain: () => location.reload(),
    demoId: null,
    coach,
    locked: {},
    comeback: null,
    duel: null,
    duelOutcome: null,
    boosts: {},
    boostsUsed: [],
    cardIds: {},
    after: { comeback: null, tamed: false, recallDays: null, tip: null },
  };
}

/** The coach's focus for the next round, from the player's own history. */
async function coachFocus(): Promise<FocusCode[]> {
  return focusCodes(await loadHistory());
}

/**
 * If the server fails mid-round, the round goes on offline (SPEC §13): with the page's canned round
 * when the lesson is that round's, else with an offline Blot. A forgotten round (410) says so.
 */
function failOver(ctx: RoundCtx, canned: DemoRound | null): void {
  ctx.onEngineError = (err) => {
    // Only the server engine can fail; the local engines (canned or offline Blot) never do. An
    // on-device Blot keeps talking: only the engine behind it changes.
    const device = ctx.engine instanceof DeviceEngine ? ctx.engine : null;
    const server = device ? device.inner : ctx.engine;
    if (!(server instanceof ServerEngine)) return;
    if (err instanceof ServerError && err.status === 410) {
      errorScreen(ctx.lines.expired, true);
      return;
    }
    const sameLesson = !!canned && canned.lesson.ideas.every((i, n) => ctx.lesson.ideas[n]?.name === i.name);
    const fallback = sameLesson ? new DemoEngine(canned!, ctx.lesson) : new OfflineEngine(ctx.lesson, server.seed);
    if (device) device.inner = fallback;
    else ctx.engine = fallback;
    // An offline Blot cannot reveal a hidden misreading, so it stops holding any.
    if (!sameLesson) {
      ctx.misreads = [];
      for (const p of Object.values(ctx.progress)) if (p.belief === 'misread') p.belief = 'right';
    }
    showOfflineNote(device?.onDevice ? ctx.lines.offlineDevice : ctx.lines.offline);
  };
}

/** Stage round: some ideas arrive already taught (SPEC §13). */
async function applyPretaught(ctx: RoundCtx, round: DemoRound): Promise<void> {
  if (!round.pretaught?.length) return;
  ctx.misreads = [];
  for (const e of round.pretaught) {
    ctx.transcript.push(e);
    const p = ctx.progress[e.ideaId]!;
    if (e.move !== 'same' && e.move !== 'dontknow') p.moves.push(e.move as Move);
    p.said = true;
    p.asked = true;
    p.belief = 'right';
  }
  for (const id of new Set(round.pretaught.map((e) => e.ideaId))) {
    const p = ctx.progress[id]!;
    p.raw = (await ctx.engine.bars(id, ctx.transcript)).raw;
    p.value = barValue(p.moves, p.raw);
  }
}

// ---------------------------------------------------------------- the learning loop around a round

/** Before teaching: if a memory from another page is fading, Blot asks about it (SPEC §17). */
async function maybeFlashback(ctx: RoundCtx): Promise<void> {
  const memory = await loadMemory();
  const card = dueCard(memory.cards.filter((c) => c.monsterName !== ctx.monster.name), now());
  if (!card) return;
  await flashbackScreen({ card, traits: ctx.traits, continueLabel: 'Teach Blot', onHome: ctx.onHome });
  ctx.traits = await currentTraits();
}

/** Before a bout: Blot uses one of each power-up it holds. */
async function useBoosts(ctx: RoundCtx): Promise<void> {
  const memory = await loadMemory();
  const spent = spendPowerUps(memory);
  ctx.boosts = spent.boosts;
  ctx.boostsUsed = spent.used;
  if (spent.used.length) await saveMemory(spent.state);
}

/** After the exam: what the player taught becomes memory cards (asked again in a few days). */
async function rememberRound(ctx: RoundCtx): Promise<void> {
  const memory = await loadMemory();
  // A comeback's beaten ideas were not taught again: their memories stay as they are.
  const taught = { results: ctx.exam!.results.filter((r) => !(r.id in ctx.locked)) };
  const rec = recordCards(
    memory,
    { monster: { name: ctx.monster.name, color: ctx.monster.color }, topic: ctx.lesson.topic, language: ctx.lesson.language, ideas: ctx.lesson.ideas, exam: taught },
    now(),
  );
  ctx.cardIds = { ...ctx.cardIds, ...rec.ids };
  await saveMemory(rec.state);
}

/** After the round: history (for insights), the monster's comeback, and what to tell the player. */
async function closeRound(ctx: RoundCtx, outcome: 'win' | 'lose' | 'draw'): Promise<void> {
  const t = now();
  const history = await recordRound(
    // A comeback only counts the idea it was about: the beaten ones were not taught again.
    summarizeRound({
      at: t, topic: ctx.lesson.topic, monsterName: ctx.monster.name, outcome, ideas: ctx.lesson.ideas.filter((i) => !(i.id in ctx.locked)),
      transcript: ctx.transcript, exam: ctx.exam!, kind: ctx.kind,
    }),
  );
  ctx.after.tip = insights(history)[0] ?? null;
  ctx.after.recallDays = Object.keys(ctx.cardIds).length ? intervalDays(0) : null;
  const won = outcome === 'win';
  await updateMemory((memory) => {
    if (ctx.kind === 'comeback' && ctx.comeback) {
      const score = ctx.exam!.results.find((r) => r.id === ctx.comeback!.ideaId)?.score ?? 0;
      const next = afterRematch(memory, ctx.comeback.id, { won, score }, t);
      ctx.after.comeback = next.comebacks.find((c) => c.id === ctx.comeback!.id) ?? null;
      ctx.after.tamed = !ctx.after.comeback;
      return next;
    }
    if (ctx.kind !== 'round') return memory;
    const id = comebackId(ctx.monster.name);
    const previous = memory.comebacks.find((c) => c.id === id)?.ideas;
    const plan = planComeback(
      {
        monster: { name: ctx.monster.name, shape: ctx.monster.shape, color: ctx.monster.color, words: ctx.monster.words },
        topic: ctx.lesson.topic,
        language: ctx.lesson.language,
        demoId: ctx.demoId,
        ideas: ctx.lesson.ideas,
        exam: ctx.exam!,
        won,
        previous,
      },
      t,
    );
    ctx.after.comeback = plan;
    return plan ? upsertComeback(memory, plan) : dropComeback(memory, id);
  });
}

/** Teach → exam → bout → eat or escape (→ rematch) → replay. A duel ends in Blot vs Blot. */
async function playRound(ctx: RoundCtx): Promise<void> {
  let outcome: 'win' | 'lose' | 'draw' = 'lose';
  for (;;) {
    await teachScreen(ctx);
    if (ctx.kind !== 'duel') await useBoosts(ctx);
    await examScreen(ctx);
    await rememberRound(ctx);
    if (ctx.kind === 'duel' && ctx.duel) {
      const result = await duelBoutScreen(ctx, ctx.duel);
      ctx.duelOutcome = result.outcome;
      outcome = result.outcome;
      await duelResultScreen(ctx, ctx.duel, result);
      break;
    }
    await boutScreen(ctx);
    outcome = ctx.bout!.outcome;
    if (outcome === 'win') {
      await eatScreen(ctx);
      break;
    }
    const choice = await loseScreen(ctx);
    if (choice === 'replay') break;
    ctx.attempt++;
  }
  await closeRound(ctx, outcome);
  const next = await replayScreen(ctx);
  if (next === 'again') ctx.onPlayAgain();
  else if (next === 'blot') go('game.html?blot=1');
  else ctx.onHome();
}

// ---------------------------------------------------------------- the ways into a round

async function playDemo(id: string): Promise<void> {
  const round = await loadDemoRound(id);
  const demoEngine = new DemoEngine(round);
  setSpeed(FAST ? 12 : DEMO_SPEED);
  const firstRound = !(await getLocal('played', false));
  // The stage round is for presenters: no coaching, no flashback.
  const stage = !!round.pretaught?.length;
  const ctx = baseCtx(demoEngine, await currentTraits(), firstRound, TEACH ?? (FAST ? 30 : DEMO_TEACH_SECONDS), stage ? [] : await coachFocus());
  ctx.demo = round;
  ctx.demoId = round.id;
  ctx.fullLesson = round.lesson;
  ctx.pageSrc = round.page;
  const { boxes, text, frame, capture } = await pageScreen(ctx);
  ctx.pageText = text;
  // ?live=1 wraps the server engine below instead (one device session per round).
  ctx.engine = onDevice(ctx.engine, text, DEVICE === '1' && !LIVE);
  if (LIVE) {
    // ?live=1: the same demo page, but the lesson and Blot come from the server (real AI or AI_STUB).
    const server = await serverBase();
    const data = await postJson<{ lesson: SealedLesson; seed: number; offline: boolean }>('/extract', {
      capture: { url: new URL(round.page, location.href).href, title: capture.title, text: capture.text, links: capture.links, source: 'page' },
    }, 60_000).catch(() => null);
    if (data) {
      const live = baseCtx(onDevice(new ServerEngine(server, data.lesson, data.seed, data.offline), text, true), ctx.traits, firstRound, ctx.teachSeconds, ctx.coach);
      Object.assign(ctx, { engine: live.engine, lesson: live.lesson, misreads: live.misreads, progress: live.progress, monster: { ...live.monster, words: ctx.monster.words }, fullLesson: null, demoId: null });
      failOver(ctx, round);
    } else {
      // No server: this page has a canned round, so play it offline.
      showOfflineNote(ctx.lines.offline);
    }
  }
  await formingScreen(ctx, boxes, frame);
  if (!stage) await maybeFlashback(ctx);
  if (ctx.engine.offline) await applyPretaught(ctx, round);
  await setLocal('played', true);
  await playRound(ctx);
}

/** A round from a real page: the background stored the capture and the sealed lesson. */
async function playLive(id: string): Promise<void> {
  const handoff = await getSession<RoundHandoff>(`round:${id}`);
  if (!handoff) throw new Error('This round has expired. Click the Spark button on a page to start a new one.');
  const engine = onDevice(new ServerEngine(handoff.server, handoff.lesson, handoff.seed, handoff.offline), handoff.capture.text, true);
  setSpeed(1);
  const firstRound = !(await getLocal('played', false));
  const ctx = baseCtx(engine, await currentTraits(), firstRound, TEACH ?? TEACH_SECONDS, await coachFocus());
  ctx.capture = handoff.capture;
  ctx.pageText = handoff.capture.text;
  // The monster's texture is the page's own words (SPEC §6), whatever the server returned.
  const pageWords = distinctiveWords(handoff.capture.text, MONSTER_WORDS);
  if (pageWords.length >= 40) ctx.monster.words = pageWords;
  ctx.onPlayAgain = () => go(`game.html?round=${encodeURIComponent(id)}`);
  failOver(ctx, handoff.roundId ? await loadDemoRound(handoff.roundId).catch(() => null) : null);
  await formingScreen(ctx, [], null);
  await maybeFlashback(ctx);
  await setLocal('played', true);
  await playRound(ctx);
}

/** A monster comes back for its weak idea; the others are already beaten (SPEC §17). */
async function playComeback(id: string): Promise<void> {
  const memory = await loadMemory();
  const cb = memory.comebacks.find((c) => c.id === id);
  if (!cb) {
    errorScreen('This monster is already tamed. Blot ate the whole thing.', false, 'Nothing to fight here.');
    return;
  }
  const locks = Object.fromEntries(cb.ideas.filter((i) => i.id !== cb.ideaId).map((i) => [i.id, lockedScore(i.score)]));
  const round = cb.demoId ? await loadDemoRound(cb.demoId).catch(() => null) : null;
  let inner: RoundEngine;
  if (round) {
    inner = new DemoEngine(round);
  } else {
    const lesson: SealedLesson = {
      lessonId: `comeback-${cb.id}`,
      topic: cb.topic,
      monsterName: cb.monsterName,
      monsterShape: cb.shape,
      language: cb.language,
      ideas: cb.ideas.map((i) => ({
        id: i.id,
        name: i.name,
        whenOptions: [],
        asksWhy: i.id === cb.ideaId && cb.keyPoints.length >= 2,
        sourceUrl: i.id === cb.ideaId ? cb.sourceUrl : null,
        sourceTitle: i.id === cb.ideaId ? cb.sourceTitle : null,
      })),
      words: cb.words,
    };
    const grade = async (answer: string) => {
      const card = { ideaName: cb.ideaName, question: cb.question, modelAnswer: cb.modelAnswer, keyPoints: cb.keyPoints, language: cb.language };
      try {
        return await postJson<{ score: number; feedback: string }>('/recall', { ...card, answer }, 9000);
      } catch {
        return { score: recallScore(card, answer), feedback: '' };
      }
    };
    inner = new ComebackEngine(lesson, cb.createdAt >>> 0, { ideaId: cb.ideaId, ideaName: cb.ideaName, question: cb.question, modelAnswer: cb.modelAnswer, keyPoints: cb.keyPoints }, grade);
  }
  setSpeed(FAST ? 12 : round ? DEMO_SPEED : 1);
  const ctx = baseCtx(new LockedEngine(inner, locks), await currentTraits(memory), false, TEACH ?? (FAST ? 30 : COMEBACK_SECONDS));
  Object.assign(ctx, {
    kind: 'comeback',
    comeback: cb,
    locked: locks,
    focus: cb.ideaId,
    misreads: [],
    demoId: cb.demoId,
    demo: round,
    fullLesson: round?.lesson ?? null,
    monster: { name: cb.monsterName, shape: cb.shape, color: cb.color, words: cb.words.length >= 40 ? cb.words : ctx.lesson.words },
  } satisfies Partial<RoundCtx>);
  // The beaten ideas start full.
  for (const [ideaId, value] of Object.entries(locks)) Object.assign(ctx.progress[ideaId]!, { value, raw: value, belief: 'right', said: true, asked: true });
  ctx.onPlayAgain = () => (ctx.after.tamed ? go(cb.demoId ? `game.html?demo=${encodeURIComponent(cb.demoId)}` : 'game.html') : location.reload());
  await formingScreen(ctx, [], null);
  await playRound(ctx);
}

/** A friend's challenge: the same page and seed, then Blot vs Blot (SPEC §17). */
async function playDuel(token: string): Promise<void> {
  let challenge: DuelChallenge | null = null;
  let round: DemoRound | null = null;
  let engine: RoundEngine;
  let page: { url: string; title: string } | null = null;
  const local = isLocalDuel(token);
  if (local) {
    challenge = decodeLocalDuel(token);
    if (!challenge?.demo) throw new Error('This challenge link is broken. Ask your friend to send it again.');
    round = await loadDemoRound(challenge.demo);
    engine = new DemoEngine(round);
  } else if (isServerDuelCode(token)) {
    type Joined = { lesson: SealedLesson; seed: number; offline: boolean; roundId: string | null; page: typeof page; challenge: unknown };
    const data = await postJson<Joined>('/duel/join', { code: token }).catch((err: unknown) => {
      throw new Error(err instanceof ServerError && err.status === 410 ? 'This challenge has expired. Ask your friend for a new one.' : 'Spark can’t reach its server to open this challenge. Try again in a moment.');
    });
    challenge = readChallenge(data.challenge);
    if (!challenge) throw new Error('This challenge link is broken. Ask your friend to send it again.');
    page = data.page;
    engine = new ServerEngine(await serverBase(), data.lesson, data.seed, data.offline);
    round = data.roundId ? await loadDemoRound(data.roundId).catch(() => null) : null;
  } else {
    throw new Error('This challenge link is broken. Ask your friend to send it again.');
  }
  setSpeed(FAST ? 12 : local ? DEMO_SPEED : 1);
  const firstRound = !(await getLocal('played', false));
  // A fair fight: the same teaching time the challenger had, and no coaching or power-ups.
  const ctx = baseCtx(engine, await currentTraits(), firstRound, TEACH ?? (FAST ? 30 : local ? DEMO_TEACH_SECONDS : TEACH_SECONDS));
  ctx.kind = 'duel';
  ctx.duel = challenge;
  ctx.demoId = local ? challenge.demo : null;
  ctx.onPlayAgain = () => location.reload();
  await duelIntroScreen(ctx, challenge, page, local);
  if (local && round) {
    ctx.demo = round;
    ctx.fullLesson = round.lesson;
    ctx.pageSrc = round.page;
    const { boxes, text, frame } = await pageScreen(ctx);
    ctx.pageText = text;
    await formingScreen(ctx, boxes, frame);
  } else {
    failOver(ctx, round);
    await formingScreen(ctx, [], null);
  }
  await setLocal('played', true);
  await playRound(ctx);
}

/** Your Blot, and the flashbacks started from it. */
async function showYourBlot(): Promise<void> {
  setSpeed(1);
  for (;;) {
    const memory = await loadMemory();
    const traits = await currentTraits(memory);
    const action = await yourBlotScreen(memory, await loadHistory(), traits);
    if (action.kind === 'remind') {
      await flashbackScreen({ card: action.card, traits, continueLabel: 'Back to Your Blot', onHome: goHome });
      continue;
    }
    if (action.kind === 'comeback') go(`game.html?comeback=${encodeURIComponent(action.id)}`);
    else if (action.kind === 'play') go('game.html?demo=tides');
    else goHome();
    return;
  }
}

async function showHome(): Promise<void> {
  setSpeed(1);
  const memory = await loadMemory();
  const history = await loadHistory();
  const t = now();
  homeScreen({
    traits: await currentTraits(memory),
    onDemo: (id) => go(`game.html?demo=${encodeURIComponent(id)}`),
    returning: history.length > 0 || memory.cards.length > 0,
    dueCard: dueCard(memory.cards, t),
    comeback: dueComebacks(memory, t)[0] ?? null,
    onBlot: () => go('game.html?blot=1'),
    onComeback: (id) => go(`game.html?comeback=${encodeURIComponent(id)}`),
  });
}

function errorScreen(message: string, again = false, title?: string): void {
  const root = showScreen('error', { home: goHome });
  root.append(
    h(
      'div',
      { class: 'error-card' },
      h('h1', null, title ?? (again ? 'The round expired.' : 'Blot spilled the ink.')),
      h('p', null, message),
      again
        ? primary('btn-try-again', 'Play it again', () => location.reload())
        : primary('btn-try-demo', 'Play the demo instead', () => go('game.html?demo=tides')),
      secondary('btn-error-home', 'Home', goHome),
    ),
  );
}

async function boot(): Promise<void> {
  await initSound();
  try {
    const demo = params.get('demo');
    const round = params.get('round');
    const duel = params.get('duel');
    const comeback = params.get('comeback');
    if (demo) await playDemo(demo);
    else if (round) await playLive(round);
    else if (duel) await playDuel(duel);
    else if (comeback) await playComeback(comeback);
    else if (params.get('blot') === '1') await showYourBlot();
    else await showHome();
  } catch (err) {
    console.warn(err);
    errorScreen(err instanceof Error ? err.message : 'Something went wrong.');
  }
}

void boot();
