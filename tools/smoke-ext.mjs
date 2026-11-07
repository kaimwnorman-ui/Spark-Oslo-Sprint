// npm run smoke:ext: the extension entry on a real local page (SPEC §14, M3).
// Starts the server with AI_STUB=1, loads the unpacked extension in Chromium, opens
// demo/pages/tides.html (served by the server), triggers the action, and checks that the
// overlay mounts, a game tab opens, and its #monster is built from >= 100 of that page's words.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DIST, ROOT } from './lib.mjs';
import { EXTENSION_ID, SERVER_URL } from '../shared/config.ts';

const SHOTS = process.env.SMOKE_SHOTS ?? path.join(ROOT, 'docs', 'shots');
mkdirSync(SHOTS, { recursive: true });
const log = (...a) => console.log('  ·', ...a);
const checks = [];
let failed = false;

async function health() {
  try {
    const res = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(1000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// 1. The server, stubbed (the extension talks to localhost:8787).
if (await health()) {
  console.error(`smoke:ext needs port 8787 free (something is already running there). Stop it and try again.`);
  process.exit(1);
}
const server = spawn(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', 'server/src/main.ts'], {
  cwd: ROOT,
  env: { ...process.env, AI_STUB: '1', PORT: '8787' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
for (let i = 0; i < 50 && !(await health()); i++) await new Promise((r) => setTimeout(r, 200));

// 2. Chromium with the unpacked extension.
const profile = mkdtempSync(path.join(tmpdir(), 'spark-ext-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 720 },
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});
const gameErrors = [];

try {
  const h = await health();
  if (h?.ai !== 'stub') throw new Error(`the server did not start in stub mode:\n${serverLog}`);
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 10_000 }));
  const id = new URL(worker.url()).host;
  checks.push([id === EXTENSION_ID, `extension loaded with the fixed ID (${id})`]);

  // 3. A real page.
  const pageUrl = `${SERVER_URL}/pages/tides.html`;
  const page = await context.newPage();
  await page.goto(pageUrl);
  await page.waitForLoadState('load');
  const pageText = (await page.evaluate(() => document.body.innerText)).toLowerCase();
  log('page open');

  // 4. The action (Playwright can't click the toolbar; the worker exposes the same function).
  const gameTab = context.waitForEvent('page', { predicate: (p) => p.url().includes('game.html?round='), timeout: 30_000 });
  await worker.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    await globalThis.sparkTransform(tab.id);
  }, pageUrl);
  await page.locator('[data-spark-overlay]').waitFor({ state: 'attached', timeout: 10_000 });
  await page.waitForTimeout(1300);
  await page.screenshot({ path: path.join(SHOTS, 'ext-01-overlay.png') });
  log('overlay mounted, words lifting');

  // 5. The game tab.
  const game = await gameTab;
  game.on('console', (m) => m.type() === 'error' && gameErrors.push(m.text()));
  game.on('pageerror', (e) => gameErrors.push(e.message));
  await game.setViewportSize({ width: 1280, height: 720 });
  await game.locator('#monster').waitFor({ state: 'attached', timeout: 20_000 });
  await game.locator('#btn-teach:not(.hidden)').waitFor({ timeout: 20_000 });
  await game.screenshot({ path: path.join(SHOTS, 'ext-02-monster.png') });
  const words = await game.evaluate(() => window.__monsterWords ?? []);
  const fromPage = words.filter((w) => new RegExp(`(^|[^\\p{L}])${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'u').test(pageText));
  checks.push([fromPage.length >= 100, `#monster is built from ${fromPage.length} of the page's words (≥ 100)`]);
  log('game tab: monster formed');

  // 6. One move through the server (stubbed): Blot answers.
  await game.click('#btn-teach');
  await game.locator('#screen-teach').waitFor();
  await game.click('.idea[data-id="i2"]');
  await game.fill('#teach-input', 'There are two bulges of water, one toward the Moon and one on the far side.');
  await game.click('#btn-send');
  await game.waitForFunction(() => /bulge/i.test(document.querySelector('.teach-bubble')?.textContent ?? ''), null, { timeout: 10_000 });
  await game.waitForTimeout(1200);
  await game.screenshot({ path: path.join(SHOTS, 'ext-03-teach.png') });
  checks.push([true, 'Blot answered through the server']);
  const overlayGone = (await page.locator('[data-spark-overlay]').count()) === 0;
  checks.push([overlayGone, 'the overlay left the page after the hand-off']);
  checks.push([gameErrors.length === 0, `no console errors in the game tab${gameErrors.length ? `: ${gameErrors.join(' | ')}` : ''}`]);

  // 7. Selected text wins over the page (an AI answer, a paragraph).
  await page.bringToFront();
  const selected = await page.evaluate(() => {
    // Three paragraphs (Spark needs 60+ words to find five ideas).
    const ps = document.querySelectorAll('article p');
    const range = document.createRange();
    range.setStartBefore(ps[3]);
    range.setEndAfter(ps[5]);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return sel.toString().replace(/\s+/g, ' ').trim();
  });
  const secondTab = context.waitForEvent('page', { predicate: (p) => p.url().includes('game.html?round='), timeout: 30_000 });
  await worker.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    await globalThis.sparkTransform(tab.id);
  }, pageUrl);
  const second = await secondTab;
  const roundId = new URL(second.url()).searchParams.get('round');
  const handoff = await worker.evaluate(async (key) => (await chrome.storage.session.get(key))[key], `round:${roundId}`);
  checks.push([handoff?.capture?.source === 'selection' && handoff.capture.text.replace(/\s+/g, ' ').trim() === selected, 'selected text wins over the page']);
} catch (err) {
  failed = true;
  console.error(`smoke:ext FAILED: ${err.message}`);
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
  server.kill();
}
for (const [ok, text] of checks) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`);
  if (!ok) failed = true;
}
console.log(failed ? 'smoke:ext FAILED' : 'smoke:ext ok');
process.exit(failed ? 1 : 0);
