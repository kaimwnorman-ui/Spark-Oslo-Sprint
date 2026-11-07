// npm run smoke:demo: plays the demo round end to end in Chromium, the way a player would.
// Opens game.html?demo=tides (served from extension/dist/), drives the round's scripted player,
// rings the bell, watches the bout, and checks: the screens appear in order, no console errors,
// and the set pieces' timing (SPEC §2, M2). A 1280x720 screenshot per screen goes to docs/shots/.
//   --fast       run everything near-instantly (skips the timing checks)
//   --no-art     block the generated art too: the placeholders must carry the demo
//   --reduced    emulate prefers-reduced-motion
//   --live       through the server with AI_STUB=1 (the M5 checks: all five moves, the misreading
//                reveal, "I don't know", pause and resume)
//   --real       through the server with the real AI: bars move within 1 s, the round reaches the exam
//   --headed     watch it
// kie.ai is always blocked: the game never needs it at runtime.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, DIST } from './lib.mjs';
import { serveDir } from './serve.mjs';

const fast = process.argv.includes('--fast');
const headed = process.argv.includes('--headed');
const noArt = process.argv.includes('--no-art');
const reduced = process.argv.includes('--reduced');
/** Teach nothing: Blot must lose, and the escape screen must offer a rematch. */
const lose = process.argv.includes('--lose');
const real = process.argv.includes('--real');
const live = real || process.argv.includes('--live');
const SERVER = 'http://localhost:8787';
const roundId = process.env.SMOKE_ROUND ?? 'tides';
const SHOTS = process.env.SMOKE_SHOTS ?? path.join(ROOT, 'docs', 'shots');
mkdirSync(SHOTS, { recursive: true });
const round = JSON.parse(readFileSync(path.join(ROOT, 'demo', 'rounds', `${roundId}.json`), 'utf8'));

const server = await serveDir(DIST);

// --live / --real: the Spark server on :8787 (stubbed, or with the real AI).
let api = null;
if (live) {
  const up = await fetch(`${SERVER}/health`).then((r) => r.ok, () => false);
  if (up) {
    console.error('smoke:demo --live needs port 8787 free. Stop the running server and try again.');
    process.exit(1);
  }
  const env = { ...process.env, PORT: '8787', AI_STUB: real ? '0' : '1' };
  api = spawn(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', 'server/src/main.ts'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  api.stdout.on('data', (d) => process.env.SMOKE_VERBOSE && process.stdout.write(d));
  for (let i = 0; i < 50 && !(await fetch(`${SERVER}/health`).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 200));
}
const browser = await chromium.launch({ headless: !headed });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
const errors = [];
await page.route(/kie\.ai/, (route) => route.abort());
if (noArt) await page.route(/\/assets\/[^/]+\.webp$/, (route) => route.abort());
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  // Blocked art is expected in --no-art mode; anything else is a real error.
  if (noArt && /Failed to load resource/.test(msg.text())) return;
  errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(err.message));
const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${lose ? 'lose-' : ''}${name}.png`) });
const log = (...a) => console.log('  ·', ...a);

async function blotDone() {
  // Blot has answered when the teach screen is no longer busy and nothing is typing.
  await page.waitForTimeout(60);
  await page.waitForFunction(
    () => !document.querySelector('.bubble.typing') && document.querySelector('#screen-teach')?.getAttribute('data-busy') !== '1',
    null,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(fast ? 50 : 250);
}
const teaching = async () => (await page.locator('#screen-teach').count()) > 0;

const barTimes = [];
const realBarTimes = [];
/** An idea's counters: instant ink ticks and real live-bars answers (set by the teach screen). */
const counters = (id) => page.evaluate((i) => {
  const el = document.querySelector(`.idea[data-id="${i}"]`);
  return { ticks: Number(el?.dataset.ticks ?? 0), answers: Number(el?.dataset.answers ?? 0) };
}, id);
/** Sends the message and times the bar's feedback: the instant ink tick, then the live-bars answer. */
async function sendTimed(ideaId) {
  const before = await counters(ideaId);
  const t0 = Date.now();
  await page.click('#btn-send');
  const until = (key) => page.waitForFunction(([i, k, n]) => Number(document.querySelector(`.idea[data-id="${i}"]`)?.dataset[k] ?? 0) > n, [ideaId, key, before[key]], { timeout: 10_000 }).then(() => Date.now() - t0, () => 10_000);
  barTimes.push(await until('ticks'));
  void until('answers').then((ms) => realBarTimes.push(ms));
}

/** "I don't know" on a why → source card; hiding the tab pauses the round; coming back resumes it. */
async function dontKnowPauseResume() {
  await page.click('.idea[data-id="i5"]');
  await page.fill('#teach-input', 'Coastlines decide how big the tides get, a funnel bay makes them much bigger.');
  await sendTimed('i5');
  await blotDone();
  await page.locator('#question').waitFor({ timeout: 12_000 });
  await blotDone();
  await page.click('#btn-dontknow');
  await page.locator('#source-card').waitFor({ timeout: 5000 });
  await shot('05b-source-card');
  checks.push([true, '"I don\'t know" shows a source card']);
  const setHidden = (hidden) =>
    page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  await setHidden(true);
  const t1 = await page.textContent('#timer');
  await page.waitForTimeout(2200);
  const t2 = await page.textContent('#timer');
  const paused = (await page.locator('#timer.paused').count()) === 1;
  checks.push([paused && t1 === t2, `hiding the tab pauses the round (timer ${t1} → ${t2})`]);
  await setHidden(false);
  await page.waitForFunction(() => /why/i.test(document.querySelector('.teach-bubble')?.textContent ?? ''), null, { timeout: 5000 });
  const resumed = (await page.locator('#question').count()) === 1 && (await page.locator('#timer.paused').count()) === 0;
  checks.push([resumed, 'coming back resumes it, and Blot asks "so, why?"']);
}

async function play(entry) {
  if (!(await teaching())) return false;
  const { ideaId, move } = entry;
  if (move === 'why') {
    await page.locator('#question').waitFor({ timeout: 10_000 });
    await blotDone();
    await page.fill('#teach-input', entry.text);
    await sendTimed(ideaId);
    await blotDone();
    return true;
  }
  const fixing = (await page.locator('#panel[data-kind="fix"]').count()) > 0;
  if (!fixing) {
    await page.click(`.idea[data-id="${ideaId}"]`);
    await page.click(`.move[data-move="${move}"]`);
  }
  if (move === 'say' || move === 'example') {
    await page.fill('#teach-input', entry.text);
    await sendTimed(ideaId);
    await blotDone();
  } else if (move === 'when') {
    await page.click(`.when-option[data-index="${entry.tap}"]`);
    await blotDone();
  } else if (move === 'check') {
    await page.locator('#btn-check-yes').waitFor({ timeout: 15_000 });
    const said = (await page.textContent('.teach-bubble')) ?? '';
    const idea = round.lesson.ideas.find((i) => i.id === ideaId);
    if (entry.tap === 'no') misreadReveals.push({ ideaId, said, misread: idea.misread });
    await page.click(entry.tap === 'yes' ? '#btn-check-yes' : '#btn-check-no');
    await page.waitForTimeout(fast ? 50 : 400);
  }
  return true;
}

let failed = false;
const checks = [];
const misreadReveals = [];
try {
  const started = Date.now();
  // The scripted player needs ~50 s; the demo's 45 s timer is for people, so the smoke gives it more.
  const query = `demo=${roundId}${fast ? '&fast=1' : ''}${live ? '&live=1&teach=150' : '&teach=90'}`;
  await page.goto(`${server.url}/game.html?${query}`);
  await page.locator('#btn-transform').waitFor();
  await page.waitForTimeout(800);
  await shot('01-page');
  log('page');

  await page.click('#btn-transform');
  await page.locator('#screen-forming').waitFor();
  await page.waitForTimeout(fast ? 100 : 1100);
  await shot('02-forming-swirl');
  await page.locator('#btn-teach:not(.hidden)').waitFor({ timeout: 20_000 });
  await shot('03-monster');
  log('monster formed');

  await page.click('#btn-teach');
  await page.locator('#screen-teach').waitFor({ timeout: 30_000 });
  await shot('04-teach-start');
  if (live) await dontKnowPauseResume();
  let played = 0;
  for (const entry of lose ? [] : round.script) {
    let ok = false;
    try {
      ok = await play(entry);
    } catch (err) {
      if (await teaching()) throw err;
    }
    if (!ok) break;
    played++;
    if (played === 3) await shot('05-teach-check');
    if (entry.move === 'why') await shot('06-teach-why');
  }
  log(`taught ${played}/${round.script.length} scripted moves`);
  await shot('07-teach-end');
  if (await teaching()) {
    // Two presses within 3 s ring the bell. The armed bell pulses, so the second click must not
    // wait for it to stand still (Playwright would wait past the 3 s window).
    await page.click('#btn-bell');
    await page.waitForTimeout(300);
    await page.click('#btn-bell', { force: true });
    await page.locator('#screen-exam').waitFor({ timeout: 5000 });
    checks.push([true, 'the two-press bell ends teaching']);
  }

  await page.locator('#screen-exam').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(fast ? 50 : 2500);
  await shot('08-exam');
  log('exam (monster taunts)');
  await page.locator('#screen-bout').waitFor({ timeout: 40_000 });
  await page.waitForTimeout(fast ? 300 : 9000);
  await shot('09-bout');
  log('bout');

  // The K.O. (if the bout ends in one), then eating or the escape.
  const ko = await page.locator('.ko-glow.show').waitFor({ timeout: 60_000 }).then(() => true, () => false);
  if (ko) {
    await page.waitForTimeout(fast ? 50 : 500);
    await shot('09b-ko');
  }
  await page.locator('#screen-eat, #screen-lose').first().waitFor({ timeout: 120_000 });
  const won = (await page.locator('#screen-eat').count()) > 0;
  const boutInfo = await page.evaluate(() => window.__bout);
  log(`bout: ${boutInfo?.ideas.map((i) => `${i.id}=${i.score}/${i.belief}`).join(' ')} → ${boutInfo?.outcome}${boutInfo?.knockout ? ' (K.O.)' : ''}`);
  if (won) {
    await page.waitForTimeout(fast ? 200 : 1200);
    await shot('10-eating');
    await page.locator('#btn-replay').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(300);
    await shot('11-trait');
    log('won: Blot ate the monster');
    // M6: the trait is shown, worn and stored.
    const traitName = (await page.textContent('#trait-name').catch(() => '')) ?? '';
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('spark:traits') ?? '[]'));
    const worn = await page.locator('.eat-blot .trait').count();
    checks.push([!!traitName && stored.length >= 1 && worn >= 1, `a trait after the win: "${traitName}" (stored ${stored.length}, worn ${worn})`]);
    await page.click('#btn-replay');
  } else {
    await page.waitForTimeout(fast ? 200 : 2500);
    await shot('10-escape');
    log('lost: the monster escaped');
    checks.push([(await page.locator('#btn-rematch').count()) === 1, 'the escape screen offers a rematch']);
    if (lose) {
      // The rematch really starts: teaching again, on the weakest idea.
      await page.click('#btn-rematch');
      await page.locator('#screen-teach').waitFor({ timeout: 10_000 });
      const focused = await page.locator('.idea[aria-pressed="true"]').count();
      await shot('10b-rematch');
      checks.push([focused === 1, 'the rematch opens teaching on the weakest idea']);
      await page.click('#btn-bell');
      await page.waitForTimeout(300);
      await page.click('#btn-bell', { force: true });
      await page.locator('#screen-lose, #screen-eat').first().waitFor({ timeout: 120_000 });
    }
    if ((await page.locator('#btn-see-replay').count()) > 0) await page.click('#btn-see-replay');
    else await page.click('#btn-replay');
  }
  if (lose) checks.push([!won, 'teaching nothing loses']);
  await page.locator('#screen-replay').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(400);
  await shot('12-replay');
  log(`replay (${((Date.now() - started) / 1000).toFixed(0)} s in total)`);
  // ---- checks ----
  const { screens, marks } = await page.evaluate(() => ({ screens: window.__screens, marks: window.__marks }));
  const finale = won ? 'eat' : 'lose';
  const expected = lose
    ? ['page', 'forming', 'teach', 'exam', 'bout', 'lose', 'teach', 'exam', 'bout', finale, 'replay'] // with the rematch
    : ['page', 'forming', 'teach', 'exam', 'bout', finale, 'replay'];
  checks.push([JSON.stringify(screens) === JSON.stringify(expected), `screens in order: ${screens.join(' → ')}`]);
  checks.push([errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`]);
  const rows = await page.locator('.replay-row').count();
  checks.push([rows === 5, `five replay rows (${rows})`]);
  // M6: one go-deeper link, and it is one of the page's own links.
  const pageLinks = round.lesson.ideas.map((i) => i.sourceUrl).filter(Boolean);
  const hrefs = await page.$$eval('#screen-replay a', (as) => as.map((a) => a.href));
  checks.push([hrefs.length === 1 && pageLinks.includes(hrefs[0]), `one link in the replay, from the page (${hrefs[0] ?? 'none'})`]);
  if (live && !lose) {
    const moves = new Set(round.script.map((e) => e.move));
    checks.push([['say', 'example', 'when', 'check', 'why'].every((m) => moves.has(m)), `all five moves driven (${[...moves].join(', ')})`]);
    // Check it ✗ on a misread idea: Blot explained its wrong belief first (stub: the misread itself; real AI: its own words).
    const reveal = misreadReveals.find((r) => r.said.length > 10);
    checks.push([!!reveal && (real || reveal.said.includes(reveal.misread.slice(0, 20))), `the misreading reveal: "${(reveal?.said ?? '').slice(0, 70)}…"`]);
  }
  if (live) {
    const worst = Math.max(...barTimes);
    const sorted = [...realBarTimes].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length / 2)] ?? 0;
    checks.push([barTimes.length >= 5 && worst <= 1000, `bars moved within 1 s of each sentence (worst ${worst} ms over ${barTimes.length}; live-bars answer p50 ${p50} ms after the 800 ms debounce)`]);
  }
  if (real) {
    checks.push([screens.includes('exam') && screens.includes('bout'), 'the real round reached the exam']);
  }
  if (!fast) {
    const gaps = await page.evaluate(() => {
      const frames = window.__frames;
      const m = window.__marks;
      const worst = (a, b) => {
        const xs = frames.filter((t) => t >= a && t <= b);
        let gap = 0;
        for (let i = 1; i < xs.length; i++) gap = Math.max(gap, xs[i] - xs[i - 1]);
        return { gap: Math.round(gap), frames: xs.length };
      };
      return { forming: worst(m['forming-start'], m['monster-formed']), bout: worst(m['bout-start'], m['bout-end']) };
    });
    checks.push([gaps.forming.gap <= 100 && gaps.forming.frames > (reduced ? 5 : 30), `words-to-monster: worst frame ${gaps.forming.gap} ms over ${gaps.forming.frames} frames (≤ 100 ms)`]);
    checks.push([gaps.bout.gap <= 100 && gaps.bout.frames > 300, `bout: worst frame ${gaps.bout.gap} ms over ${gaps.bout.frames} frames (≤ 100 ms)`]);
    const formed = (marks['monster-formed'] - marks['forming-start']) / 1000;
    checks.push([formed <= 6, `monster formed in ${formed.toFixed(1)} s (≤ 6 s)`]);
    const bout = (marks['bout-end'] - marks['bout-start']) / 1000;
    checks.push([bout >= 30 && bout <= 45, `bout lasted ${bout.toFixed(1)} s at demo speed (30–45 s)`]);
  }
  // M6: play again: the next round's Blot wears the trait it earned.
  if (won && !live) {
    await page.click('#btn-play-again');
    await page.locator('#btn-transform').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(600);
    const wornNext = await page.locator('.dock-blot .trait').count();
    await shot('13-second-run');
    checks.push([wornNext >= 1, `the next round's Blot wears the earned trait (${wornNext})`]);
  }

} catch (err) {
  failed = true;
  console.error(`smoke:demo FAILED: ${err.message}`);
  await shot('99-failure').catch(() => {});
} finally {
  await browser.close();
  await server.close();
  api?.kill();
}
for (const [ok, text] of checks) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`);
  if (!ok) failed = true;
}
console.log(failed ? 'smoke:demo FAILED' : 'smoke:demo ok');
process.exit(failed ? 1 : 0);
