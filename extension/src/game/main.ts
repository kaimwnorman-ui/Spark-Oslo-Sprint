// Spark's game tab: home, demo rounds (?demo=tides) and, from M3, rounds from real pages.
import { DEMO_SPEED, DEMO_TEACH_SECONDS, TEACH_SECONDS, TRAITS_WORN } from '../../../shared/config.ts';
import { misreadIdeaIds, monsterInk } from '../../../shared/round.ts';
import type { Trait } from '../../../shared/types.ts';
import { setSpeed } from './anim.ts';
import { newProgress, type RoundCtx } from './context.ts';
import { h } from './dom.ts';
import { DemoEngine, loadDemoRound, type RoundEngine } from './engine.ts';
import { linesFor } from './lines.ts';
import { initSound } from './sound.ts';
import { getLocal, setLocal } from './storage.ts';
import { primary, secondary, showScreen } from './ui.ts';
import { formingScreen, homeScreen, pageScreen } from './screens/intro.ts';
import { teachScreen } from './screens/teach.ts';
import { boutScreen, eatScreen, examScreen, loseScreen } from './screens/fight.ts';
import { replayScreen } from './screens/replay.ts';

const params = new URLSearchParams(location.search);
/** Tests only: run the whole round near-instantly. */
const FAST = params.has('fast');

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
  const engine = new DemoEngine(round);
  setSpeed(FAST ? 12 : DEMO_SPEED);
  const firstRound = !(await getLocal('played', false));
  const ctx = baseCtx(engine, await wornTraits(), firstRound, FAST ? 30 : DEMO_TEACH_SECONDS);
  ctx.demo = round;
  ctx.fullLesson = round.lesson;
  ctx.pageSrc = round.page;
  const { boxes, text, frame } = await pageScreen(ctx);
  ctx.pageText = text;
  await formingScreen(ctx, boxes, frame);
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
  try {
    if (demo) {
      await playDemo(demo);
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
void TEACH_SECONDS;
