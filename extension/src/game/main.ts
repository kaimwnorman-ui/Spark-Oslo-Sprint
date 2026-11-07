// Spark's game tab: home, demo rounds (?demo=tides) and, from M3, rounds from real pages.
import { CLIENT_TOKEN, DEMO_SPEED, DEMO_TEACH_SECONDS, MONSTER_WORDS, SERVER_URL, TEACH_SECONDS, TRAITS_WORN } from '../../../shared/config.ts';
import { misreadIdeaIds, monsterInk } from '../../../shared/round.ts';
import type { RoundHandoff, SealedLesson, Trait } from '../../../shared/types.ts';
import { distinctiveWords } from '../../../shared/words.ts';
import { ServerEngine } from './server-engine.ts';
import { setSpeed } from './anim.ts';
import { newProgress, type RoundCtx } from './context.ts';
import { h } from './dom.ts';
import { DemoEngine, loadDemoRound, type RoundEngine } from './engine.ts';
import { linesFor } from './lines.ts';
import { initSound } from './sound.ts';
import { getLocal, getSession, setLocal } from './storage.ts';
import { primary, secondary, showScreen } from './ui.ts';
import { formingScreen, homeScreen, pageScreen } from './screens/intro.ts';
import { teachScreen } from './screens/teach.ts';
import { boutScreen, eatScreen, examScreen, loseScreen } from './screens/fight.ts';
import { replayScreen } from './screens/replay.ts';

const params = new URLSearchParams(location.search);
/** Tests only: run the whole round near-instantly. */
const FAST = params.has('fast');
/** Demo page, but through the server (real AI, or AI_STUB). */
const LIVE = params.get('live') === '1';
/** Optional teaching time in seconds (presenters, tests). */
const TEACH = Math.min(300, Math.max(20, Number(params.get('teach')) || 0)) || null;

const goHome = () => {
  location.href = 'game.html';
};

async function wornTraits(): Promise<Trait[]> {
  return (await getLocal<Trait[]>('traits', [])).slice(-TRAITS_WORN);
}

function baseCtx(engine: RoundEngine, traits: Trait[], firstRound: boolean, teachSeconds: number): RoundCtx {
  const lesson = engine.lesson;
  return {
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
    misreads: misreadIdeaIds(lesson.ideas.map((i) => i.id), engine.seed),
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
  };
}

/** Teach → exam → bout → eat or escape (→ rematch) → replay. */
async function playRound(ctx: RoundCtx): Promise<void> {
  for (;;) {
    await teachScreen(ctx);
    await examScreen(ctx);
    await boutScreen(ctx);
    if (ctx.bout?.outcome === 'win') {
      await eatScreen(ctx);
      break;
    }
    const choice = await loseScreen(ctx);
    if (choice === 'replay') break;
    ctx.attempt++;
  }
  const next = await replayScreen(ctx);
  if (next === 'again') ctx.onPlayAgain();
  else ctx.onHome();
}

async function playDemo(id: string): Promise<void> {
  const round = await loadDemoRound(id);
  const demoEngine = new DemoEngine(round);
  setSpeed(FAST ? 12 : DEMO_SPEED);
  const firstRound = !(await getLocal('played', false));
  const ctx = baseCtx(demoEngine, await wornTraits(), firstRound, TEACH ?? (FAST ? 30 : DEMO_TEACH_SECONDS));
  ctx.demo = round;
  ctx.fullLesson = round.lesson;
  ctx.pageSrc = round.page;
  const { boxes, text, frame, capture } = await pageScreen(ctx);
  ctx.pageText = text;
  if (LIVE) {
    // ?live=1: the same demo page, but the lesson and Blot come from the server (real AI or AI_STUB).
    const server = (await getLocal<string>('serverUrl', '')) || SERVER_URL;
    const res = await fetch(`${server}/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-spark': CLIENT_TOKEN },
      body: JSON.stringify({ capture: { url: new URL(round.page, location.href).href, title: capture.title, text: capture.text, links: capture.links, source: 'page' } }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `The server answered ${res.status}.`);
    const data = (await res.json()) as { lesson: SealedLesson; seed: number; offline: boolean };
    const live = baseCtx(new ServerEngine(server, data.lesson, data.seed, data.offline), ctx.traits, firstRound, ctx.teachSeconds);
    Object.assign(ctx, { engine: live.engine, lesson: live.lesson, misreads: live.misreads, progress: live.progress, monster: { ...live.monster, words: ctx.monster.words }, fullLesson: null });
  }
  await formingScreen(ctx, boxes, frame);
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
  const ctx = baseCtx(engine, await wornTraits(), firstRound, TEACH ?? TEACH_SECONDS);
  ctx.capture = handoff.capture;
  ctx.pageText = handoff.capture.text;
  // The monster's texture is the page's own words (SPEC §6), whatever the server returned.
  const pageWords = distinctiveWords(handoff.capture.text, MONSTER_WORDS);
  if (pageWords.length >= 40) ctx.monster.words = pageWords;
  ctx.onPlayAgain = () => (location.href = `game.html?round=${encodeURIComponent(id)}`);
  await formingScreen(ctx, [], null);
  await setLocal('played', true);
  await playRound(ctx);
}

function errorScreen(message: string): void {
  const root = showScreen('error', { home: goHome });
  root.append(
    h(
      'div',
      { class: 'error-card' },
      h('h1', null, 'Blot spilled the ink.'),
      h('p', null, message),
      primary('btn-try-demo', 'Play the demo instead', () => (location.href = 'game.html?demo=tides')),
      secondary('btn-error-home', 'Home', goHome),
    ),
  );
}

async function boot(): Promise<void> {
  await initSound();
  const demo = params.get('demo');
  const round = params.get('round');
  try {
    if (demo) {
      await playDemo(demo);
      return;
    }
    if (round) {
      await playLive(round);
      return;
    }
    setSpeed(1);
    homeScreen(await wornTraits(), (id) => (location.href = `game.html?demo=${encodeURIComponent(id)}`));
  } catch (err) {
    console.warn(err);
    errorScreen(err instanceof Error ? err.message : 'Something went wrong.');
  }
}

void boot();
