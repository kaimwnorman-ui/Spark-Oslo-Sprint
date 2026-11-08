// smoke:loop: the learning loop end to end (SPEC §17), offline, in Chromium.
//   a round → memories, a comeback and a duel link → four days later: a fading memory, Your Blot,
//   a flashback that earns a power-up → the comeback (beaten ideas locked, the power-up used) →
//   a friend accepts the duel link in another browser and their Blot fights yours.
// Screenshots go to docs/shots/loop-*.png.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DIST, ROOT } from './lib.mjs';
import { serveDir } from './serve.mjs';

const SHOTS = process.env.SMOKE_SHOTS ?? path.join(ROOT, 'docs', 'shots');
const round = JSON.parse(readFileSync(path.join(ROOT, 'demo', 'rounds', 'tides.json'), 'utf8'));
const server = await serveDir(DIST);
const browser = await chromium.launch();
const viewport = { width: 1280, height: 720 };
const errors = [];
const checks = [];
const check = (ok, text) => checks.push([!!ok, text]);
const log = (...a) => console.log('  ·', ...a);

function watch(page, who) {
  page.on('console', (msg) => {
    // Nothing listens on :8787 here, and nothing may try: demo pages are graded in the browser, so any
    // failed request (to the server or anywhere else) is a console error and fails the run.
    if (msg.type() === 'error') errors.push(`${who}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`${who}: ${err.message}`));
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `loop-${name}.png`) });
const settle = (page, ms = 450) => page.waitForTimeout(ms);
/** True when the element's box ends above `limit` (px from the top); used to catch overflowing layouts. */
const bottomOf = async (page, selector) => {
  const box = await page.locator(selector).last().boundingBox();
  return box ? box.y + box.height : Infinity;
};
/** The element is fully inside the window (nothing clipped off the bottom of a screen that cannot scroll). */
const reachableInWindow = (page, selector) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    return !!r && r.width > 0 && r.top >= -1 && r.bottom <= document.documentElement.clientHeight + 1 && r.right <= document.documentElement.clientWidth + 1;
  }, selector);
const storage = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(`spark:${k}`) ?? 'null'), key);

async function blotDone(page) {
  await page.waitForTimeout(60);
  await page.waitForFunction(
    () => !document.querySelector('.bubble.typing') && document.querySelector('#screen-teach')?.getAttribute('data-busy') !== '1',
    null,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(80);
}

/** Teaches one idea: Say it, then (optionally) Give an example, with the round's scripted lines. */
async function teach(page, ideaId, withExample = true) {
  const lines = round.lines[ideaId];
  if ((await page.locator(`.idea[data-id="${ideaId}"][aria-pressed="true"]`).count()) === 0) await page.click(`.idea[data-id="${ideaId}"]`);
  const say = page.locator('.move[data-move="say"]');
  if (await say.count()) await say.click(); // a first-time player has no tabs yet: Say it is the only action
  await page.fill('#teach-input', lines.say);
  await page.click('#btn-send');
  await blotDone(page);
  // Blot may ask a question (why, when, an example): answer a why, otherwise carry on.
  if ((await page.locator('#panel[data-kind="why"]').count()) > 0) {
    await page.fill('#teach-input', lines.why);
    await page.click('#btn-send');
    await blotDone(page);
  }
  if (!withExample) return;
  await page.click('.move[data-move="example"]');
  await page.fill('#teach-input', lines.example);
  await page.click('#btn-send');
  await blotDone(page);
}

async function ringBell(page) {
  await page.click('#btn-bell');
  await page.waitForTimeout(250);
  await page.click('#btn-bell', { force: true });
}

/** From the bell to the replay, whoever wins. */
async function finishRound(page) {
  await page.locator('#screen-eat, #screen-lose').first().waitFor({ timeout: 120_000 });
  const won = (await page.locator('#screen-eat').count()) > 0;
  if (won) {
    await page.locator('#btn-replay').waitFor({ timeout: 20_000 });
    await page.click('#btn-replay');
  } else {
    await page.click('#btn-see-replay');
  }
  await page.locator('#screen-replay').waitFor({ timeout: 20_000 });
  await settle(page);
  return won;
}

let failed = false;
try {
  const started = Date.now();
  const base = `${server.url}/game.html`;

  // ---- 0. A brand-new player opening Your Blot: friendly empty states, one way forward.
  const fresh = await (await browser.newContext({ viewport })).newPage();
  watch(fresh, 'new player');
  await fresh.goto(`${base}?blot=1`);
  await fresh.locator('#screen-blot').waitFor();
  await settle(fresh);
  check((await fresh.textContent('#btn-blot-primary'))?.includes('Play the demo') && (await fresh.locator('.empty-note').count()) === 2, 'Your Blot, empty: two friendly empty states and "Play the demo"');
  await shot(fresh, '00-your-blot-empty');
  await fresh.context().close();

  // ---- 0b. Defaults: a bare demo URL gets the real 45-second timer, not 20 seconds (the ?teach bug).
  const bare = await (await browser.newContext({ viewport })).newPage();
  watch(bare, 'bare URL');
  await bare.goto(`${base}?demo=tides`);
  await bare.click('#btn-transform');
  await bare.locator('#btn-teach:not(.hidden)').waitFor({ timeout: 25_000 });
  await bare.click('#btn-teach');
  await bare.locator('#screen-teach').waitFor();
  const t0 = await bare.textContent('#timer');
  check(t0 === '0:45' || t0 === '0:44', `a bare demo URL starts teaching at ${t0}, not 0:20`);
  // A first-time player opens on the first idea with one visible action; the other moves come after the first message.
  check((await bare.locator('.idea[data-id="i1"][aria-pressed="true"]').count()) === 1 && (await bare.locator('.move').count()) === 0, 'a first-time player opens on the first idea with one action (no move tabs yet)');
  // Leaving with unsaved work asks first; with nothing to lose it does not.
  const leaveAsks = () =>
    bare.evaluate(() => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
  const askedWhenIdle = await leaveAsks();
  await bare.fill('#teach-input', 'The Moon pulls harder on the near water than on the far water.');
  const askedWithText = await leaveAsks();
  check(!askedWhenIdle && askedWithText, 'leaving mid-round asks first, but only once there is something to lose');
  await bare.click('#btn-send');
  await bare.locator('.move[data-move="example"]').waitFor({ timeout: 15_000 });
  check((await bare.locator('.move').count()) === 4, 'after the first message the other moves appear');
  await bare.context().close();

  // ---- 0b2. A reload in the middle of a round offers to pick it up again (what was taught, and the time left).
  const reloader = await (await browser.newContext({ viewport })).newPage();
  watch(reloader, 'reload');
  reloader.on('dialog', (d) => void d.accept()); // the leave warning: yes, reload
  await reloader.goto(`${base}?demo=tides&fast=1&teach=90`);
  await reloader.click('#btn-transform');
  await reloader.locator('#btn-teach:not(.hidden)').waitFor({ timeout: 25_000 });
  await reloader.click('#btn-teach');
  await reloader.locator('#screen-teach').waitFor();
  await reloader.fill('#teach-input', 'The ocean stretches into two bulges, one facing the Moon and one on the far side.');
  await reloader.click('#btn-send');
  await blotDone(reloader);
  await reloader.waitForTimeout(500);
  const before = await reloader.$eval('.idea[data-id="i1"] .ink-fill', (el) => parseFloat(el.style.width));
  await reloader.reload();
  await reloader.locator('#screen-resume').waitFor({ timeout: 15_000 });
  const detail = (await reloader.textContent('#resume-detail')) ?? '';
  check(/1 of 5 ideas taught/.test(detail), `a reload offers to resume: "${detail.trim()}"`);
  await shot(reloader, '00b-resume');
  await reloader.click('#btn-resume');
  await reloader.locator('#screen-teach').waitFor();
  const after = await reloader.$eval('.idea[data-id="i1"] .ink-fill', (el) => parseFloat(el.style.width));
  const left = await reloader.textContent('#timer');
  check(after > 0 && after === before && /^(1:2\d|1:30|1:1\d)$/.test(left ?? ''), `resuming brings the work back (bar ${after}%) with the time that was left (${left})`);
  check(/Welcome back/.test((await reloader.textContent('.teach-bubble')) ?? ''), 'and Blot welcomes the player back');
  await reloader.reload();
  await reloader.locator('#screen-resume').waitFor({ timeout: 15_000 });
  await reloader.click('#btn-restart');
  await reloader.locator('#btn-transform').waitFor({ timeout: 15_000 });
  await reloader.reload();
  await reloader.locator('#btn-transform').waitFor({ timeout: 15_000 });
  check((await reloader.locator('#screen-resume').count()) === 0, 'Start over forgets the saved round');
  await reloader.context().close();

  // ---- 0c. The stage round is a rehearsal: four ideas taught for you, nothing recorded about your history.
  const stage = await (await browser.newContext({ viewport })).newPage();
  watch(stage, 'stage');
  await stage.goto(`${base}?demo=stage&fast=1&teach=90`);
  await stage.click('#btn-transform');
  await stage.locator('#btn-teach:not(.hidden)').waitFor({ timeout: 25_000 });
  const stageNote = (await stage.textContent('#attack-note')) ?? '';
  check(/Four ideas are already taught for you/.test(stageNote) && (await stage.locator('.attack.taught').count()) === 4 && (await stage.locator('.attack.weak').count()) === 1, `the stage reveal says what is done: "${stageNote.trim()}"`);
  await shot(stage, '00c-stage-reveal');
  await stage.click('#btn-teach');
  await stage.locator('#screen-teach').waitFor();
  check((await stage.locator('.idea[data-id="i5"][aria-pressed="true"]').count()) === 1 && /Stage/.test((await stage.textContent('#coach-note')) ?? ''), 'teaching opens on the one idea left, with a stage note');
  await teach(stage, 'i5');
  await ringBell(stage);
  const stageWon = await finishRound(stage);
  const stageMemory = await storage(stage, 'memory');
  check(stageWon, 'the stage round ends in a win');
  check(!(await storage(stage, 'history'))?.length && !stageMemory?.comebacks?.length, 'a rehearsal leaves no history and no comeback');
  check(stageMemory?.cards?.length === 1, `only the idea the player taught became a memory (${stageMemory?.cards?.length} card, not five)`);
  check((await stage.locator('#btn-challenge').count()) === 0 && /rehearsal/.test((await stage.textContent('.replay-head .card-kicker')) ?? ''), 'a rehearsal offers no duel and says so');
  await stage.context().close();

  // ---- 0d. The presenter kit: one URL loads a learner four days in, and the same trait is shining, then solid, then faded.
  const kit = await (await browser.newContext({ viewport })).newPage();
  watch(kit, 'presenter kit');
  await kit.goto(`${base}?seed=presenter`);
  await kit.locator('#presenter-tabs').waitFor();
  check((await kit.locator('.presenter-tab').count()) === 6, 'the presenter kit lists six ready tabs');
  await settle(kit);
  await shot(kit, '00d-presenter');
  await kit.goto(`${base}?blot=1`);
  await kit.locator('#screen-blot').waitFor();
  check((await kit.locator('.trait-chip.look-shining').count()) === 1, 'day 0: the trait is shining');
  await kit.goto(`${base}?blot=1&days=4`);
  await kit.locator('#screen-blot').waitFor();
  await settle(kit);
  check((await kit.locator('.trait-chip.look-solid').count()) === 1 && (await kit.locator('.memory.fresh-fading').count()) >= 4 && (await kit.locator('.insight[data-code="trust"]').count()) === 1, 'day 4: the trait is solid, memories are fading, Blot’s tip is "Blot fooled you"');
  await shot(kit, '00e-presenter-day4');
  await kit.goto(`${base}?blot=1&days=7`);
  await kit.locator('#screen-blot').waitFor();
  check((await kit.locator('.trait-chip.look-faded').count()) === 1, 'day 7: the same trait has faded');
  await kit.goto(`${base}?seed=presenter`);
  await kit.locator('#screen-error').waitFor();
  check(/already has learning history/.test((await kit.textContent('#screen-error')) ?? '') && (await storage(kit, 'history')).length === 2, 'the kit never overwrites a real learner');
  await kit.context().close();

  const me = await (await browser.newContext({ viewport })).newPage();
  watch(me, 'player');

  // ---- 1. A round: two ideas taught, three left empty.
  await me.goto(`${base}?demo=tides&fast=1&teach=90`);
  await me.click('#btn-transform');
  await me.locator('#btn-teach:not(.hidden)').waitFor({ timeout: 20_000 });
  await me.click('#btn-teach');
  await me.locator('#screen-teach').waitFor();
  await teach(me, 'i1');
  await teach(me, 'i2', false);
  await ringBell(me);
  // Blot quietly misread "Difference in pull": when it backfires, the monster quotes the belief and says what is true.
  const counter = me
    .waitForFunction(() => /^“.+”\? Ha! No: /.test(document.querySelector('.monster-says')?.textContent ?? ''), null, { timeout: 150_000, polling: 'raf' })
    .then(() => me.textContent('.monster-says'), () => null);
  const won1 = await finishRound(me);
  const countered = await counter;
  check(!!countered, `the counterattack quotes what Blot believed and says what is true: "${(countered ?? '').slice(0, 90)}…"`);
  log(`round 1: ${won1 ? 'won' : 'lost'}`);
  const memory1 = await storage(me, 'memory');
  const history1 = await storage(me, 'history');
  check(memory1?.cards?.length >= 2 && history1?.length === 1, `the round became memories (${memory1?.cards?.length} cards) and history (${history1?.length} round)`);
  check(memory1?.comebacks?.length === 1 && memory1.comebacks[0].ideaId === 'i3', `the monster will come back with its weakest idea (${memory1?.comebacks?.[0]?.ideaName})`);
  check((await me.locator('#loop-comeback, #loop-memory').count()) >= 1 && (await me.locator('#loop-tip').count()) === 1, 'the replay says what happens next, with one tip');
  const footTop = (await me.locator('.replay-foot').boundingBox()).y;
  check((await bottomOf(me, '.replay-row')) <= footTop + 1, 'all five replay rows fit above the footer');
  await shot(me, '01-replay');

  // ---- 2. Challenge a friend: a duel link.
  await me.click('#btn-challenge');
  await me.locator('#share-name').waitFor();
  await me.fill('#share-name', 'Kai');
  await shot(me, '02-share');
  await me.click('#btn-make-link');
  await me.locator('#share-link').waitFor({ timeout: 5000 });
  const link = await me.inputValue('#share-link');
  check(/game\.html\?duel=L[A-Za-z0-9_-]+$/.test(link), `a duel link that works offline (${link.length} characters)`);
  await settle(me, 300);
  check(/name and scores travel inside the link/.test((await me.textContent('#share-note')) ?? ''), 'the share dialog says what travels in the link');
  await shot(me, '03-share-link');
  await me.click('#btn-share-close');

  // ---- 3. Four days later: a memory is fading.
  await me.goto(`${base}?days=4`);
  await me.locator('#screen-home').waitFor();
  await settle(me);
  check((await me.locator('#btn-your-blot .badge').count()) === 1, 'home: "Your Blot" shows a fading memory');
  check((await me.locator('#btn-home-comeback').count()) === 1, 'home: the comeback is the one primary action');
  check((await bottomOf(me, '.more-pages')) <= 720, 'home: the card fits the screen');
  await shot(me, '04-home-later');

  // ---- 4. Your Blot.
  await me.click('#btn-your-blot');
  await me.locator('#screen-blot').waitFor();
  await settle(me);
  const tips = await me.locator('.insight').count();
  const fading = await me.locator('.memory.fresh-fading').count();
  check(tips >= 1 && fading >= 2, `Your Blot: ${tips} insights, ${fading} fading memories`);
  check((await me.textContent('#btn-blot-primary'))?.includes('Remind Blot'), 'Your Blot: "Remind Blot" is the next step');
  check(new URL(me.url()).searchParams.get('days') === '4', 'time travel (?days) survives navigation');
  await shot(me, '05-your-blot');

  // ---- 5. The flashback: remembered well, it earns a power-up.
  await me.click('#btn-blot-primary');
  await me.locator('#screen-flashback').waitFor();
  await settle(me);
  const question = (await me.textContent('#flash-question'))?.trim();
  const card = (await storage(me, 'memory')).cards.find((c) => c.question === question);
  check(!!card, `Blot asks a real question from the round: "${question}"`);
  await shot(me, '06-flashback');
  await me.fill('#flash-input', card.modelAnswer);
  await me.click('#btn-remind');
  await me.locator('#flash-score').waitFor({ timeout: 15_000 });
  await settle(me, 900);
  const score = Number(await me.textContent('#flash-score'));
  const earned = await me.locator('#flash-earned.earned').count();
  check(score >= 60 && earned === 1, `a good answer passes (${score}) and earns a power-up`);
  await shot(me, '07-flashback-result');
  await me.click('#btn-flash-continue');
  await me.locator('#screen-blot').waitFor();
  const powers = (await storage(me, 'memory')).powerUps;
  check(powers.refill + powers.double === 1, `the power-up is banked (refill ${powers.refill}, double ${powers.double})`);
  const refreshed = (await storage(me, 'memory')).cards.find((c) => c.id === card.id);
  check(refreshed.stage === 1 && refreshed.recalls === 1, 'the memory moves a step further apart (next check in 7 days)');

  // ---- 5b. A new page, four days on: Blot first asks about the other fading memory, then the
  //          coach adapts the round to what this player struggles with.
  await me.goto(`${base}?demo=pvalue&days=4&fast=1&teach=90`);
  await me.click('#btn-transform');
  await me.locator('#btn-teach:not(.hidden)').waitFor({ timeout: 20_000 });
  await me.click('#btn-teach');
  await me.locator('#screen-flashback').waitFor({ timeout: 10_000 });
  await settle(me);
  const other = (await me.textContent('#flash-question'))?.trim();
  check(other && other !== question, `before a new round, Blot asks about another fading memory: "${other}"`);
  await shot(me, '07b-flashback-in-round');
  await me.click('#btn-skip-flash');
  await me.locator('#screen-teach').waitFor();
  await settle(me);
  const coach = (await me.textContent('#coach-note').catch(() => ''))?.trim();
  check(!!coach, `the coach adapts the round: "${coach}"`);
  await shot(me, '07c-coach');

  // ---- 6. The comeback: the beaten ideas are locked, only the weak one is taught.
  await me.goto(`${base}?comeback=${encodeURIComponent(memory1.comebacks[0].id)}&days=4&fast=1&teach=90`);
  await me.locator('#btn-teach:not(.hidden)').waitFor({ timeout: 20_000 });
  await settle(me);
  check((await me.locator('.attack.beaten').count()) === 4 && (await me.locator('.attack.weak').count()) === 1, 'the comeback: four ideas crossed out, the weak one glowing');
  await shot(me, '08-comeback');
  await me.click('#btn-teach');
  await me.locator('#screen-teach').waitFor();
  await settle(me);
  check((await me.locator('.idea.locked').count()) === 4 && (await me.locator('.idea[data-id="i3"][aria-pressed="true"]').count()) === 1, 'teaching opens on the weak idea; the others are locked');
  await shot(me, '09-comeback-teach');
  await teach(me, 'i3');
  await ringBell(me);
  await me.locator('#powerups-used').waitFor({ timeout: 20_000 });
  await settle(me, 300);
  check(true, 'Blot uses the power-up during the exam');
  await shot(me, '10-powerup');
  await me.locator('#screen-bout').waitFor({ timeout: 40_000 });
  const boutPower = await me.locator('.bout-powerups .powerup-chip').count();
  check(boutPower === 1, 'the bout shows the power-up');
  await settle(me, 300);
  await shot(me, '11-comeback-bout');
  const won2 = await finishRound(me);
  const memory2 = await storage(me, 'memory');
  log(`comeback: ${won2 ? 'won' : 'lost'}`);
  check(
    won2 ? memory2.comebacks.length === 0 && memory2.tamed === 1 && (await me.locator('#loop-tamed').count()) === 1 : memory2.comebacks[0]?.tries === 1,
    won2 ? 'the monster is tamed for good' : 'the monster will come back again',
  );
  check(memory2.powerUps.refill + memory2.powerUps.double === 0, 'the power-up was spent');
  await shot(me, '12-comeback-replay');

  // ---- 6b. A real page's comeback (no canned round): graded against the idea's revealed answer.
  const i3 = round.lesson.ideas.find((i) => i.id === 'i3');
  await me.evaluate(([lesson, weak]) => {
    const m = JSON.parse(localStorage.getItem('spark:memory'));
    const t = Date.now();
    m.comebacks.push({
      id: 'mkraken', monsterName: 'The Page Kraken', shape: 'crab', color: '#0b7a8a', topic: lesson.topic, words: lesson.words, language: 'en',
      demoId: null, ideaId: weak.id, ideaName: weak.name, question: weak.question, keyPoints: weak.keyPoints, modelAnswer: weak.modelAnswer,
      ideas: lesson.ideas.map((i) => ({ id: i.id, name: i.name, score: i.id === weak.id ? 0 : 75 })),
      sourceUrl: null, sourceTitle: null, createdAt: t - 2 * 86400000, dueAt: t - 86400000, tries: 0, live: false,
    });
    localStorage.setItem('spark:memory', JSON.stringify(m));
  }, [round.lesson, i3]);
  await me.goto(`${base}?comeback=mkraken&fast=1&teach=90`);
  await me.locator('#btn-teach:not(.hidden)').waitFor({ timeout: 20_000 });
  await me.click('#btn-teach');
  await me.locator('#screen-teach').waitFor();
  check((await me.locator('.move[data-move="when"]').count()) === 0, 'a real page’s comeback hides "Tell when" (its situations were never revealed)');
  await teach(me, 'i3');
  await ringBell(me);
  const won3 = await finishRound(me);
  const kraken = (await storage(me, 'memory')).comebacks.find((c) => c.id === 'mkraken');
  const row = await me.textContent('.replay-row[data-id="i3"] .score');
  check(Number(row) > 0 && (won3 ? !kraken : kraken?.tries === 1), `the real page’s comeback is graded offline (${row}) and ${won3 ? 'tamed' : 'comes back again'}`);

  // ---- 6c. A trait explains itself, and Clear my data erases everything Spark remembers.
  await me.goto(`${base}?blot=1`);
  await me.locator('#btn-clear-data').waitFor();
  await me.locator('.trait-chip').first().click();
  const traitText = (await me.textContent('#trait-detail')) ?? '';
  check(/From “Later every day”/.test(traitText) && /The idea:/.test(traitText), `tapping a trait shows the idea that earned it: "${traitText.slice(0, 70).replace(/\s+/g, ' ')}…"`);
  await settle(me, 500);
  check((await reachableInWindow(me, '#trait-detail')) && (await reachableInWindow(me, '#btn-blot-primary')), 'the open trait panel and the primary action both fit in the window');
  await shot(me, '11a-trait');
  await me.click('#btn-clear-data');
  check(/Tap again/.test((await me.textContent('#btn-clear-data')) ?? ''), 'Clear my data asks once more before it erases anything');
  check((await storage(me, 'memory'))?.cards?.length > 0, 'one tap erased nothing');
  await me.click('#btn-clear-data');
  await me.locator('#screen-home').waitFor({ timeout: 10_000 });
  const gone = await me.evaluate(() => ['memory', 'history', 'traits', 'playerName', 'played'].every((k) => localStorage.getItem(`spark:${k}`) === null));
  check(gone && (await me.locator('#btn-your-blot').count()) === 0, 'the second tap erased memories, history, traits and the name, and Home treats the player as new');
  await shot(me, '11b-cleared');

  // ---- 7. The friend: another browser opens the duel link.
  const friend = await (await browser.newContext({ viewport })).newPage();
  watch(friend, 'friend');
  await friend.goto(`${link}&fast=1&teach=90`);
  await friend.locator('#screen-duel-intro').waitFor();
  await settle(friend, 700);
  check((await friend.textContent('#duel-title'))?.includes('Kai'), 'the friend sees who challenged them');
  await shot(friend, '13-duel-intro');
  await friend.click('#btn-accept-duel');
  await friend.click('#btn-transform');
  await friend.locator('#btn-teach:not(.hidden)').waitFor({ timeout: 20_000 });
  await friend.click('#btn-teach');
  await friend.locator('#screen-teach').waitFor();
  for (const id of ['i1', 'i2', 'i4']) await teach(friend, id);
  await ringBell(friend);
  await friend.locator('#screen-exam .rival').waitFor({ timeout: 10_000 });
  check(true, 'in a duel, the friend’s Blot does the taunting');
  await settle(friend, 250);
  await shot(friend, '13b-duel-exam');
  await friend.locator('#screen-duel-bout').waitFor({ timeout: 40_000 });
  await settle(friend, 700);
  await shot(friend, '14-duel-bout');
  await friend.locator('#screen-duel-result').waitFor({ timeout: 60_000 });
  await settle(friend, 500);
  const duel = await friend.evaluate(() => window.__duel);
  check((await friend.locator('.duel-row:not(.head)').count()) === 5, `the duel result compares all five ideas (${duel?.outcome})`);
  await shot(friend, '15-duel-result');
  await friend.click('#btn-duel-replay');
  await friend.locator('#screen-replay').waitFor();
  check(/Kai/.test((await friend.textContent('.replay-head h1')) ?? ''), 'the replay names the duel');
  const screens = await friend.evaluate(() => window.__screens);
  const expected = ['duel-intro', 'page', 'forming', 'teach', 'exam', 'duel-bout', 'duel-result', 'replay'];
  check(JSON.stringify(screens) === JSON.stringify(expected), `the friend's screens: ${screens.join(' → ')}`);
  const fhist = await storage(friend, 'history');
  check(fhist?.[0]?.kind === 'duel', 'the duel counts in the friend’s history');
  log(`done in ${((Date.now() - started) / 1000).toFixed(0)} s`);
} catch (err) {
  failed = true;
  console.error(`smoke:loop FAILED: ${err.message}`);
} finally {
  await browser.close();
  await server.close();
}
check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
for (const [ok, text] of checks) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`);
  if (!ok) failed = true;
}
console.log(failed ? 'smoke:loop FAILED' : 'smoke:loop ok');
process.exit(failed ? 1 : 0);
