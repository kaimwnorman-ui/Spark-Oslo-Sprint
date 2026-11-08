// Spark's game tab: home, demo rounds (?demo=tides), rounds from real pages (?round=), and the
// learning loop (SPEC §17): Your Blot (?blot=1), comebacks (?comeback=), duels (?duel=).
import { COMEBACK_SECONDS, DEMO_SPEED, MISREAD_COUNT, MONSTER_WORDS, TEACH_SECONDS } from '../../../shared/config.ts';
import { teachSeconds } from '../../../shared/params.ts';
import { barValue } from '../../../shared/bars.ts';
import { decodeLocalDuel, isLocalDuel, isServerDuelCode, readChallenge, type DuelChallenge } from '../../../shared/duel.ts';
import { focusCodes, insights, summarizeRound, type FocusCode } from '../../../shared/insights.ts';
import {
  afterRematch, comebackId, dropComeback, dueCard, dueComebacks, gradeRecall, intervalDays, lockedScore, planComeback, recordCards,
  spendPowerUps, upsertComeback,
} from '../../../shared/memory.ts';
import { misreadIdeaIds, monsterInk } from '../../../shared/round.ts';
import type { DemoRound, Move, RoundHandoff, SealedLesson, Trait } from '../../../shared/types.ts';
import { distinctiveWords } from '../../../shared/words.ts';
import { setSpeed } from './anim.ts';
import { newProgress, ownIdeaIds, scriptedIdeaIds, type IdeaProgress, type RoundCtx } from './context.ts';
import { h } from './dom.ts';
import { ComebackEngine, DemoEngine, LockedEngine, OfflineEngine, loadDemoRound, type RoundEngine } from './engine.ts';
import { linesFor } from './lines.ts';
import { clearMyData, currentTraits, loadHistory, loadMemory, navUrl, now, recordRound, saveMemory, updateMemory } from './memory-store.ts';
import { ServerEngine, ServerError, postJson, serverBase } from './server-engine.ts';
import { initSound } from './sound.ts';
import { getLocal, getSession, setLocal } from './storage.ts';
import { primary, secondary, setLeaveGuard, showOfflineNote, showScreen } from './ui.ts';
import { formingScreen, homeScreen, pageScreen } from './screens/intro.ts';
import { teachScreen } from './screens/teach.ts';
import { boutScreen, eatScreen, examScreen, loseScreen } from './screens/fight.ts';
import { replayScreen } from './screens/replay.ts';
import { resumeScreen } from './screens/resume.ts';
import { RESUME_MIN_MS, clearRound, fingerprintOf, loadRound, saveRound, taughtCount, type RoundSave } from './resume.ts';
import { flashbackScreen } from './screens/flashback.ts';
import { yourBlotScreen } from './screens/your-blot.ts';
import { presenterScreen } from './screens/presenter.ts';
import { presenterSeed } from '../../../shared/presenter.ts';
import { duelBoutScreen, duelIntroScreen, duelResultScreen } from './screens/duel.ts';

const params = new URLSearchParams(location.search);
/** Tests only: run the whole round near-instantly. */
const FAST = params.has('fast');
/** Demo page, but through the server (real AI, or AI_STUB). */
const LIVE = params.get('live') === '1';
/** Optional teaching time in seconds (presenters, tests); null when absent, so the real default applies. */
const TEACH = teachSeconds(params.get('teach'));

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
    stage: null,
    resumeKey: null,
    resumeRemainingMs: null,
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
    // Only the server engine can fail; the local engines (canned or offline Blot) never do.
    if (!(ctx.engine instanceof ServerEngine)) return;
    if (err instanceof ServerError && err.status === 410) {
      errorScreen(ctx.lines.expired, true);
      return;
    }
    const sameLesson = !!canned && canned.lesson.ideas.every((i, n) => ctx.lesson.ideas[n]?.name === i.name);
    ctx.engine = sameLesson ? new DemoEngine(canned!, ctx.lesson) : new OfflineEngine(ctx.lesson, ctx.engine.seed);
    // An offline Blot cannot reveal a hidden misreading, so it stops holding any.
    if (!sameLesson) {
      ctx.misreads = [];
      for (const p of Object.values(ctx.progress)) if (p.belief === 'misread') p.belief = 'right';
    }
    showOfflineNote(ctx.lines.offline);
  };
}

/** Stage round: some ideas arrive already taught (SPEC §13): done, with their grades, and no time left to earn on them. */
async function applyPretaught(ctx: RoundCtx, round: DemoRound): Promise<void> {
  if (!round.pretaught?.length) return;
  ctx.misreads = [];
  for (const e of round.pretaught) {
    ctx.transcript.push(e);
    const p = ctx.progress[e.ideaId]!;
    if (e.move !== 'same' && e.move !== 'dontknow') p.moves.push(e.move as Move);
    Object.assign(p, { belief: 'right', step: 'done', earned: { ready: true, mastered: true, caught: true } } satisfies Partial<IdeaProgress>);
  }
  for (const id of new Set(round.pretaught.map((e) => e.ideaId))) {
    const p = ctx.progress[id]!;
    const grade = await ctx.engine.grade(id, ctx.transcript);
    p.raw = grade.score;
    p.tip = grade.tip;
    p.value = barValue(p.moves, p.raw);
  }
}

// ---------------------------------------------------------------- the learning loop around a round

/** Whether this round ran on the server's AI (a real page, or a demo page played through it): only then may a recall be graded there. */
function isLive(ctx: RoundCtx): boolean {
  return ctx.demoId === null && ctx.engine instanceof ServerEngine && !ctx.engine.offline;
}

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
  // Only what the player taught themselves becomes a memory: not a comeback's beaten ideas, not the
  // stage round's pre-taught ones.
  const own = ownIdeaIds(ctx);
  const taught = { results: ctx.exam!.results.filter((r) => own.has(r.id)) };
  const rec = recordCards(
    memory,
    { live: isLive(ctx), monster: { name: ctx.monster.name, color: ctx.monster.color }, topic: ctx.lesson.topic, language: ctx.lesson.language, ideas: ctx.lesson.ideas, exam: taught },
    now(),
  );
  ctx.cardIds = { ...ctx.cardIds, ...rec.ids };
  await saveMemory(rec.state);
}

/** After the round: history (for insights), the monster's comeback, and what to tell the player. */
async function closeRound(ctx: RoundCtx, outcome: 'win' | 'lose' | 'draw'): Promise<void> {
  const t = now();
  ctx.after.recallDays = Object.keys(ctx.cardIds).length ? intervalDays(0) : null;
  // The stage round is a rehearsal: it leaves no history and no comeback behind.
  if (ctx.stage) return;
  // A comeback counts only the idea it was about: the beaten ones were not taught again.
  const own = ownIdeaIds(ctx);
  const scripted = scriptedIdeaIds(ctx);
  const history = await recordRound(
    summarizeRound({
      at: t, topic: ctx.lesson.topic, monsterName: ctx.monster.name, outcome, ideas: ctx.lesson.ideas.filter((i) => own.has(i.id) || !scripted.has(i.id)),
      transcript: ctx.transcript, exam: ctx.exam!, kind: ctx.kind,
    }),
  );
  ctx.after.tip = insights(history)[0] ?? null;
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
        live: isLive(ctx),
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

// ---------------------------------------------------------------- resuming a round after a reload (SPEC §18)

const fingerprintFor = (ctx: RoundCtx) => fingerprintOf(ctx.lesson.ideas.map((i) => i.name), ctx.engine.seed);

/** Keeps this round in the tab as it is taught, so a reload (or Back and Forward) can pick it up again. */
function makeResumable(ctx: RoundCtx, key: string): void {
  ctx.resumeKey = key;
  ctx.persist = (remainingMs) =>
    saveRound(key, {
      v: 2,
      at: Date.now(),
      fingerprint: fingerprintFor(ctx),
      transcript: ctx.transcript,
      progress: ctx.progress,
      misreads: ctx.misreads,
      remainingMs,
      attempt: ctx.attempt,
      focus: ctx.focus,
      pageText: ctx.pageText,
    });
}

/** What the player had taught is back, with the time that was left (at least ten seconds). */
function restoreRound(ctx: RoundCtx, saved: RoundSave): void {
  Object.assign(ctx, {
    transcript: saved.transcript,
    progress: saved.progress,
    misreads: saved.misreads,
    attempt: saved.attempt,
    focus: saved.focus,
    pageText: saved.pageText || ctx.pageText,
    resumeRemainingMs: Math.max(RESUME_MIN_MS, saved.remainingMs),
  } satisfies Partial<RoundCtx>);
}

/** Offers a saved round for this lesson; true when the player resumed it (the caller then skips the reveal). */
async function offerResume(ctx: RoundCtx, key: string): Promise<boolean> {
  const saved = loadRound(key, fingerprintFor(ctx));
  if (!saved || taughtCount(saved) + saved.transcript.length === 0) return false;
  const choice = await resumeScreen({
    monsterName: ctx.monster.name,
    taught: taughtCount(saved),
    total: ctx.lesson.ideas.length,
    remainingMs: Math.max(RESUME_MIN_MS, saved.remainingMs),
    onHome: ctx.onHome,
  });
  if (choice === 'restart') {
    clearRound(key);
    return false;
  }
  restoreRound(ctx, saved);
  return true;
}

/** Teach → exam → bout → eat or escape (→ rematch) → replay. A duel ends in Blot vs Blot. */
async function playRound(ctx: RoundCtx): Promise<void> {
  let outcome: 'win' | 'lose' | 'draw' = 'lose';
  // Leaving mid-round loses it, so the browser asks first (only once there is something to lose).
  setLeaveGuard(() => ctx.transcript.length > (ctx.stage?.entries ?? 0) || !!document.querySelector<HTMLTextAreaElement>('#teach-input')?.value.trim());
  for (;;) {
    await teachScreen(ctx);
    // Power-ups belong to real fights: a rehearsal and a duel do not spend them.
    if (ctx.kind !== 'duel' && !ctx.stage) await useBoosts(ctx);
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
  setLeaveGuard(null);
  if (ctx.resumeKey) clearRound(ctx.resumeKey);
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
  const ctx = baseCtx(demoEngine, await currentTraits(), firstRound, TEACH ?? (FAST ? 30 : TEACH_SECONDS), stage ? [] : await coachFocus());
  ctx.demo = round;
  ctx.demoId = round.id;
  ctx.fullLesson = round.lesson;
  ctx.pageSrc = round.page;
  // The stage round: four ideas are taught for the player, one is left. Labelled before anything else is shown.
  const setUpStage = () => {
    if (!stage || !ctx.engine.offline) return;
    const taught = [...new Set(round.pretaught!.map((e) => e.ideaId))];
    ctx.stage = { ideas: taught, entries: round.pretaught!.length };
    ctx.focus = ctx.lesson.ideas.find((i) => !taught.includes(i.id))?.id ?? null;
  };
  setUpStage();
  if (!LIVE) {
    // A reload or Back and Forward in the middle of a round offers to pick it up again (SPEC §18).
    const key = `demo:${id}`;
    makeResumable(ctx, key);
    if (await offerResume(ctx, key)) {
      await setLocal('played', true);
      await playRound(ctx);
      return;
    }
  }
  const { boxes, text, frame, capture } = await pageScreen(ctx);
  ctx.pageText = text;
  if (LIVE) {
    // ?live=1: the same demo page, but the lesson and Blot come from the server (real AI or AI_STUB).
    const server = await serverBase();
    const data = await postJson<{ lesson: SealedLesson; seed: number; offline: boolean }>('/extract', {
      capture: { url: new URL(round.page, location.href).href, title: capture.title, text: capture.text, links: capture.links, source: 'page' },
    }, 60_000).catch(() => null);
    if (data) {
      const live = baseCtx(new ServerEngine(server, data.lesson, data.seed, data.offline), ctx.traits, firstRound, ctx.teachSeconds, ctx.coach);
      Object.assign(ctx, { engine: live.engine, lesson: live.lesson, misreads: live.misreads, progress: live.progress, monster: { ...live.monster, words: ctx.monster.words }, fullLesson: null, demoId: null, stage: null, focus: null });
      failOver(ctx, round);
    } else {
      // No server: this page has a canned round, so play it offline.
      showOfflineNote(ctx.lines.offline);
    }
  }
  setUpStage();
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
  const engine = new ServerEngine(handoff.server, handoff.lesson, handoff.seed, handoff.offline);
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
  makeResumable(ctx, `round:${id}`);
  if (await offerResume(ctx, `round:${id}`)) {
    await setLocal('played', true);
    await playRound(ctx);
    return;
  }
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
    // A real page's rematch is graded by the server's AI when this comeback came from a live round; otherwise here.
    const grade = async (answer: string) => {
      const card = { ideaName: cb.ideaName, question: cb.question, modelAnswer: cb.modelAnswer, keyPoints: cb.keyPoints, language: cb.language };
      if (cb.live ?? true) {
        try {
          return await postJson<{ score: number; feedback: string }>('/recall', { ...card, answer }, 9000);
        } catch {
          // The server is away: grade here.
        }
      }
      return { score: gradeRecall(card, answer).score, feedback: '' };
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
  // The beaten ideas start full, done, and with no time left to earn.
  for (const [ideaId, value] of Object.entries(locks)) {
    Object.assign(ctx.progress[ideaId]!, { value, raw: value, belief: 'right', step: 'done', earned: { ready: true, mastered: true, caught: true } } satisfies Partial<IdeaProgress>);
  }
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
  const ctx = baseCtx(engine, await currentTraits(), firstRound, TEACH ?? (FAST ? 30 : TEACH_SECONDS));
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
    if (action.kind === 'clear') {
      await clearMyData();
      goHome();
      return;
    }
    if (action.kind === 'comeback') go(`game.html?comeback=${encodeURIComponent(action.id)}`);
    else if (action.kind === 'play') go('game.html?demo=tides');
    else goHome();
    return;
  }
}

/** ?seed=presenter: loads a learner who played two pages a few days ago (shared/presenter.ts), for the three-minute pitch. */
async function loadPresenterKit(): Promise<void> {
  setSpeed(1);
  const memory = await loadMemory();
  if (memory.cards.length || (await loadHistory()).length) {
    // Never overwrite a real learner: the kit only loads into a browser with no history.
    errorScreen('This browser already has learning history. Erase it first (Your Blot → Clear my data), or open this link in a fresh browser profile.', false, 'The presenter kit was not loaded');
    return;
  }
  const [lost, won] = await Promise.all([loadDemoRound('tides'), loadDemoRound('pvalue')]);
  const seed = presenterSeed({ lost, won, wonIdeas: ['i1', 'i2', 'i4'] }, Date.now());
  await saveMemory(seed.memory);
  await setLocal('history', seed.history);
  await setLocal('traits', seed.traits);
  await setLocal('played', true);
  presenterScreen(seed, goHome);
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
    else if (params.get('seed') === 'presenter') await loadPresenterKit();
    else await showHome();
  } catch (err) {
    console.warn(err);
    errorScreen(err instanceof Error ? err.message : 'Something went wrong.');
  }
}

void boot();
