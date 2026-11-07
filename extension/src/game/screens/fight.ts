// The exam (masked by the monster's taunt), the bout, eating and the escape.
import { EXAMINER_WAIT_MS, TRAITS_WORN } from '../../../../shared/config.ts';
import { REFILL_HP } from '../../../../shared/memory.ts';
import { simulateBout } from '../../../../shared/bout.ts';
import { boutIdeas, chooseTrait, finalBelief, weakestIdeaId } from '../../../../shared/round.ts';
import type { BoutExchange, ExamResult } from '../../../../shared/types.ts';
import { ease, getSpeed, mark, recordFrame, reducedMotion, tween, wait } from '../anim.ts';
import { assetBackground } from '../assets.ts';
import { createBlot } from '../blot.ts';
import type { RoundCtx } from '../context.ts';
import { h } from '../dom.ts';
import { Effects } from '../effects.ts';
import { MonsterView } from '../monster.ts';
import { sfx } from '../sound.ts';
import { addTrait } from '../memory-store.ts';
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
  root.style.backgroundImage = assetBackground('arena');
  // In a duel the friend's Blot does the taunting; otherwise the page's monster does.
  const duel = ctx.kind === 'duel' ? ctx.duel : null;
  const monster = duel ? null : new MonsterView(ctx.monster.shape, ctx.monster.words, ctx.monster.color, 640, 400, 'left');
  const rival = duel ? createBlot(230) : null;
  rival?.el.classList.add('rival');
  rival?.setPose('proud');
  const taunt = new Bubble(duel ? 'taunt rival-taunt' : 'taunt');
  const blot = createBlot(170);
  blot.setTraits(ctx.traits);
  blot.setPose('listening');
  const blotBubble = new Bubble('blot-small');
  root.append(
    h('div', { class: 'exam-monster' }, taunt.el, monster?.canvas ?? h('div', { class: 'mirror' }, rival!.el)),
    h('div', { class: 'exam-blot' }, blotBubble.el, blot.el),
    h('div', { class: 'exam-status' }, inkSwirl('Blot is getting ready…')),
  );
  let raf = 0;
  const loop = (now: number) => {
    recordFrame(now);
    monster?.draw(now, { glow: 0.5 });
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const held = ctx.lesson.ideas.filter((i) => ctx.progress[i.id]!.belief === 'misread').map((i) => i.id);
  const started = performance.now();
  const exam = ctx.engine.examine(ctx.transcript, held).then(
    (r) => ({ ok: true as const, r }),
    (err) => {
      ctx.onEngineError?.(err);
      return { ok: false as const };
    },
  );
  const timeout = new Promise<{ ok: false }>((r) => setTimeout(() => r({ ok: false }), EXAMINER_WAIT_MS));
  const topic = ctx.lesson.topic.toLowerCase();
  // On the device (Opera WebAI) the monster's second line is written fresh while the intro plays;
  // if it isn't ready in time, the fixed line stands.
  let freshTaunt: string | null = null;
  if (!duel) void ctx.engine.taunt?.(ctx.monster.name, ctx.lesson.topic).then((t) => (freshTaunt = t), () => {});
  taunt.set(duel ? `I’m ${duel.name}’s Blot. ${duel.name} taught me ${topic}. All of it!` : `I am ${ctx.monster.name}! Nobody understands ${topic}. Nobody!`);
  sfx.reveal();
  await wait(2400);
  // Power-ups earned by remembering (SPEC §17): Blot uses them now, while the examiner runs.
  const used = new Set(ctx.boostsUsed);
  if (used.size) {
    const chips = h('div', { class: 'powerups-used', id: 'powerups-used', 'aria-label': 'Power-ups used' });
    if (used.has('refill')) chips.append(h('span', { class: 'powerup-chip refill' }, h('span', { class: 'pu-icon', 'aria-hidden': 'true' }, '🧪'), `Ink refill +${REFILL_HP} HP`));
    if (used.has('double')) chips.append(h('span', { class: 'powerup-chip double' }, h('span', { class: 'pu-icon', 'aria-hidden': 'true' }, '✦'), 'Double ink: first hit ×2'));
    root.querySelector('.exam-blot')!.append(chips);
    blotBubble.set(used.has('refill') ? ctx.lines.refill : ctx.lines.double);
    blot.setPose('eating', 900);
    sfx.gulp();
    await wait(1800);
  }
  blotBubble.set(ctx.lines.ready);
  blot.setPose('excited');
  await wait(2000);
  taunt.set(duel ? 'Your coach versus mine. Let’s see who taught better.' : (freshTaunt ?? 'Come on then, little blot. Show me what you know.'));
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
  rival?.destroy();
}

/** The bout (SPEC §8): HP bars, idea names, sparks, backfire, fizzle, ink-burst K.O. */
export async function boutScreen(ctx: RoundCtx): Promise<void> {
  const exam = ctx.exam!;
  const ideas = boutIdeas(ctx.lesson.ideas, exam);
  const result = simulateBout(ideas, (ctx.engine.seed + ctx.attempt * 7919) >>> 0, undefined, ctx.boosts);
  ctx.bout = result;
  // For the smoke test's log: what the bout was given and how it ended.
  (window as unknown as Record<string, unknown>).__bout = { ideas, outcome: result.outcome, knockout: result.knockout, exchanges: result.exchanges.length };
  const root = showScreen('bout', { home: null });
  root.style.backgroundImage = assetBackground('arena');
  const reduce = reducedMotion();
  const effects = new Effects();
  const arena = h('div', { class: 'arena' });
  const hp = (who: string, label: string) =>
    h(
      'div',
      { class: `hp hp-${who}` },
      h('span', { class: 'hp-label' }, label),
      h('span', { class: 'hp-track' }, h('span', { class: 'hp-ghost', id: `hp-${who}-ghost` }), h('span', { class: 'hp-fill', id: `hp-${who}` })),
      h('span', { class: 'hp-num', id: `hp-${who}-num` }, '100'),
    );
  const blot = createBlot(230);
  blot.setTraits(ctx.traits);
  const blotBubble = new Bubble('bout-bubble');
  const monsterBubble = new Bubble('bout-bubble monster-says');
  const monster = new MonsterView(ctx.monster.shape, ctx.monster.words, ctx.monster.color, 600, 375, 'left');
  const ribbon = h('div', { class: 'round-ribbon', id: 'round-ribbon' });
  const slam = h('div', { class: 'slam-text', id: 'slam', 'aria-live': 'assertive' });
  const log = h('ol', { class: 'move-log', id: 'move-log', 'aria-label': 'What happened' });
  const blotBox = h('div', { class: 'fighter fighter-blot' }, blotBubble.el, blot.el);
  const monsterBox = h('div', { class: 'fighter fighter-monster' }, monsterBubble.el, monster.canvas);
  const ko = h('div', { class: 'ko-glow', 'aria-hidden': 'true' });
  ko.style.backgroundImage = assetBackground('glow');
  const bonus = result.startHp - 100;
  arena.append(h('div', { class: 'hp-row' }, hp('blot', bonus > 0 ? `Blot +${bonus}` : 'Blot'), h('span', { class: 'vs' }, 'VS'), hp('monster', ctx.monster.name)), ribbon, blotBox, monsterBox, ko, slam, log);
  if (ctx.boostsUsed.length) {
    arena.append(
      h(
        'div',
        { class: 'bout-powerups', 'aria-label': 'Power-ups' },
        ctx.boostsUsed.includes('refill') ? h('span', { class: 'powerup-chip refill' }, h('span', { class: 'pu-icon', 'aria-hidden': 'true' }, '🧪'), `+${REFILL_HP} HP`) : null,
        ctx.boostsUsed.includes('double') ? h('span', { class: 'powerup-chip double', id: 'chip-double' }, h('span', { class: 'pu-icon', 'aria-hidden': 'true' }, '✦'), 'First hit ×2') : null,
      ),
    );
  }
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
    const v = Math.max(0, value);
    // Blot's bar is relative to its starting HP (more than 100 after an Ink refill).
    const pct = (v / (who === 'blot' ? result.startHp : 100)) * 100;
    const fill = document.getElementById(`hp-${who}`)!;
    fill.style.width = `${pct}%`;
    fill.classList.toggle('low', pct <= 30);
    const ghost = document.getElementById(`hp-${who}-ghost`)!;
    setTimeout(() => (ghost.style.width = `${pct}%`), 450 / getSpeed());
    document.getElementById(`hp-${who}-num`)!.textContent = String(Math.round(v));
  };
  document.getElementById('hp-blot-num')!.textContent = String(result.startHp);
  const centreOf = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const damage = (el: Element, amount: number, kind: 'hit' | 'taken') => {
    const c = centreOf(el);
    const n = h('div', { class: `dmg dmg-${kind}` }, `−${amount}`);
    n.style.left = `${c.x}px`;
    n.style.top = `${c.y - 60}px`;
    root.append(n);
    setTimeout(() => n.remove(), 1400);
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
    slam.className = 'slam-text';
    void slam.offsetWidth;
    slam.className = `slam-text show ${kind}`;
  };
  const clearSlam = () => (slam.className = 'slam-text');
  const addLog = (text: string) => {
    log.append(h('li', null, text));
    while (log.children.length > 5) log.firstElementChild?.remove();
  };
  const lunge = async (box: HTMLElement, ms: number) => {
    box.classList.add('lunge');
    await wait(ms);
    box.classList.remove('lunge');
  };

  // Pacing: the whole bout lasts ~54 s of game time (36 s at demo speed, SPEC §8 + M2).
  // Short bouts (an early K.O.) give the extra time to the ending, so every bout lasts 30–45 s.
  const TOTAL = 54_000;
  const intro = 2600;
  const n = Math.max(1, result.exchanges.length);
  const perExchange = Math.min(12_000, Math.max(6500, (TOTAL - intro - 2600) / n));
  const outro = Math.max(2600, TOTAL - intro - n * perExchange);
  const regular = result.exchanges.filter((x) => !x.suddenDeath).length;
  mark('bout-start');
  showSlam('FIGHT!', 'fight');
  sfx.bell();
  blot.setPose('attacking', 900);
  monsterBubble.set('Hssss…');
  await wait(intro);
  monsterBubble.set('');
  clearSlam();

  for (const [i, x] of result.exchanges.entries()) await exchange(x, i);

  async function exchange(x: BoutExchange, index: number) {
    const unit = perExchange / 9;
    const startedAt = performance.now();
    ribbon.textContent = x.suddenDeath ? `Sudden death · ${x.name}` : `Round ${index + 1} of ${regular} · ${x.name}`;
    ribbon.classList.remove('show');
    void ribbon.offsetWidth;
    ribbon.classList.add('show');
    // The monster winds up an attack built from this idea.
    sfx.whoosh();
    await lunge(monsterBox, unit * 1.2);
    if (x.kind === 'hit') {
      blot.setPose('attacking', unit * 2);
      blotBubble.set(ctx.lines.hit);
      await lunge(blotBox, unit * 0.8);
      const big = x.dealt >= 25;
      sfx.hit(big);
      const c = centreOf(monster.canvas);
      effects.sparks(c.x, c.y, '#ffd34d', big ? 34 : 18, big ? 1.5 : 1);
      if (x.doubled) {
        effects.sparks(c.x, c.y, '#5b4bff', 30, 1.4);
        document.getElementById('chip-double')?.classList.add('spent');
      }
      showSlam(x.doubled ? `Double ink! ${x.name}` : x.name, big ? 'hit big' : 'hit');
      damage(monster.canvas, x.dealt, 'hit');
      screenShake(big ? 12 : 5);
      setHp('monster', x.monsterHp);
      await tween(unit * 1.2, (t) => {
        hurt = 1 - t;
        shake = reduce ? 0 : Math.sin(t * 40) * 8 * (1 - t);
      });
      hurt = 0;
      shake = 0;
      addLog(x.doubled ? `Blot used ${x.name} with double ink: ${x.dealt} damage!` : `Blot used ${x.name}: ${x.dealt} damage.`);
    } else if (x.kind === 'backfire') {
      // The misreading, in Blot's own words, acted out.
      const misread = ctx.exam?.results.find((r) => r.id === x.ideaId)?.creatureAnswer || 'Wait, I thought…';
      blot.setPose('excited', unit * 2);
      blotBubble.set(misread);
      await wait(unit * 1.8);
      await lunge(blotBox, unit * 0.6);
      sfx.backfire();
      showSlam('BACKFIRE!', 'backfire');
      blot.setPose('hurt', unit * 1.5);
      blotBox.classList.add('spin');
      const c = centreOf(blot.el);
      effects.sparks(c.x, c.y, '#ff7a1a', 20, 1.1);
      await wait(unit * 1.4);
      blotBox.classList.remove('spin');
      monsterBubble.set('Ha! That is not how it works.');
      addLog(`Blot misread ${x.name}. Backfire!`);
    } else {
      blot.setPose('confused', unit * 3);
      blotBubble.set(ctx.lines.fizzle);
      showSlam('fizzle…', 'fizzle');
      sfx.fizzle();
      const c = centreOf(blot.el);
      effects.sparks(c.x, c.y - 70, '#9a94b8', 12, 0.5);
      await wait(unit * 1.6);
      monsterBubble.set('Hah! Never heard of it, little blot?');
      await wait(unit * 0.8);
      addLog(`Blot didn't know ${x.name}. Fizzle.`);
    }
    // The monster's attack lands (unless it is already down).
    if (x.taken > 0) {
      blot.setPose('hurt', unit * 1.6);
      sfx.hit(x.taken >= 20);
      const c = centreOf(blot.el);
      effects.sparks(c.x, c.y, ctx.monster.color, 16, 0.9);
      damage(blot.el, x.taken, 'taken');
      screenShake(x.taken >= 20 ? 10 : 4);
      setHp('blot', x.blotHp);
      addLog(`${ctx.monster.name} hit back: ${x.taken}.`);
    }
    await wait(unit * 1.6);
    blotBubble.set('');
    monsterBubble.set('');
    clearSlam();
    blot.setPose('idle');
    // Pad to the exchange's full share of the bout.
    const left = perExchange / getSpeed() - (performance.now() - startedAt);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
  }

  // The end: ink-burst K.O. or a decision.
  ribbon.classList.remove('show');
  const won = result.outcome === 'win';
  const endStart = performance.now();
  if (result.knockout) {
    ko.classList.add('show');
    showSlam(ctx.lines.ko, 'ko');
    sfx.ko();
    const loser = won ? monster.canvas : blot.el;
    const c = centreOf(loser);
    effects.inkBurst(c.x, c.y, won ? ctx.monster.color : '#1d1a2f', ctx.monster.words, 90);
    screenShake(18);
    if (won) await tween(900, (t) => (monsterAlpha = 1 - t * 0.85));
    else blot.setPose('hurt');
  } else {
    showSlam(won ? 'Blot wins on points!' : result.outcome === 'draw' ? 'A draw!' : `${ctx.monster.name} wins on points`, won ? 'ko' : 'fizzle');
  }
  blotBubble.set(won ? 'I DID IT! You taught me well, coach!' : '');
  if (won) {
    sfx.win();
    blot.setPose('proud');
  } else {
    sfx.lose();
    blot.setPose('hurt');
    monsterBubble.set('This page is MINE.');
  }
  const leftEnd = outro / getSpeed() - (performance.now() - endStart);
  if (leftEnd > 0) await new Promise((r) => setTimeout(r, leftEnd));
  mark('bout-end');
  cancelAnimationFrame(raf);
  blot.destroy();
  effects.destroy();
}

/** Win: the monster's letters stream into Blot's mouth like noodles, then a new trait (SPEC §9). */
export async function eatScreen(ctx: RoundCtx): Promise<'replay'> {
  const root = showScreen('eat', { home: ctx.onHome });
  root.style.backgroundImage = assetBackground('arena');
  const effects = new Effects();
  const blot = createBlot(280);
  blot.setTraits(ctx.traits);
  blot.setPose('eating');
  const monster = new MonsterView(ctx.monster.shape, ctx.monster.words, ctx.monster.color, 520, 325, 'left');
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
  // In a comeback the trait comes from the idea just learned, not from the ones beaten before.
  const open = { results: ctx.exam!.results.filter((r) => !(r.id in ctx.locked)) };
  const chosen = chooseTrait(open.results.length ? open : ctx.exam!, ctx.lesson.ideas, { name: ctx.monster.name, color: ctx.monster.color }, Date.now());
  // The trait belongs to its idea's memory card: it fades when the memory does (SPEC §17).
  const best = chosen && ctx.lesson.ideas.find((i) => i.name === chosen.ideaName);
  const cardId = best ? ctx.cardIds[best.id] : undefined;
  const trait = chosen && cardId ? { ...chosen, cardId } : chosen;
  ctx.trait = trait;
  if (trait) {
    const worn = [...ctx.traits, trait].slice(-TRAITS_WORN);
    ctx.traits = worn;
    await addTrait(trait);
    blot.setTraits(worn);
    blotBox.classList.add('grown');
    const m = blot.mouthPoint();
    effects.sparks(m.x, m.y - 120, '#ffd34d', 40, 1.3);
    effects.sparks(m.x, m.y - 120, trait.color, 24, 1);
  }
  blot.setPose('proud');
  sfx.win();
  const looks = { wobbly: 'a bit wobbly', solid: 'solid', shining: 'shining', faded: 'faded' } as const;
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
  root.style.backgroundImage = assetBackground('arena');
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
  // The buttons work from the moment they appear (no dead clicks during the animation).
  const chosen = new Promise<'rematch' | 'replay'>((resolve) => {
    document.getElementById('btn-rematch')!.addEventListener('click', () => resolve('rematch'), { once: true });
    document.getElementById('btn-see-replay')!.addEventListener('click', () => resolve('replay'), { once: true });
  });
  void wait(900).then(() => bubble.set(ctx.lines.rematch(weakName)));
  const choice = await chosen;
  ctx.focus = weakest;
  cancelAnimationFrame(raf);
  blot.destroy();
  return choice;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
