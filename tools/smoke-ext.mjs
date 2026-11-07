// npm run smoke:ext: the extension entry on a real local page (SPEC §14, M3).
// Starts the server with AI_STUB=1, loads the unpacked extension in Chromium, opens
// demo/pages/tides.html (served by the server), triggers the action, and checks that the
// overlay mounts, a game tab opens, and its #monster is built from >= 100 of that page's words.
//   --real            the server with the real AI (needs a key) instead of AI_STUB=1
//   --url <page>      any page instead of the local demo page (e.g. a news article)
//   --select <css>    select that element's text first (an AI answer, a few paragraphs)
//   --play            play the whole round through to the replay
//   --name <label>    screenshot prefix
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DIST, ROOT } from './lib.mjs';
import { EXTENSION_ID, SERVER_URL } from '../shared/config.ts';

const SHOTS = process.env.SMOKE_SHOTS ?? path.join(ROOT, 'docs', 'shots');
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const real = process.argv.includes('--real');
const external = arg('--url');
const selectCss = arg('--select');
const playAll = process.argv.includes('--play') || !!external;
const label = arg('--name') ?? 'ext';
mkdirSync(SHOTS, { recursive: true });
const log = (...a) => console.log('  ·', ...a);
const checks = [];
let failed = false;

/** Plays a whole round on any page: teach three ideas in plain words, ring the bell, watch, replay. */
async function playRound(game) {
  const t0 = Date.now();
  await game.click('#btn-teach');
  await game.locator('#screen-teach').waitFor();
  const names = await game.$$eval('.idea .idea-name', (els) => els.map((e) => e.textContent));
  const ids = await game.$$eval('.idea', (els) => els.map((e) => e.dataset.id));
  log(`ideas: ${names.join(' | ')}`);
  for (const [n, id] of ids.slice(0, 3).entries()) {
    await game.click(`.idea[data-id="${id}"]`);
    await game.click('.move[data-move="say"]');
    await game.fill('#teach-input', `I think ${names[n]} is one of the main ideas here, and it matters because it explains how this works.`);
    await game.click('#btn-send');
    await game.waitForFunction(() => !document.querySelector('.bubble.typing') && document.querySelector('#screen-teach')?.getAttribute('data-busy') !== '1', null, { timeout: 30_000 });
    await game.waitForTimeout(400);
  }
  await game.screenshot({ path: path.join(SHOTS, `${label}-03-teach.png`) });
  await game.click('#btn-bell');
  await game.waitForTimeout(300);
  await game.click('#btn-bell', { force: true });
  await game.locator('#screen-bout').waitFor({ timeout: 90_000 });
  await game.locator('#screen-eat, #screen-lose').first().waitFor({ timeout: 120_000 });
  await game.waitForTimeout(1500);
  if ((await game.locator('#screen-eat').count()) > 0) {
    await game.locator('#btn-replay').waitFor({ timeout: 20_000 });
    await game.click('#btn-replay');
  } else {
    await game.click('#btn-see-replay');
  }
  await game.locator('#screen-replay').waitFor({ timeout: 20_000 });
  await game.waitForTimeout(500);
  await game.screenshot({ path: path.join(SHOTS, `${label}-04-replay.png`) });
  const rows = await game.locator('.replay-row').count();
  checks.push([rows === 5, `a full round on ${new URL(game.url()).protocol === 'chrome-extension:' ? 'the page' : ''} reached the replay in ${((Date.now() - t0) / 1000).toFixed(0)} s (${rows} rows)`]);
  checks.push([gameErrors.length === 0, `no console errors in the game tab${gameErrors.length ? `: ${gameErrors.join(' | ')}` : ''}`]);
}

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
  env: { ...process.env, AI_STUB: real ? '0' : '1', PORT: '8787' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
for (let i = 0; i < 50 && !(await health()); i++) await new Promise((r) => setTimeout(r, 200));

// 2. Chromium with the unpacked extension.
const profile = mkdtempSync(path.join(tmpdir(), 'spark-ext-'));
const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy;
// Playwright cannot click the toolbar (which grants activeTab), so for an external page the test
// loads a throwaway copy of the extension with that one site added to host_permissions.
let extDir = DIST;
if (external) {
  extDir = mkdtempSync(path.join(tmpdir(), 'spark-ext-dist-'));
  cpSync(DIST, extDir, { recursive: true });
  const manifest = JSON.parse(readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));
  manifest.host_permissions.push(`${new URL(external).origin}/*`);
  writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 720 },
  args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  // External pages go through this machine's proxy, if it has one; the Spark server stays local.
  ...(external && proxyServer ? { proxy: { server: proxyServer, bypass: 'localhost,127.0.0.1' } } : {}),
});
const gameErrors = [];

try {
  const h = await health();
  if (h?.ai !== (real ? 'live' : 'stub')) throw new Error(`the server did not start in ${real ? 'live' : 'stub'} mode:\n${serverLog}`);
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 10_000 }));
  const id = new URL(worker.url()).host;
  checks.push([id === EXTENSION_ID, `extension loaded with the fixed ID (${id})`]);

  // 3. A real page.
  const page = await context.newPage();
  await page.goto(external ?? `${SERVER_URL}/pages/tides.html`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(external ? 2500 : 300);
  const pageUrl = page.url();
  if (selectCss) {
    const chars = await page.evaluate((css) => {
      const el = document.querySelector(css);
      if (!el) return 0;
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return sel.toString().length;
    }, selectCss);
    if (!chars) throw new Error(`nothing to select at ${selectCss}`);
    log(`selected ${chars} characters`);
  }
  const pageText = (await page.evaluate(() => document.body.innerText)).toLowerCase();
  log('page open');

  // 4. The action (Playwright can't click the toolbar; the worker exposes the same function).
  const gameTab = context.waitForEvent('page', { predicate: (p) => p.url().includes('game.html?round='), timeout: 30_000 });
  await worker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => t.url === url) ?? tabs.find((t) => t.url?.startsWith(url.split('#')[0]));
    await globalThis.sparkTransform(tab.id);
  }, pageUrl);
  await page.locator('[data-spark-overlay]').waitFor({ state: 'attached', timeout: 10_000 });
  await page.waitForTimeout(1300);
  await page.screenshot({ path: path.join(SHOTS, `${label}-01-overlay.png`) });
  log('overlay mounted, words lifting');

  // 5. The game tab.
  const game = await gameTab;
  game.setDefaultTimeout(60_000);
  game.on('console', (m) => m.type() === 'error' && gameErrors.push(m.text()));
  game.on('pageerror', (e) => gameErrors.push(e.message));
  await game.setViewportSize({ width: 1280, height: 720 });
  await game.locator('#monster').waitFor({ state: 'attached', timeout: 20_000 });
  await game.locator('#btn-teach:not(.hidden)').waitFor({ timeout: 20_000 });
  await game.screenshot({ path: path.join(SHOTS, `${label}-02-monster.png`) });
  const words = await game.evaluate(() => window.__monsterWords ?? []);
  const fromPage = words.filter((w) => new RegExp(`(^|[^\\p{L}])${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'u').test(pageText));
  checks.push([fromPage.length >= 100, `#monster is built from ${fromPage.length} of the page's words (≥ 100)`]);
  log('game tab: monster formed');

  if (playAll) {
    await playRound(game);
  } else {
    // 6. One move through the server (stubbed): Blot answers.
    await game.click('#btn-teach');
    await game.locator('#screen-teach').waitFor();
    await game.click('.idea[data-id="i2"]');
    await game.fill('#teach-input', 'There are two bulges of water, one toward the Moon and one on the far side.');
    await game.click('#btn-send');
    const expected = JSON.parse(readFileSync(path.join(ROOT, 'demo', 'rounds', 'tides.json'), 'utf8')).replies.i2.say;
    await game.waitForFunction((text) => (document.querySelector('.teach-bubble')?.textContent ?? '').trim() === text.trim(), expected, { timeout: 10_000 });
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
  }
} catch (err) {
  failed = true;
  console.error(`smoke:ext FAILED: ${err.message}`);
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
  if (extDir !== DIST) rmSync(extDir, { recursive: true, force: true });
  server.kill();
}
for (const [ok, text] of checks) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`);
  if (!ok) failed = true;
}
console.log(failed ? 'smoke:ext FAILED' : 'smoke:ext ok');
process.exit(failed ? 1 : 0);
