// smoke:guest: the hosted guest game (site/) on a made-up public host name, in Chromium. A friend with
// nothing installed opens a challenge link and plays; no request may go anywhere but the site itself.
//   host-resolver-rules makes guest.test point at the local static server, so the game sees a real, non-loopback host.
import { chromium } from 'playwright';
import path from 'node:path';
import { ROOT } from './lib.mjs';
import { serveDir } from './serve.mjs';

const SHOTS = process.env.SMOKE_SHOTS ?? path.join(ROOT, 'docs', 'shots');
const site = await serveDir(path.join(ROOT, 'site'));
const port = new URL(site.url).port;
const origin = `http://guest.test:${port}`;
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP guest.test 127.0.0.1'] });
const checks = [];
const check = (ok, text) => checks.push([!!ok, text]);
const errors = [];
const requests = [];
let failed = false;

function watch(page, who) {
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${who}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
}

try {
  const viewport = { width: 1280, height: 720 };
  const host = await (await browser.newContext({ viewport })).newPage();
  watch(host, 'host');

  // The site's own address opens the game.
  await host.goto(`${origin}/`);
  await host.locator('#screen-home').waitFor({ timeout: 15_000 });
  check(true, 'the site address opens the game');
  await host.screenshot({ path: path.join(SHOTS, 'guest-01-home.png') });

  // A round, offline.
  await host.goto(`${origin}/game.html?demo=tides&fast=1&teach=90`);
  await host.click('#btn-transform');
  await host.locator('#btn-teach:not(.hidden)').waitFor({ timeout: 25_000 });
  await host.click('#btn-teach');
  await host.locator('#screen-teach').waitFor();
  for (const [id, say] of [['i2', 'The ocean stretches into two bulges, one facing the Moon and one on the far side.'], ['i4', 'The Sun adds its own pull, so tides are bigger at new and full moon.']]) {
    await host.click(`.idea[data-id="${id}"]`);
    await host.fill('#teach-input', say);
    await host.click('#btn-send');
    await host.waitForFunction(() => !document.querySelector('.bubble.typing') && document.querySelector('#screen-teach')?.getAttribute('data-busy') !== '1', null, { timeout: 15_000 });
  }
  await host.click('#btn-bell');
  await host.waitForTimeout(250);
  await host.click('#btn-bell', { force: true });
  await host.locator('#screen-eat, #screen-lose').first().waitFor({ timeout: 120_000 });
  await host.click('#btn-replay, #btn-see-replay');
  await host.locator('#screen-replay').waitFor({ timeout: 20_000 });
  check(true, 'a whole round plays on the hosted guest game');

  // The challenge link points at the hosted game, so a friend needs nothing installed.
  await host.click('#btn-challenge');
  await host.fill('#share-name', 'Kai');
  await host.click('#btn-make-link');
  await host.locator('#share-link').waitFor({ timeout: 5000 });
  const link = await host.inputValue('#share-link');
  check(link.startsWith(`${origin}/game.html?duel=L`), `the challenge link opens the hosted game (${link.slice(0, 48)}…)`);

  // The friend, in a fresh browser profile.
  const friend = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  watch(friend, 'friend');
  await friend.goto(link);
  await friend.locator('#screen-duel-intro').waitFor({ timeout: 15_000 });
  check(/Kai/.test((await friend.textContent('#duel-title')) ?? ''), 'the friend, on a phone with nothing installed, sees who challenged them');
  await friend.screenshot({ path: path.join(SHOTS, 'guest-02-friend-phone.png') });
  await friend.click('#btn-accept-duel');
  await friend.locator('#btn-transform').waitFor({ timeout: 15_000 });
  check(true, 'and can read the same page and take the challenge');

  // A real page's challenge needs the server: the guest says so instead of failing silently.
  await friend.goto(`${origin}/game.html?duel=abcd2345`);
  await friend.locator('#screen-error').waitFor({ timeout: 15_000 });
  check(/server/i.test((await friend.textContent('#screen-error')) ?? ''), 'a server challenge says plainly that this copy has no server');

  const elsewhere = requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'));
  check(elsewhere.length === 0, `no request left the site (${requests.length} requests${elsewhere.length ? `, but also: ${elsewhere.slice(0, 3).join(', ')}` : ''})`);
} catch (err) {
  failed = true;
  console.error(`smoke:guest FAILED: ${err.message}`);
}
await browser.close();
await site.close();
check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
for (const [ok, text] of checks) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`);
  if (!ok) failed = true;
}
console.log(failed ? 'smoke:guest FAILED' : 'smoke:guest ok');
process.exit(failed ? 1 : 0);
