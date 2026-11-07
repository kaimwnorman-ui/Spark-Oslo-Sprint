// npm run smoke:opera: a whole round in a real Opera with WebAI, Blot and the live bars on the
// device (SPEC §12.5). The tides demo page goes through the Spark server (AI_STUB=1, no key), so the
// only live AI is the device's. Checks: the "on this laptop" pill shows; the player's words never go
// to /creature or /bars; bars move for good teaching and not for off-topic text; a right "when" tap
// turns green; the hidden misreading comes out on Check it and a correction fixes it; the round
// reaches its end. Skips (exit 0) without Opera + WebAI. `-- --round sove` plays another demo round
// (Norwegian here) from a plan built from its own lesson.
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright';
import { EXTENSION_ID, SERVER_URL } from '../shared/config.ts';
import { DIST, ROOT } from './lib.mjs';
import { launchOpera, operaMissing } from './opera.mjs';
import { readFileSync } from 'node:fs';
import { contentWords, stem } from '../shared/words.ts';
import { misreadIdeaIds } from '../shared/round.ts';

const SHOTS = process.env.SMOKE_SHOTS ?? path.join(ROOT, 'docs', 'shots');

// --round <id>: any demo round (default tides). Tides keeps its hand-written lines; other rounds get
// a plan built from their own lesson, in their language.
const ROUND = process.argv.includes('--round') ? process.argv[process.argv.indexOf('--round') + 1] : 'tides';
const round = JSON.parse(readFileSync(path.join(ROOT, 'demo', 'rounds', `${ROUND}.json`), 'utf8'));
const NB = round.lesson.language === 'nb' || round.lesson.language === 'nn';
const ideaOf = (id) => round.lesson.ideas.find((i) => i.id === id);
const held = misreadIdeaIds(round.lesson.ideas.map((i) => i.id), round.seed);
const free = round.lesson.ideas.filter((i) => !held.includes(i.id));
const plan =
  ROUND === 'tides'
    ? {
        good: { id: 'i2', text: 'There are two bulges because the Moon pulls the near water harder than the Earth and the far water least, so water piles up on both sides.' },
        when: { id: 'i2', index: 1 },
        off: { id: 'i4', text: 'My cat likes to sleep in the sun all afternoon and eats fish for dinner.' },
        misread: { id: 'i1', say: 'The difference in pull is that the Moon pulls the near side of Earth more strongly than the far side.', fix: 'No, it is not one big slurp like a straw. The Moon pulls the near water a bit more than the far water, and that difference stretches the sea.' },
      }
    : {
        good: { id: free[0].id, text: free[0].modelAnswer },
        when: { id: free[0].id, index: free[0].whenOptions.findIndex((o) => o.right) },
        off: { id: free[1].id, text: NB ? 'Katten min liker å ligge i sola hele ettermiddagen og spiser fisk til middag.' : 'My cat likes to sleep in the sun all afternoon and eats fish for dinner.' },
        misread: {
          id: held[0],
          // A plain first Say with no denial in it, so Blot quietly keeps its misreading (rule 3).
          say: NB ? `«${ideaOf(held[0]).name}» er en av hovedideene på siden, og den skal jeg lære deg nå.` : `"${ideaOf(held[0]).name}" is one of the main ideas on this page, and I will teach it to you now.`,
          fix: (NB ? 'Nei, det stemmer ikke. ' : 'No, that is not right. ') + ideaOf(held[0]).modelAnswer,
        },
      };
const inLanguage = (text) => (NB ? /[æøå]|\b(og|er|det|jeg|som|en|ikke)\b/i.test(text) : true);
const missing = operaMissing();
if (missing) {
  console.log(`smoke:opera skipped: ${missing}`);
  process.exit(0);
}

async function health() {
  try {
    const res = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}
if (await health()) {
  console.error('smoke:opera needs port 8787 free (something is already running there). Stop it and try again.');
  process.exit(1);
}
execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build.mjs')], { stdio: 'ignore' });
const server = spawn(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', 'server/src/main.ts'], {
  cwd: ROOT,
  env: { ...process.env, AI_STUB: '1', PORT: '8787' },
  stdio: 'ignore',
});
for (let i = 0; i < 50 && !(await health()); i++) await new Promise((r) => setTimeout(r, 200));

const checks = [];
const log = (s) => console.log(`  · ${s}`);
const routes = [];
const errors = [];
let failed = false;
let skipped = null;
const context = await launchOpera(chromium, DIST);
try {
  const page = await context.newPage();
  page.on('console', (m) => {
    // Opera logs these itself while its AI service starts; they are not ours.
    if (m.type() === 'error' && !/service is not running/i.test(m.text())) errors.push(m.text().slice(0, 160));
    // The device engine says when it falls back to the server, and why.
    if (/^Spark:/.test(m.text())) log(m.text().slice(0, 200));
  });
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin === SERVER_URL && r.method() === 'POST') routes.push(u.pathname);
  });
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `opera-${name}.png`) });
  const busyDone = async () => {
    await page.waitForTimeout(80);
    await page.waitForFunction(() => !document.querySelector('.bubble.typing') && document.querySelector('#screen-teach')?.getAttribute('data-busy') !== '1', null, { timeout: 30_000 });
    await page.waitForTimeout(300);
  };
  const bubble = async () => ((await page.textContent('.teach-bubble')) ?? '').trim();
  const barOf = async (id) => Number((await page.getAttribute(`.idea[data-id="${id}"]`, 'aria-label'))?.match(/(\d+) percent/)?.[1] ?? NaN);
  /** The device's bar lands a moment after the provisional tick (debounce + ~1.5 s judge). */
  const settledBar = async (id) => {
    await page.waitForFunction((i) => Number(document.querySelector(`.idea[data-id="${i}"]`)?.dataset.answers ?? 0) > 0, id, { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(3500);
    return barOf(id);
  };
  const say = async (id, move, text) => {
    await page.click(`.idea[data-id="${id}"]`);
    await page.click(`.move[data-move="${move}"]`);
    await page.fill('#teach-input', text);
    await page.click('#btn-send');
    await busyDone();
  };

  await page.goto(`chrome-extension://${EXTENSION_ID}/game.html?demo=${ROUND}&live=1&teach=180`);
  await page.locator('#btn-transform').waitFor();
  await page.waitForTimeout(800);
  await page.click('#btn-transform');
  await page.locator('#btn-teach:not(.hidden)').waitFor({ timeout: 30_000 });
  await page.click('#btn-teach');
  await page.locator('#screen-teach').waitFor({ timeout: 30_000 });
  const onDevice = await page.locator('#device-note').waitFor({ timeout: 25_000 }).then(() => true, () => false);
  if (!onDevice) {
    skipped = 'the device model never became ready (is WebAI on, with a model enabled, in this profile?)';
  } else {
    checks.push([true, `the pill says "${(await page.textContent('#device-note'))?.trim()}"`]);

    await say(plan.good.id, 'say', plan.good.text);
    const reply = await bubble();
    log(`Blot: ${reply}`);
    checks.push([reply.length > 0 && !/[<>*#]/.test(reply) && inLanguage(reply), `Blot answers on the device, in plain words${NB ? ', in Norwegian' : ''}`]);
    const good = await settledBar(plan.good.id);
    checks.push([good >= 30, `a good explanation fills its bar (${good}%)`]);
    await shot(`${ROUND === 'tides' ? '' : ROUND + '-'}01-teach`);

    await page.click(`.idea[data-id="${plan.when.id}"]`);
    await page.click('.move[data-move="when"]');
    await page.click(`.when-option[data-index="${plan.when.index}"]`);
    await busyDone();
    checks.push([(await page.getAttribute(`.when-option[data-index="${plan.when.index}"]`, 'class'))?.includes('right') === true, 'a right "when" tap turns green (from /reveal)']);
    log(`Blot: ${await bubble()}`);

    await say(plan.off.id, 'say', plan.off.text);
    const off = await settledBar(plan.off.id);
    checks.push([off <= 15, `off-topic text barely moves its bar (${off}%)`]);

    // One of the two ideas Blot quietly misreads in this round (from its seed).
    await say(plan.misread.id, 'say', plan.misread.say);
    await page.click(`.idea[data-id="${plan.misread.id}"]`);
    await page.click('.move[data-move="check"]');
    await busyDone();
    const check = await bubble();
    log(`Blot (Check it): ${check}`);
    // Blot words the misreading its own way each time: compare with the round's misreading text.
    const shared = new Set(contentWords(ideaOf(plan.misread.id).misread).map(stem));
    const overlap = new Set(contentWords(check).map(stem).filter((w) => shared.has(w))).size;
    checks.push([overlap >= 2 && /\?\s*$/.test(check), `Check it brings out the hidden misreading as a question (${overlap} words shared with it)`]);
    await shot(`${ROUND === 'tides' ? '' : ROUND + '-'}02-check`);
    await page.click('#btn-check-no');
    await page.waitForTimeout(400);
    await page.fill('#teach-input', plan.misread.fix);
    await page.click('#btn-send');
    await busyDone();
    const fixed = await settledBar(plan.misread.id);
    checks.push([fixed >= 30, `the correction fills the bar (${fixed}%)`]);
    log(`Blot: ${await bubble()}`);

    await page.click('#btn-bell');
    await page.waitForTimeout(300);
    await page.click('#btn-bell', { force: true });
    await page.locator('#screen-exam').waitFor({ timeout: 10_000 });
    // The monster's second line is written on the device while the intro plays.
    const fixedTaunt = 'Come on then, little blot. Show me what you know.';
    const tauntText = () => page.evaluate(() => (document.querySelector('#screen-exam .taunt')?.textContent ?? '').trim());
    await page.waitForFunction(() => (document.querySelector('#screen-exam .taunt')?.textContent ?? '').trim().length > 0, null, { timeout: 10_000, polling: 100 });
    const first = await tauntText();
    await page.waitForFunction((f) => { const t = (document.querySelector('#screen-exam .taunt')?.textContent ?? '').trim(); return t.length > 0 && t !== f; }, first, { timeout: 15_000, polling: 100 }).catch(() => {});
    const second = ((await page.textContent('#screen-exam .taunt').catch(() => '')) ?? '').trim();
    log(`monster: ${second}`);
    checks.push([second.length > 0 && second !== fixedTaunt, 'the monster’s second taunt was written on the device']);
    await page.locator('#screen-eat, #screen-lose').first().waitFor({ timeout: 150_000 });
    checks.push([true, `the round reached the end (${(await page.locator('#screen-eat').count()) ? 'won' : 'lost'})`]);

    const sent = [...new Set(routes)];
    checks.push([!routes.includes('/creature') && !routes.includes('/bars'), `the player's words stayed on the device: requests were ${sent.join(', ')}`]);
    checks.push([routes.includes('/reveal') && routes.includes('/examine'), '/reveal and /examine were used']);
    checks.push([errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`]);
  }
} catch (err) {
  failed = true;
  console.error(`smoke:opera FAILED: ${err.message}`);
} finally {
  await context.close().catch(() => {});
  server.kill();
}
if (skipped) {
  console.log(`smoke:opera skipped: ${skipped}`);
  process.exit(0);
}
for (const [ok, text] of checks) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`);
  if (!ok) failed = true;
}
console.log(failed ? 'smoke:opera FAILED' : 'smoke:opera ok');
process.exit(failed ? 1 : 0);
