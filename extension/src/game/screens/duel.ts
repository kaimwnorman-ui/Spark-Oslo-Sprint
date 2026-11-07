// Blot vs Blot (SPEC §17): a friend's challenge, the duel itself, and who taught which idea better.
import { challengerIdeas, simulateDuel, type DuelChallenge, type DuelMove, type DuelResult } from '../../../../shared/duel.ts';
import { boutIdeas } from '../../../../shared/round.ts';
import { getSpeed, mark, reducedMotion, wait } from '../anim.ts';
import { assetBackground } from '../assets.ts';
import { createBlot, type BlotView } from '../blot.ts';
import type { RoundCtx } from '../context.ts';
import { h } from '../dom.ts';
import { Effects } from '../effects.ts';
import { sfx } from '../sound.ts';
import { openShare } from '../share.ts';
import { Bubble, primary, secondary, showScreen } from '../ui.ts';

const RIVAL_INK = '#4b3bd9';

function rivalBlot(size: number): BlotView {
  const b = createBlot(size);
  b.el.classList.add('rival');
  return b;
}

/** The challenge: who sent it, what their Blot learned, and one button to accept. */
export async function duelIntroScreen(
  ctx: Pick<RoundCtx, 'traits' | 'onHome'>,
  challenge: DuelChallenge,
  page: { url: string; title: string } | null,
  demo: boolean,
): Promise<void> {
  const root = showScreen('duel-intro', { home: ctx.onHome });
  root.style.backgroundImage = assetBackground('arena');
  const theirs = rivalBlot(190);
  theirs.setPose('proud');
  const yours = createBlot(190);
  yours.setTraits(ctx.traits);
  yours.setPose('excited');
  const taught = challenge.ideas.filter((i) => i.score >= 10).length;
  const accept = primary('btn-accept-duel', demo ? 'Read the page' : 'Start teaching');
  const openPage =
    !demo && page?.url && /^https?:/.test(page.url)
      ? h('a', { class: 'secondary link-btn', id: 'btn-open-duel-page', href: page.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open the page ↗')
      : null;
  root.append(
    h(
      'div',
      { class: 'duel-card' },
      h('p', { class: 'card-kicker' }, 'Blot vs Blot'),
      h('h1', { id: 'duel-title' }, `${challenge.name} challenges your Blot!`),
      h(
        'p',
        { class: 'duel-pitch' },
        `${challenge.name}’s Blot learned “${challenge.topic || page?.title || 'a page'}” and knows ${taught} of its 5 ideas. `,
        demo ? 'Read the same page, teach your Blot, and see whose Blot knows it better.' : 'Read the page, teach your Blot, and see whose Blot knows it better.',
      ),
      h('div', { class: 'duel-actions' }, accept, openPage),
    ),
    h(
      'div',
      { class: 'duel-faceoff', 'aria-hidden': 'true' },
      h('div', { class: 'duel-side' }, yours.el, h('p', { class: 'duel-name' }, 'Your Blot')),
      h('span', { class: 'vs big' }, 'VS'),
      h('div', { class: 'duel-side' }, h('div', { class: 'mirror' }, theirs.el), h('p', { class: 'duel-name' }, `${challenge.name}’s Blot`)),
    ),
  );
  accept.focus();
  sfx.reveal();
  await new Promise<void>((r) => accept.addEventListener('click', () => r(), { once: true }));
  theirs.destroy();
  yours.destroy();
}

/** The duel: both Blots use each idea in turn, using only what each was taught. */
export async function duelBoutScreen(ctx: RoundCtx, challenge: DuelChallenge): Promise<DuelResult> {
  const theirIdeas = challengerIdeas(challenge, ctx.lesson.ideas);
  const yourIdeas = boutIdeas(ctx.lesson.ideas, ctx.exam!);
  const result = simulateDuel(theirIdeas, yourIdeas, challenge.seed);
  (window as unknown as Record<string, unknown>).__duel = { outcome: result.outcome, exchanges: result.exchanges.length, knockout: result.knockout };
  const root = showScreen('duel-bout', { home: null });
  root.style.backgroundImage = assetBackground('arena');
  const reduce = reducedMotion();
  const effects = new Effects();
  const arena = h('div', { class: 'arena duel-arena' });
  const hp = (who: string, label: string) =>
    h(
      'div',
      { class: `hp hp-${who}` },
      h('span', { class: 'hp-label' }, label),
      h('span', { class: 'hp-track' }, h('span', { class: 'hp-ghost', id: `hp-${who}-ghost` }), h('span', { class: 'hp-fill', id: `hp-${who}` })),
      h('span', { class: 'hp-num', id: `hp-${who}-num` }, '100'),
    );
  const mine = createBlot(220);
  mine.setTraits(ctx.traits);
  const theirs = rivalBlot(220);
  const myBubble = new Bubble('bout-bubble');
  const theirBubble = new Bubble('bout-bubble rival-says');
  const myBox = h('div', { class: 'fighter fighter-blot' }, myBubble.el, mine.el);
  const theirBox = h('div', { class: 'fighter fighter-rival' }, theirBubble.el, h('div', { class: 'mirror' }, theirs.el));
  const ribbon = h('div', { class: 'round-ribbon', id: 'round-ribbon' });
  const slam = h('div', { class: 'slam-text', id: 'slam', 'aria-live': 'assertive' });
  const log = h('ol', { class: 'move-log', id: 'move-log', 'aria-label': 'What happened' });
  arena.append(h('div', { class: 'hp-row' }, hp('blot', 'Your Blot'), h('span', { class: 'vs' }, 'VS'), hp('rival', `${challenge.name}’s Blot`)), ribbon, myBox, theirBox, slam, log);
  root.append(arena, effects.canvas);

  const setHp = (who: 'blot' | 'rival', v: number) => {
    const fill = document.getElementById(`hp-${who}`)!;
    fill.style.width = `${v}%`;
    fill.classList.toggle('low', v <= 30);
    const ghost = document.getElementById(`hp-${who}-ghost`)!;
    setTimeout(() => (ghost.style.width = `${v}%`), 450 / getSpeed());
    document.getElementById(`hp-${who}-num`)!.textContent = String(Math.round(v));
  };
  const centre = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const damage = (el: Element, amount: number, kind: 'hit' | 'taken') => {
    const c = centre(el);
    const n = h('div', { class: `dmg dmg-${kind}` }, `−${amount}`);
    n.style.left = `${c.x}px`;
    n.style.top = `${c.y - 60}px`;
    root.append(n);
    setTimeout(() => n.remove(), 1400);
  };
  const showSlam = (text: string, kind: string) => {
    slam.textContent = text;
    slam.className = 'slam-text';
    void slam.offsetWidth;
    slam.className = `slam-text show ${kind}`;
  };
  const shake = () => {
    if (reduce) return;
    arena.classList.remove('shake');
    void arena.offsetWidth;
    arena.style.setProperty('--shake', '8px');
    arena.classList.add('shake');
  };
  const addLog = (text: string) => {
    log.append(h('li', null, text));
    while (log.children.length > 4) log.firstElementChild?.remove();
  };

  /** One Blot's move: lunge, then a hit on the other, a backfire on itself, or a fizzle. */
  async function act(m: DuelMove, who: 'mine' | 'theirs', idea: string, unit: number) {
    const blot = who === 'mine' ? mine : theirs;
    const other = who === 'mine' ? theirs : mine;
    const box = who === 'mine' ? myBox : theirBox;
    const bubble = who === 'mine' ? myBubble : theirBubble;
    const label = who === 'mine' ? 'Your Blot' : `${challenge.name}’s Blot`;
    if (m.kind === 'hit') {
      blot.setPose('attacking', unit * 2);
      box.classList.add('lunge');
      await wait(unit * 0.7);
      box.classList.remove('lunge');
      sfx.hit(m.dealt >= 25);
      const c = centre(other.el);
      effects.sparks(c.x, c.y, who === 'mine' ? '#ffd34d' : '#b7adff', m.dealt >= 25 ? 30 : 16, 1.1);
      damage(other.el, m.dealt, who === 'mine' ? 'hit' : 'taken');
      other.setPose('hurt', unit * 1.4);
      shake();
      addLog(`${label} used ${idea}: ${m.dealt}.`);
    } else if (m.kind === 'backfire') {
      blot.setPose('hurt', unit * 1.6);
      sfx.backfire();
      bubble.set('Wait, I thought…');
      const c = centre(blot.el);
      effects.sparks(c.x, c.y, '#ff7a1a', 18, 1);
      damage(blot.el, m.self, 'taken');
      addLog(`${label} misread ${idea}. Backfire!`);
    } else {
      blot.setPose('confused', unit * 1.6);
      bubble.set('I… don’t know this one!');
      sfx.fizzle();
      addLog(`${label} didn’t know ${idea}.`);
    }
    await wait(unit * 0.9);
    bubble.set('');
  }

  mark('duel-start');
  showSlam('FIGHT!', 'fight');
  sfx.bell();
  await wait(1800);
  slam.className = 'slam-text';
  const unit = 1100;
  let myHp = 100;
  let theirHp = 100;
  for (const [i, x] of result.exchanges.entries()) {
    ribbon.textContent = `Round ${i + 1} · ${x.name}`;
    ribbon.classList.remove('show');
    void ribbon.offsetWidth;
    ribbon.classList.add('show');
    sfx.whoosh();
    await wait(unit * 0.6);
    // Your move first (its hit, or its own backfire), then theirs; the bars follow each move.
    await act(x.player, 'mine', x.name, unit);
    myHp = Math.max(0, myHp - x.player.self);
    theirHp = Math.max(0, theirHp - x.player.dealt);
    setHp('blot', myHp);
    setHp('rival', theirHp);
    await act(x.challenger, 'theirs', x.name, unit);
    myHp = x.playerHp;
    theirHp = x.challengerHp;
    setHp('blot', myHp);
    setHp('rival', theirHp);
    await wait(unit * 0.6);
    mine.setPose('idle');
    theirs.setPose('idle');
  }
  ribbon.classList.remove('show');
  const won = result.outcome === 'win';
  if (result.knockout) {
    sfx.ko();
    const loser = won ? theirs.el : mine.el;
    const c = centre(loser);
    effects.inkBurst(c.x, c.y, won ? RIVAL_INK : '#1d1a2f', ctx.monster.words, 60);
  }
  showSlam(won ? 'Your Blot wins!' : result.outcome === 'draw' ? 'A draw!' : `${challenge.name}’s Blot wins!`, won ? 'ko' : 'fizzle');
  if (won) {
    sfx.win();
    mine.setPose('proud');
    theirs.setPose('hurt');
  } else {
    sfx.lose();
    mine.setPose('hurt');
    theirs.setPose('proud');
  }
  await wait(2600);
  mark('duel-end');
  mine.destroy();
  theirs.destroy();
  effects.destroy();
  return result;
}

/** Who taught which idea better, then: challenge back, or the replay. */
export async function duelResultScreen(ctx: RoundCtx, challenge: DuelChallenge, result: DuelResult): Promise<'replay'> {
  const root = showScreen('duel-result', { home: ctx.onHome });
  const theirs = challengerIdeas(challenge, ctx.lesson.ideas);
  const yours = boutIdeas(ctx.lesson.ideas, ctx.exam!);
  let better = 0;
  const rows = ctx.lesson.ideas.map((idea) => {
    const t = theirs.find((x) => x.id === idea.id)!;
    const y = yours.find((x) => x.id === idea.id)!;
    const mark = y.score > t.score ? 'you' : y.score < t.score ? 'them' : 'tie';
    if (mark === 'you') better++;
    const cell = (score: number, belief: string, win: boolean) =>
      h('span', { class: `duel-score${win ? ' win' : ''}${belief === 'wrong' ? ' misread' : ''}` }, belief === 'wrong' ? `${score} · misread` : String(score));
    return h('li', { class: `duel-row ${mark}`, 'data-id': idea.id }, h('span', { class: 'duel-idea' }, idea.name), cell(y.score, y.belief, mark === 'you'), cell(t.score, t.belief, mark === 'them'));
  });
  const headline = result.outcome === 'win' ? `You beat ${challenge.name}!` : result.outcome === 'draw' ? `A draw with ${challenge.name}!` : `${challenge.name} wins this one.`;
  const back = primary('btn-challenge-back', `Challenge ${challenge.name} back`);
  const replay = secondary('btn-duel-replay', 'See the replay');
  root.append(
    h(
      'div',
      { class: 'duel-result-card' },
      h('p', { class: 'card-kicker' }, 'Blot vs Blot'),
      h('h1', { id: 'duel-headline' }, headline),
      h('p', { class: 'duel-summary' }, `You taught ${better} of 5 ideas better than ${challenge.name}.`),
      h(
        'ol',
        { class: 'duel-table', 'aria-label': 'Scores per idea' },
        h('li', { class: 'duel-row head', 'aria-hidden': 'true' }, h('span', null, 'Idea'), h('span', null, 'You'), h('span', null, challenge.name)),
        ...rows,
      ),
      h('div', { class: 'duel-actions' }, replay, back),
    ),
  );
  back.focus();
  back.addEventListener('click', () => void openShare(ctx, back));
  await new Promise<void>((r) => replay.addEventListener('click', () => r(), { once: true }));
  document.getElementById('share')?.remove();
  return 'replay';
}
