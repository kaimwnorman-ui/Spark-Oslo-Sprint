// The exam (masked by the monster's taunt), the bout, eating and the escape.
import { EXAMINER_WAIT_MS, TRAITS_WORN } from '../../../../shared/config.ts';
import { simulateBout } from '../../../../shared/bout.ts';
import { boutIdeas, chooseTrait, finalBelief, weakestIdeaId } from '../../../../shared/round.ts';
import type { BoutExchange, ExamResult } from '../../../../shared/types.ts';
import { ease, getSpeed, mark, recordFrame, reducedMotion, tween, wait } from '../anim.ts';
import { assetUrl } from '../assets.ts';
import { createBlot } from '../blot.ts';
import type { RoundCtx } from '../context.ts';
import { h } from '../dom.ts';
import { Effects } from '../effects.ts';
import { MonsterView } from '../monster.ts';
import { sfx } from '../sound.ts';
import { getLocal, setLocal } from '../storage.ts';
import { Bubble, inkSwirl, primary, secondary, showScreen } from '../ui.ts';

/** Live bars as a stand-in exam when the examiner is too slow (marked provisional). */
function provisionalExam(ctx: RoundCtx): ExamResult {
  return {
    results: ctx.lesson.ideas.map((i) => {
      const p = ctx.progress[i.id]!;
      const belief = finalBelief(p.belief, p.value);
      return { id: i.id, score: p.value, grounded: p.value >= 10, belief, creatureAnswer: '', tip: '' };
    }),
  };
}

/** The monster taunts for 6–8 s while the examiner runs (SPEC §12 "Masking latency"). */
export async function examScreen(ctx: RoundCtx): Promise<void> {
  const root = showScreen('exam', { home: ctx.onHome });
  root.style.backgroundImage = `url(${assetUrl('arena')})`;
  const monster = new MonsterView(ctx.monster.shape, ctx.monster.words, ctx.monster.color, 640, 400);
  const taunt = new Bubble('taunt');
  const blot = createBlot(170);
  blot.setTraits(ctx.traits);
  blot.setPose('listening');
  const blotBubble = new Bubble('blot-small');
  root.append(
    h('div', { class: 'exam-monster' }, taunt.el, monster.canvas),
    h('div', { class: 'exam-blot' }, blotBubble.el, blot.el),
    h('div', { class: 'exam-status' }, inkSwirl('Blot is getting ready…')),
  );
  let raf = 0;
  const loop = (now: number) => {
    recordFrame(now);
    monster.draw(now, { glow: 0.5 });
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const held = ctx.lesson.ideas.filter((i) => ctx.progress[i.id]!.belief === 'misread').map((i) => i.id);
  const started = performance.now();
  const exam = ctx.engine.examine(ctx.transcript, held).then(
    (r) => ({ ok: true as const, r }),
    () => ({ ok: false as const }),
  );
  const timeout = new Promise<{ ok: false }>((r) => setTimeout(() => r({ ok: false }), EXAMINER_WAIT_MS));
  const topic = ctx.lesson.topic.toLowerCase();
  taunt.set(`I am ${ctx.monster.name}! Nobody understands ${topic}. Nobody!`);
  sfx.reveal();
  await wait(2400);
  blotBubble.set(ctx.lines.ready);
  blot.setPose('excited');
  await wait(2000);
  taunt.set('Come on then, little blot. Show me what you know.');
  await wait(2100);
  const result = await Promise.race([exam, timeout]);
  if (result.ok) {
    ctx.exam = result.r;
    ctx.provisional = false;
  } else {
    ctx.exam = provisionalExam(ctx);
    ctx.provisional = true;
  }
  mark('exam-done');
  if (performance.now() - started < 6500 / getSpeed()) await wait(400);
  cancelAnimationFrame(raf);
  blot.destroy();
}

/** The bout (SPEC §8): HP bars, idea names, sparks, backfire, fizzle, ink-burst K.O. */
export async function boutScreen(ctx: RoundCtx): Promise<void> {
  const exam = ctx.exam!;
  const ideas = boutIdeas(ctx.lesson.ideas, exam);
  const result = simulateBout(ideas, (ctx.engine.seed + ctx.attempt * 7919) >>> 0);
  ctx.bout = result;
  const root = showScreen('bout', { home: null });
  root.style.backgroundImage = `url(${assetUrl('arena')})`;
  const reduce = reducedMotion();
  const effects = new Effects();
  const arena = h('div', { class: 'arena' });
  const hp = (who: string, label: string) =>
    h('div', { class: `hp hp-${who}` }, h('span', { class: 'hp-label' }, label), h('span', { class: 'hp-track' }, h('span', { class: 'hp-fill', id: `hp-${who}` })), h('span', { class: 'hp-num', id: `hp-${who}-num` }, '100'));
  const blot = createBlot(230);
  blot.setTraits(ctx.traits);
  const blotBubble = new Bubble('bout-bubble');
  const monster = new MonsterView(ctx.monster.shape, ctx.monster.words, ctx.monster.color, 560, 350);
  const slam = h('div', { class: 'slam-text', id: 'slam', 'aria-live': 'assertive' });
  const log = h('ol', { class: 'move-log', id: 'move-log', 'aria-label': 'What happened' });
  const blotBox = h('div', { class: 'fighter fighter-blot' }, blotBubble.el, blot.el);
  const monsterBox = h('div', { class: 'fighter fighter-monster' }, monster.canvas);
  arena.append(h('div', { class: 'hp-row' }, hp('blot', 'Blot'), h('span', { class: 'vs' }, 'VS'), hp('monster', ctx.monster.name)), blotBox, monsterBox, slam, log);
  if (ctx.provisional) arena.append(h('p', { class: 'provisional' }, 'Scores are provisional'));
  root.append(arena, effects.canvas);

  let hurt = 0;
  let shake = 0;
  let monsterAlpha = 1;
  let raf = 0;
  const loop = (now: number) => {
    recordFrame(now);
    monster.draw(now, { hurt, shake, alpha: monsterAlpha, glow: 0.6 });
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const setHp = (who: 'blot' | 'monster', value: number) => {
    const fill = document.getElementById(`hp-${who}`)!;
    fill.style.width = `${Math.max(0, value)}%`;
    fill.classList.toggle('low', value <= 30);
    document.getElementById(`hp-${who}-num`)!.textContent = String(Math.max(0, Math.round(value)));
  };
  const centreOf = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const screenShake = (power: number) => {
    if (reduce) return;
    arena.classList.remove('shake');
    void arena.offsetWidth;
    arena.style.setProperty('--shake', `${power}px`);
    arena.classList.add('shake');
  };
  const showSlam = (text: string, kind: string) => {
    slam.textContent = text;
    slam.className = `slam-text show ${kind}`;
  };
  const addLog = (text: string) => {
    log.append(h('li', null, text));
    while (log.children.length > 5) log.firstElementChild?.remove();
  };

  // Pacing: the whole bout lasts ~54 s of game time (36 s at demo speed, SPEC §8 + M2).
  // Short bouts (an early K.O.) give the extra time to the ending, so every bout lasts 30–45 s at demo speed.
  const TOTAL = 54_000;
  const intro = 2600;
  const n = Math.max(1, result.exchanges.length);
  const perExchange = Math.min(12_000, Math.max(6500, (TOTAL - intro - 2600) / n));
  const outro = Math.max(2600, TOTAL - intro - n * perExchange);
  mark('bout-start');
  showSlam('FIGHT!', 'fight');
  sfx.bell();
  blot.setPose('attacking', 900);
  await wait(intro);

  let blotHp = 100;
  let monsterHp = 100;
  for (const [i, x] of result.exchanges.entries()) {
    const label = x.suddenDeath ? `Sudden death: ${x.name}` : x.name;
    await exchange(x, label, i);
    blotHp = x.blotHp;
    monsterHp = x.monsterHp;
  }

  async function exchange(x: BoutExchange, label: string, index: number) {
    const unit = perExchange / 9;
    const startedAt = performance.now();
    // The monster attacks with this idea.
    showSlam(label, 'attack');
    sfx.whoosh();
    monsterBox.classList.add('lunge');
    await wait(unit * 2);
    monsterBox.classList.remove('lunge');
    if (x.kind === 'hit') {
      blot.setPose('attacking', unit * 2);
      blotBox.classList.add('lunge');
      blotBubble.set(ctx.lines.hit);
      await wait(unit * 0.8);
      blotBox.classList.remove('lunge');
      const big = x.dealt >= 25;
      sfx.hit(big);
      const c = centreOf(monster.canvas);
      effects.sparks(c.x, c.y, '#ffd34d', big ? 30 : 18, big ? 1.4 : 1);
      showSlam(`${x.name}!`, big ? 'hit big' : 'hit');
      screenShake(big ? 12 : 5);
      await tween(unit * 1.2, (t) => {
        hurt = 1 - t;
        shake = reduce ? 0 : Math.sin(t * 40) * 8 * (1 - t);
      });
      hurt = 0;
      shake = 0;
      setHp('monster', x.monsterHp);
      addLog(`Blot used ${x.name}: ${x.dealt} damage.`);
    } else if (x.kind === 'backfire') {
      const misread = ctx.exam?.results.find((r) => r.id === x.ideaId)?.creatureAnswer || 'Wait, I thought…';
      blot.setPose('confused', unit * 3);
      blotBubble.set(misread);
      showSlam('BACKFIRE!', 'backfire');
      await wait(unit * 1.6);
      sfx.backfire();
      blotBox.classList.add('spin');
      await wait(unit * 1.2);
      blotBox.classList.remove('spin');
      addLog(`Blot misread ${x.name}. Backfire!`);
    } else {
      blot.setPose('confused', unit * 3);
      blotBubble.set(ctx.lines.fizzle);
      showSlam('fizzle…', 'fizzle');
      sfx.fizzle();
      const c = centreOf(blot.el);
      effects.sparks(c.x, c.y - 60, '#9a94b8', 10, 0.5);
      await wait(unit * 2.4);
      addLog(`Blot didn't know ${x.name}. Fizzle.`);
    }
    // The monster's attack lands (unless it is already down).
    if (x.taken > 0) {
      blot.setPose('hurt', unit * 1.6);
      sfx.hit(x.taken >= 20);
      const c = centreOf(blot.el);
      effects.sparks(c.x, c.y, ctx.monster.color, 14, 0.9);
      screenShake(x.taken >= 20 ? 10 : 4);
      setHp('blot', x.blotHp);
      addLog(`${ctx.monster.name} hit back: ${x.taken}.`);
    }
    await wait(unit * 2);
    blotBubble.set('');
    slam.className = 'slam-text';
    // Pad to the exchange's full share of the bout.
    const left = perExchange / getSpeed() - (performance.now() - startedAt);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
    void index;
  }

  // The end: ink-burst K.O. or a decision.
  const won = result.outcome === 'win';
  if (result.knockout) {
    showSlam(ctx.lines.ko, 'ko');
    sfx.ko();
    const loser = won ? monster.canvas : blot.el;
    const c = centreOf(loser);
    effects.inkBurst(c.x, c.y, won ? ctx.monster.color : '#1d1a2f', ctx.monster.words, 80);
    screenShake(18);
    if (won) await tween(900, (t) => (monsterAlpha = 1 - t * 0.85));
    else blot.setPose('hurt');
  } else {
    showSlam(won ? 'Blot wins on points!' : result.outcome === 'draw' ? 'A draw!' : `${ctx.monster.name} wins on points`, won ? 'ko' : 'fizzle');
  }
  blotBubble.set('');
  if (won) {
    sfx.win();
    blot.setPose('proud');
  } else {
    sfx.lose();
    blot.setPose('hurt');
  }
  await wait(outro - 900);
  mark('bout-end');
  cancelAnimationFrame(raf);
  blot.destroy();
  effects.destroy();
  void blotHp;
  void monsterHp;
}

/** Win: the monster's letters stream into Blot's mouth like noodles, then a new trait (SPEC §9). */
export async function eatScreen(ctx: RoundCtx): Promise<'replay'> {
  const root = showScreen('eat', { home: ctx.onHome });
  root.style.backgroundImage = `url(${assetUrl('arena')})`;
  const effects = new Effects();
  const blot = createBlot(280);
  blot.setTraits(ctx.traits);
  blot.setPose('eating');
  const monster = new MonsterView(ctx.monster.shape, ctx.monster.words, ctx.monster.color, 520, 325);
  const headline = h('h1', { class: 'eat-title' }, `Blot is eating ${ctx.monster.name}!`);
  const blotBox = h('div', { class: 'eat-blot' }, blot.el);
  const monsterBox = h('div', { class: 'eat-monster' }, monster.canvas);
  root.append(headline, blotBox, monsterBox, effects.canvas);
  let monsterAlpha = 1;
  let raf = 0;
  const loop = (now: number) => {
    recordFrame(now);
    monster.draw(now, { alpha: monsterAlpha });
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  mark('eat-start');

  // Noodles: up to 90 of the monster's letters/words stream into the mouth.
  const box = monster.canvas.getBoundingClientRect();
  const pts = monster.targets(90).map((t, i) => ({
    text: ctx.monster.words[i % ctx.monster.words.length]!.slice(0, 1 + (i % 3) * 3),
    x: box.left + t.x,
    y: box.top + t.y,
  }));
  sfx.gulp();
  const stream = effects.noodlesTo(pts, () => blot.mouthPoint(), ctx.monster.color, reducedMotion() ? 900 : 3000);
  void tween(3000, (t) => (monsterAlpha = 1 - t), ease.inCubic);
  setTimeout(() => sfx.gulp(), 1400 / getSpeed());
  await stream;
  mark('eat-end');
  monsterBox.remove();

  // The trait from the highest-scoring idea.
  const trait = chooseTrait(ctx.exam!, ctx.lesson.ideas, { name: ctx.monster.name, color: ctx.monster.color }, Date.now());
  ctx.trait = trait;
  if (trait) {
    const worn = [...ctx.traits, trait].slice(-TRAITS_WORN);
    ctx.traits = worn;
    const all = await getLocal<typeof worn>('traits', []);
    await setLocal('traits', [...all, trait].slice(-50));
    blot.setTraits(worn);
  }
  blot.setPose('proud');
  sfx.win();
  const looks = { wobbly: 'a bit wobbly', solid: 'solid', shining: 'shining' } as const;
  headline.textContent = 'Gulp! Blot grew a new trait.';
  root.append(
    h(
      'div',
      { class: 'trait-card', id: 'trait-card' },
      trait
        ? [
            h('p', { class: 'card-kicker' }, 'New trait'),
            h('h2', { id: 'trait-name' }, `${capitalise(trait.word)} ${trait.kind}`),
            h('p', null, `From “${trait.ideaName}”, your best idea. It looks ${looks[trait.look]}.`),
          ]
        : h('p', null, 'Blot is full.'),
      primary('btn-replay', 'See the replay'),
    ),
  );
  const btn = document.getElementById('btn-replay')!;
  btn.focus();
  await new Promise<void>((r) => btn.addEventListener('click', () => r(), { once: true }));
  cancelAnimationFrame(raf);
  blot.destroy();
  effects.destroy();
  return 'replay';
}

/** Loss: the monster escapes with the page; a rematch on the weakest idea (SPEC §9). */
export async function loseScreen(ctx: RoundCtx): Promise<'rematch' | 'replay'> {
  const root = showScreen('lose', { home: ctx.onHome });
  root.style.backgroundImage = `url(${assetUrl('arena')})`;
  const blot = createBlot(220);
  blot.setTraits(ctx.traits);
  blot.setPose('hurt');
  const monster = new MonsterView(ctx.monster.shape, ctx.monster.words, ctx.monster.color, 480, 300);
  const monsterBox = h('div', { class: 'lose-monster' }, monster.canvas);
  const weakest = weakestIdeaId(ctx.exam!) ?? ctx.lesson.ideas[0]!.id;
  const weakName = ctx.lesson.ideas.find((i) => i.id === weakest)?.name ?? '';
  const bubble = new Bubble('lose-bubble');
  root.append(
    h('h1', { class: 'lose-title' }, ctx.bout?.outcome === 'draw' ? `A draw! ${ctx.lines.escaped}` : ctx.lines.escaped),
    monsterBox,
    h('div', { class: 'lose-blot' }, bubble.el, blot.el),
    h(
      'div',
      { class: 'lose-actions' },
      primary('btn-rematch', `Rematch: teach “${weakName}”`),
      secondary('btn-see-replay', 'See the replay'),
    ),
  );
  let raf = 0;
  let x = 0;
  const loop = (now: number) => {
    recordFrame(now);
    monster.draw(now);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  void tween(2200, (t) => {
    x = t;
    monsterBox.style.transform = `translateX(${x * 60}vw) rotate(${x * 8}deg)`;
    monsterBox.style.opacity = String(1 - x * 0.8);
  }, ease.inCubic);
  await wait(900);
  bubble.set(ctx.lines.rematch(weakName));
  const choice = await new Promise<'rematch' | 'replay'>((resolve) => {
    document.getElementById('btn-rematch')!.addEventListener('click', () => resolve('rematch'), { once: true });
    document.getElementById('btn-see-replay')!.addEventListener('click', () => resolve('replay'), { once: true });
  });
  ctx.focus = weakest;
  cancelAnimationFrame(raf);
  blot.destroy();
  return choice;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
