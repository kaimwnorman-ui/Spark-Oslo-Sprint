// npm run smoke:demo: plays the demo round end to end in Chromium, the way a player would.
// Opens game.html?demo=tides (served from extension/dist/), drives the round's scripted player,
// rings the bell, watches the bout, and checks: the screens appear in order, no console errors,
// and the set pieces' timing (SPEC §2, M2). A 1280x720 screenshot per screen goes to docs/shots/.
//   --fast       run everything near-instantly (skips the timing checks)
//   --no-art     block the generated art too: the placeholders must carry the demo
//   --reduced    emulate prefers-reduced-motion
//   --headed     watch it
// kie.ai is always blocked: the game never needs it at runtime.
import { chromium } from 'playwright';
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
const roundId = process.env.SMOKE_ROUND ?? 'tides';
const SHOTS = process.env.SMOKE_SHOTS ?? path.join(ROOT, 'docs', 'shots');
mkdirSync(SHOTS, { recursive: true });
const round = JSON.parse(readFileSync(path.join(ROOT, 'demo', 'rounds', `${roundId}.json`), 'utf8'));

const server = await serveDir(DIST);
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

async function play(entry) {
  if (!(await teaching())) return false;
  const { ideaId, move } = entry;
  if (move === 'why') {
    await page.locator('#question').waitFor({ timeout: 10_000 });
    await blotDone();
    await page.fill('#teach-input', entry.text);
    await page.click('#btn-send');
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
    await page.click('#btn-send');
    await blotDone();
  } else if (move === 'when') {
    await page.click(`.when-option[data-index="${entry.tap}"]`);
    await blotDone();
  } else if (move === 'check') {
    await page.locator('#btn-check-yes').waitFor({ timeout: 10_000 });
    await page.click(entry.tap === 'yes' ? '#btn-check-yes' : '#btn-check-no');
    await page.waitForTimeout(fast ? 50 : 400);
  }
  return true;
}

let failed = false;
const checks = [];
try {
  const started = Date.now();
  await page.goto(`${server.url}/game.html?demo=${roundId}${fast ? '&fast=1' : ''}`);
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
  await page.locator('#screen-teach').waitFor();
  await shot('04-teach-start');
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
    await page.click('#btn-bell');
    await page.waitForTimeout(300);
    await page.click('#btn-bell');
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
  if (won) {
    await page.waitForTimeout(fast ? 200 : 1200);
    await shot('10-eating');
    await page.locator('#btn-replay').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(300);
    await shot('11-trait');
    log('won: Blot ate the monster');
    await page.click('#btn-replay');
  } else {
    await page.waitForTimeout(fast ? 200 : 2500);
    await shot('10-escape');
    log('lost: the monster escaped');
    checks.push([(await page.locator('#btn-rematch').count()) === 1, 'the escape screen offers a rematch']);
    await page.click('#btn-see-replay');
  }
  if (lose) checks.push([!won, 'teaching nothing loses']);
  await page.locator('#screen-replay').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(400);
  await shot('12-replay');
  log(`replay (${((Date.now() - started) / 1000).toFixed(0)} s in total)`);

  // ---- checks ----
  const { screens, marks } = await page.evaluate(() => ({ screens: window.__screens, marks: window.__marks }));
  const expected = ['page', 'forming', 'teach', 'exam', 'bout', won ? 'eat' : 'lose', 'replay'];
  checks.push([JSON.stringify(screens) === JSON.stringify(expected), `screens in order: ${screens.join(' → ')}`]);
  checks.push([errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`]);
  const rows = await page.locator('.replay-row').count();
  checks.push([rows === 5, `five replay rows (${rows})`]);
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
} catch (err) {
  failed = true;
  console.error(`smoke:demo FAILED: ${err.message}`);
  await shot('99-failure').catch(() => {});
} finally {
  await browser.close();
  await server.close();
}
for (const [ok, text] of checks) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`);
  if (!ok) failed = true;
}
console.log(failed ? 'smoke:demo FAILED' : 'smoke:demo ok');
process.exit(failed ? 1 : 0);
