// npm run smoke:ext: loads the unpacked extension in Chromium and checks that its
// service worker starts with our fixed ID and that game.html opens.
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DIST } from './lib.mjs';
import { EXTENSION_ID } from '../shared/config.ts';

const profile = mkdtempSync(path.join(tmpdir(), 'spark-smoke-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 720 },
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});
let failed = false;
try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 10_000 }));
  const id = new URL(worker.url()).host;
  if (id !== EXTENSION_ID) throw new Error(`extension ID is ${id}, expected ${EXTENSION_ID}`);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/game.html`);
  await page.locator('#screen-title').waitFor({ timeout: 5000 });
  console.log(`smoke:ext ok: extension ${id} loaded, game.html renders.`);
} catch (err) {
  failed = true;
  console.error(`smoke:ext FAILED: ${err.message}`);
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
