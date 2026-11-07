// npm run smoke:demo: opens the game tab (served from extension/dist/) in Chromium,
// checks it renders with no console errors, and saves screenshots to docs/shots/.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT, DIST } from './lib.mjs';
import { serveDir } from './serve.mjs';

const SHOTS = path.join(ROOT, 'docs', 'shots');
mkdirSync(SHOTS, { recursive: true });

const server = await serveDir(DIST);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
page.on('pageerror', (err) => errors.push(err.message));

let failed = false;
try {
  await page.goto(`${server.url}/game.html`);
  await page.locator('#screen-title').waitFor({ timeout: 5000 });
  await page.screenshot({ path: path.join(SHOTS, '01-title.png') });
  if (errors.length) throw new Error(`console errors:\n${errors.join('\n')}`);
  console.log('smoke:demo ok: title screen, no console errors.');
} catch (err) {
  failed = true;
  console.error(`smoke:demo FAILED: ${err.message}`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
