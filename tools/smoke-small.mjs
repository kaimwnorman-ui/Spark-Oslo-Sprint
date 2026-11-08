// smoke:small: the game in a small window (640x480) and on a phone (390x844), offline, in Chromium.
// Every control a player needs must be inside the window and not covered (the judge found Send at x=751
// in a 640 px window).
import { chromium } from 'playwright';
import path from 'node:path';
import { DIST, ROOT } from './lib.mjs';
import { serveDir } from './serve.mjs';

// The layout must hold with a wide fallback font, not only with the font on the developer's machine: a stock CI
// runner has no Inter or Avenir, and DejaVu Sans is among the widest common fallbacks. This run forces it, so
// the result is the same on every machine that has DejaVu Sans, CI included (SMOKE_FONT="" keeps the page's own fonts).
const FONT = process.env.SMOKE_FONT ?? 'DejaVu Sans';
// Screenshots: with the page's own fonts (SMOKE_FONT=) they go to docs/shots/small-*.png and phone-*.png, the pictures
// the docs use; the wide-font run writes docs/shots/stress/ (not committed; CI uploads it when a check fails).
const SHOTS = process.env.SMOKE_SHOTS ?? path.join(ROOT, 'docs', 'shots', FONT ? 'stress' : '');
const SIZES = [
  { name: 'small', width: 640, height: 480, mobile: false },
  { name: 'phone', width: 390, height: 844, mobile: true },
];
const server = await serveDir(DIST);
const browser = await chromium.launch();
const checks = [];
const errors = [];
let failed = false;

/**
 * The control is fully inside the window and is what a tap at its centre would hit. Primary controls must be
 * there as the screen opens; `scroll` lets secondary ones (the options of a question) be a scroll away, but never off to the side.
 */
async function reachable(page, selector, scroll = false) {
  return page.evaluate(([sel, scrolled]) => {
    const el = document.querySelector(sel);
    if (!el) return `missing ${sel}`;
    if (scrolled) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    if (r.width < 2 || r.height < 2) return `${sel} has no size`;
    if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) {
      return `${sel} is outside the window (${Math.round(r.left)}..${Math.round(r.right)} x ${Math.round(r.top)}..${Math.round(r.bottom)} in ${vw}x${vh})`;
    }
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hit || !(el === hit || el.contains(hit) || hit.contains(el))) return `${sel} is covered by <${hit?.tagName.toLowerCase()} class="${hit?.className}">`;
    return '';
  }, [selector, scroll]);
}

async function expectReachable(page, size, where, selectors, scroll = false) {
  for (const sel of selectors) {
    const problem = await reachable(page, sel, scroll);
    checks.push([!problem, `${size.name} · ${where}: ${sel} is reachable${problem ? ` (${problem})` : ''}`]);
  }
}

async function blotDone(page) {
  await page.waitForTimeout(60);
  await page.waitForFunction(() => !document.querySelector('.bubble.typing') && document.querySelector('#screen-teach')?.getAttribute('data-busy') !== '1', null, { timeout: 15_000 });
  await page.waitForTimeout(80);
}

for (const size of SIZES) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: size.mobile, isMobile: size.mobile });
  if (FONT) {
    await context.addInitScript((family) => {
      const apply = () => {
        const style = document.createElement('style');
        style.textContent = `:root { --font-text: "${family}", sans-serif !important; --font-display: "${family}", sans-serif !important; }`;
        document.head.append(style);
      };
      if (document.head) apply();
      else document.addEventListener('DOMContentLoaded', apply, { once: true });
    }, FONT);
  }
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${size.name}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${size.name}: ${e.message}`));
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${size.name}-${name}.png`) });
  const base = `${server.url}/game.html`;
  try {
    // Home
    await page.goto(base);
    await page.locator('#screen-home').waitFor();
    await page.waitForTimeout(500);
    await expectReachable(page, size, 'home', ['#btn-play-demo']);
    await shot('01-home');

    // The page and the reveal
    await page.goto(`${base}?demo=tides&fast=1&teach=90`);
    await page.locator('#btn-transform').waitFor();
    await page.waitForTimeout(500);
    await expectReachable(page, size, 'page', ['#btn-transform']);
    await shot('02-page');
    await page.click('#btn-transform');
    await page.locator('#btn-teach:not(.hidden)').waitFor({ timeout: 25_000 });
    await page.waitForTimeout(300);
    await expectReachable(page, size, 'reveal', ['#btn-teach']);
    await shot('03-reveal');

    // Teaching: the idea list, the composer and Send, the timer and the bell
    await page.click('#btn-teach');
    await page.locator('#screen-teach').waitFor();
    await page.waitForTimeout(400);
    await shot('04-teach');
    if ((await page.locator('.idea[aria-pressed="true"]').count()) === 0) await page.click('.idea[data-id="i2"]');
    await page.locator('#teach-input').waitFor();
    await expectReachable(page, size, 'teach', ['#teach-input', '#btn-send', '#btn-bell', '#timer']);
    await page.fill('#teach-input', 'The ocean stretches into two bulges, one facing the Moon and one on the far side.');
    await page.click('#btn-send');
    await blotDone(page);
    await shot('05-teach-sent');
    await expectReachable(page, size, 'teach, after a message', ['#teach-input', '#btn-send', '#btn-bell']);
    const tabs = await page.locator('.move').count();
    if (tabs > 0) {
      await page.click('.move[data-move="when"]').catch(() => {});
      await expectReachable(page, size, 'teach, Tell when', ['.when-option'], true);
      await shot('06-teach-when');
    }

    // Through the exam, the bout and the eating to the replay
    await page.click('#btn-bell');
    await page.waitForTimeout(250);
    await page.click('#btn-bell', { force: true });
    await page.locator('#screen-eat, #screen-lose').first().waitFor({ timeout: 120_000 });
    await page.waitForTimeout(600);
    await shot('07-after-bout');
    if ((await page.locator('#screen-eat').count()) > 0) {
      await page.locator('#btn-replay').waitFor({ timeout: 20_000 });
      await expectReachable(page, size, 'trait card', ['#btn-replay']);
      await shot('08-eat');
      await page.click('#btn-replay');
    } else {
      await expectReachable(page, size, 'escape', ['#btn-see-replay']);
      await shot('08-lose');
      await page.click('#btn-see-replay');
    }
    await page.locator('#screen-replay').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(500);
    await expectReachable(page, size, 'replay', ['#btn-play-again', '#btn-home']);
    await shot('09-replay');

    // Challenge a friend
    if ((await page.locator('#btn-challenge').count()) > 0) {
      await page.click('#btn-challenge');
      await page.locator('#share-name').waitFor();
      await expectReachable(page, size, 'share', ['#share-name', '#btn-make-link', '#btn-share-close']);
      await page.click('#btn-make-link');
      await page.locator('#share-link').waitFor({ timeout: 5000 });
      await expectReachable(page, size, 'share link', ['#share-link', '#btn-copy-link', '#btn-share-close']);
      await shot('10-share');
      await page.click('#btn-share-close');
    }

    // Four days on: home, Your Blot, a flashback
    await page.goto(`${base}?days=4`);
    await page.locator('#screen-home').waitFor();
    await page.waitForTimeout(500);
    await expectReachable(page, size, 'home, returning', ['#btn-your-blot']);
    await shot('11-home-returning');
    await page.goto(`${base}?blot=1&days=4`);
    await page.locator('#screen-blot').waitFor();
    await page.waitForTimeout(500);
    await expectReachable(page, size, 'Your Blot', ['#btn-blot-primary', '#btn-clear-data']);
    await shot('12-your-blot');
    await page.click('#btn-blot-primary');
    await page.locator('#screen-flashback').waitFor();
    await page.waitForTimeout(400);
    await expectReachable(page, size, 'flashback', ['#flash-input', '#btn-remind', '#btn-skip-flash']);
    await shot('13-flashback');
    await page.fill('#flash-input', 'The ocean stretches into two bulges and the Earth spins through both, giving two high tides a day.');
    await page.click('#btn-remind');
    await page.locator('#flash-score').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(900);
    await expectReachable(page, size, 'flashback result', ['#btn-flash-continue']);
    await shot('14-flashback-result');
  } catch (err) {
    failed = true;
    console.error(`smoke:small FAILED (${size.name}): ${err.message}`);
    await shot('99-failure').catch(() => {});
  }
  await context.close();
}

await browser.close();
await server.close();
checks.push([errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`]);
for (const [ok, text] of checks) {
  if (!ok || process.env.SMOKE_VERBOSE) console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`);
  if (!ok) failed = true;
}
console.log(`${checks.filter(([ok]) => ok).length}/${checks.length} checks passed`);
console.log(failed ? 'smoke:small FAILED' : 'smoke:small ok');
process.exit(failed ? 1 : 0);
