// Home, the demo page, and the words-to-monster set piece (SPEC §2.1).
import { CHALLENGE_HOOK, PRODUCT_NAME } from '../../../../shared/config.ts';
import type { PageCapture, Trait, WordBox } from '../../../../shared/types.ts';
import { capturePage } from '../../capture.ts';
import { ease, mark, recordFrame, reducedMotion, tween, wait } from '../anim.ts';
import { createBlot } from '../blot.ts';
import type { RoundCtx } from '../context.ts';
import { h } from '../dom.ts';
import { MonsterView } from '../monster.ts';
import { sfx } from '../sound.ts';
import { primary, showScreen, removeScreen, inkSwirl } from '../ui.ts';
import { assetBackground, assetImg } from '../assets.ts';

declare global {
  interface Window {
    __monsterWords?: string[];
  }
}

export function homeScreen(traits: Trait[], onDemo: (id: string) => void): void {
  const root = showScreen('home');
  const blot = createBlot(200);
  blot.setTraits(traits);
  blot.setPose('excited');
  root.style.backgroundImage = assetBackground('title');
  root.append(
    h(
      'div',
      { class: 'home-card' },
      assetImg('logo', 'logo-img'),
      h('h1', { class: 'logo' }, PRODUCT_NAME),
      CHALLENGE_HOOK ? h('p', { class: 'tagline' }, CHALLENGE_HOOK) : null,
      h('p', { class: 'pitch' }, 'Any page becomes a monster made of its words. Beat it by teaching Blot what the page means.'),
      primary('btn-play-demo', 'Play the demo', () => onDemo('tides')),
      h('p', { class: 'quiet-line' }, 'On any page: click the Spark button in your toolbar, or press Alt+Shift+B.'),
      h(
        'p',
        { class: 'more-pages' },
        'More pages: ',
        ...[['pvalue', 'P-values'], ['solar', 'Solar panels'], ['sove', 'Søvn (norsk)'], ['ai-answer', 'An AI answer'], ['stage', 'Stage round']].flatMap(([id, label], i) => [
          i ? ' · ' : '',
          h('a', { href: `game.html?demo=${id}`, class: 'page-link' }, label!),
        ]),
      ),
    ),
    h('div', { class: 'home-blot' }, blot.el),
  );
}

// The monster is built ahead of time (while the player reads the page), so the click is instant.
let prepared: { key: string; monster: MonsterView; monsterW: number; monsterH: number } | null = null;
const sizeKey = (ctx: RoundCtx) => `${ctx.monster.name}:${innerWidth}x${innerHeight}`;

export function prepareMonster(ctx: RoundCtx): void {
  const monsterW = Math.min(820, innerWidth * 0.66);
  const monsterH = monsterW / 1.6;
  const monster = new MonsterView(ctx.monster.shape, ctx.monster.words, ctx.monster.color, monsterW, monsterH);
  monster.targets(300);
  prepared = { key: sizeKey(ctx), monster, monsterW, monsterH };
}

function takeMonster(ctx: RoundCtx) {
  if (!prepared || prepared.key !== sizeKey(ctx)) prepareMonster(ctx);
  const p = prepared!;
  prepared = null;
  return p;
}

/** The demo page, as the player would see it in a tab, with one big button. */
export function pageScreen(ctx: RoundCtx): Promise<{ boxes: WordBox[]; text: string; frame: HTMLIFrameElement; capture: PageCapture }> {
  const root = showScreen('page', { home: null });
  const frame = h('iframe', { class: 'page-frame', src: ctx.pageSrc!, title: 'The page' });
  const button = primary('btn-transform', 'Turn into a monster');
  const blot = createBlot(110);
  blot.setTraits(ctx.traits);
  blot.setPose('listening');
  root.append(
    frame,
    h(
      'div',
      { class: 'spark-dock' },
      h('div', { class: 'dock-blot' }, blot.el),
      h('div', null, h('p', { class: 'dock-title' }, 'Read this page… or fight it.'), button, h('p', { class: 'quiet-line small' }, 'Demo round · works offline · ', h('a', { href: 'game.html', id: 'btn-page-home' }, 'Home'))),
    ),
  );
  return new Promise((resolve) => {
    const ready = new Promise<void>((r) => frame.addEventListener('load', () => r(), { once: true }));
    void ready.then(() => setTimeout(() => prepareMonster(ctx), 300));
    button.addEventListener('click', async () => {
      button.disabled = true;
      sfx.tap();
      root.querySelector('.spark-dock')?.classList.add('gone');
      await ready;
      const doc = frame.contentDocument!;
      const win = frame.contentWindow!;
      const cap = capturePage(doc, win);
      const offset = frame.getBoundingClientRect();
      const boxes = cap.boxes.map((b) => ({ ...b, x: b.x + offset.left, y: b.y + offset.top }));
      blot.destroy();
      resolve({ boxes, text: cap.text, frame, capture: cap });
    });
  });
}

/**
 * The page's words lift off and swirl into the monster; then its name, body and five
 * attacks reveal one by one (≤ 6 s). Resolves when the player presses "Teach Blot".
 */
export async function formingScreen(ctx: RoundCtx, boxes: WordBox[], frame: HTMLIFrameElement | null): Promise<void> {
  const root = showScreen('forming', { overlay: !!frame, home: ctx.onHome });
  const reduce = reducedMotion();
  const W = innerWidth;
  const H = innerHeight;
  const { monster, monsterW, monsterH } = takeMonster(ctx);
  const mx = (W - monsterW) / 2;
  const my = Math.max(70, (H - monsterH) / 2 - 30);
  monster.canvas.style.left = `${mx}px`;
  monster.canvas.style.top = `${my}px`;
  const fly = h('canvas', { class: 'fly' });
  const dpr = Math.min(2, devicePixelRatio || 1);
  fly.width = W * dpr;
  fly.height = H * dpr;
  const g = fly.getContext('2d')!;
  g.scale(dpr, dpr);
  const title = h('h1', { class: 'monster-name' }, ctx.monster.name);
  const attacks = h('ul', { class: 'attacks', 'aria-label': 'Its five attacks' });
  const teach = primary('btn-teach', 'Teach Blot');
  teach.classList.add('hidden');
  const status = inkSwirl('Your page is turning into a monster…');
  root.append(h('div', { class: 'forming-paper' }), monster.canvas, fly, title, attacks, status, teach);

  // Cover the real words on the page so they look lifted off.
  const covers = h('canvas', { class: 'covers' });
  if (frame) {
    covers.width = W * dpr;
    covers.height = H * dpr;
    const cg = covers.getContext('2d')!;
    cg.scale(dpr, dpr);
    cg.fillStyle = '#fbfaf6';
    for (const b of boxes) cg.fillRect(b.x - 1, b.y - 1, b.w + 2, b.h + 2);
    root.prepend(covers);
  }

  // Words to fly: the page's own boxes (demo), or, continuing the page overlay's vortex,
  // the page's words spinning in a ring around the centre (real pages).
  const flying = (boxes.length ? boxes : ctx.monster.words.slice(0, 160).map((text, i) => {
    const a = (i / 160) * Math.PI * 2 * 3;
    const r = Math.min(W, H) * (0.12 + 0.2 * ((i * 37) % 100) / 100);
    return { text, x: W / 2 + Math.cos(a) * r, y: H * 0.42 + Math.sin(a) * r, w: 60, h: 20, size: 18 };
  })).slice(0, 300);
  monster.canvas.id = 'monster';
  monster.canvas.dataset.words = String(ctx.monster.words.length);
  window.__monsterWords = ctx.monster.words;
  const targets = monster.targets(flying.length).map((t) => ({ x: t.x + mx, y: t.y + my, angle: t.angle }));
  const cx = mx + monsterW / 2;
  const cy = my + monsterH / 2;

  let monsterAlpha = 0;
  let wordsAlpha = 1;
  let silhouette = 0;
  let raf = 0;
  const drawMonster = (now: number) => {
    recordFrame(now);
    monster.draw(now, { alpha: monsterAlpha, words: silhouette, glow: 1 - silhouette });
    raf = requestAnimationFrame(drawMonster);
  };
  raf = requestAnimationFrame(drawMonster);

  // An ink cloud gathers where the monster will be (drawn once, then just faded in).
  const cloud = document.createElement('canvas');
  const cloudR = Math.round(monsterW * 0.6);
  cloud.width = cloud.height = cloudR * 2;
  const cloudG = cloud.getContext('2d')!;
  const grad = cloudG.createRadialGradient(cloudR, cloudR, 10, cloudR, cloudR, cloudR);
  grad.addColorStop(0, `${ctx.monster.color}55`);
  grad.addColorStop(1, `${ctx.monster.color}00`);
  cloudG.fillStyle = grad;
  cloudG.fillRect(0, 0, cloudR * 2, cloudR * 2);
  const drawFlying = (p: number, lift: number) => {
    g.clearRect(0, 0, W, H);
    if (p > 0) {
      g.globalAlpha = Math.min(1, p * 1.6) * wordsAlpha;
      g.drawImage(cloud, cx - cloudR, cy - cloudR);
    }
    g.globalAlpha = wordsAlpha;
    g.textBaseline = 'top';
    let font = '';
    let fill = '';
    flying.forEach((b, i) => {
      const t = targets[i % targets.length]!;
      const delay = (i % 40) / 40 * 0.25;
      const q = Math.min(1, Math.max(0, (p - delay) / (1 - delay)));
      const e = ease.inOutCubic(q);
      const sx = b.x;
      const sy = b.y - lift * (8 + (i % 7) * 3);
      const r0 = Math.hypot(sx - cx, sy - cy);
      const a0 = Math.atan2(sy - cy, sx - cx);
      const r1 = Math.hypot(t.x - cx, t.y - cy);
      let a1 = Math.atan2(t.y - cy, t.x - cx);
      while (a1 < a0) a1 += Math.PI * 2;
      const a = a0 + (a1 - a0 + Math.PI * 2) * e;
      const r = r0 + (r1 - r0) * e + Math.sin(e * Math.PI) * 60;
      const x = reduce ? t.x : cx + Math.cos(a) * r;
      const y = reduce ? t.y : cy + Math.sin(a) * r;
      const lifted = 1 + 0.25 * lift * (1 - e);
      // Whole-pixel sizes so the font only changes when it must (setting it is costly).
      const size = Math.round((b.size + (12 - b.size) * e) * lifted);
      const nextFont = `${e > 0.5 ? 700 : 400} ${size}px Georgia, serif`;
      if (nextFont !== font) g.font = font = nextFont;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.translate(x, y);
      g.rotate(t.angle * e + Math.sin(e * Math.PI) * 0.6);
      if (lift > 0 && e < 0.3) {
        if (fill !== 'shadow') g.fillStyle = fill = 'rgba(29,26,47,0.18)';
        g.fillText(b.text, 3 * lift, 5 * lift);
      }
      const color = e > 0.6 ? ctx.monster.color : '#222';
      if (fill !== color) g.fillStyle = fill = color;
      g.fillText(b.text, 0, 0);
    });
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  // 1. Lift (the page dims, words rise off it).
  mark('forming-start');
  sfx.whoosh();
  if (frame) frame.classList.add('dim');
  if (!reduce) await tween(520, (t) => drawFlying(0, t), ease.outBack);
  covers.classList.add('fade');
  // 2. Swirl into the silhouette.
  await tween(reduce ? 300 : 2100, (t) => {
    drawFlying(t, 1);
    monsterAlpha = Math.max(0, (t - 0.55) / 0.45) * 0.9;
  }, ease.linear);
  status.remove();
  // Hide the page now (cheap); remove it once the set piece is over.
  const pageScreen = document.getElementById('screen-page');
  if (pageScreen) pageScreen.style.visibility = 'hidden';
  covers.remove();
  // 3. Reveal: name, then body, then the five attacks.
  monsterAlpha = 1;
  title.classList.add('slam');
  sfx.reveal();
  await tween(reduce ? 200 : 700, (t) => {
    wordsAlpha = 1 - t;
    drawFlying(1, 1);
  });
  fly.remove();
  mark('monster-silhouette');
  await tween(reduce ? 200 : 700, (t) => (silhouette = t));
  silhouette = 1;
  mark('monster-formed');
  for (const idea of ctx.lesson.ideas) {
    attacks.append(h('li', { class: 'attack' }, h('span', { class: 'attack-icon', 'aria-hidden': 'true' }, '✶'), idea.name));
    sfx.tap();
    await wait(reduce ? 60 : 220);
  }
  // Blot pops in, wide-eyed (no words here: the teach screen is where Blot talks).
  const blot = createBlot(120);
  blot.setTraits(ctx.traits);
  blot.setPose('excited');
  root.append(h('div', { class: 'forming-blot', 'aria-hidden': 'true' }, blot.el));
  sfx.question();
  teach.classList.remove('hidden');
  teach.focus();
  if (frame) setTimeout(() => removeScreen('page'), 50);
  await new Promise<void>((resolve) => teach.addEventListener('click', () => resolve(), { once: true }));
  cancelAnimationFrame(raf);
  blot.destroy();
}

/** A forming screen for live mode while the server builds the lesson (M3+). */
export function waitingScreen(label: string): HTMLElement {
  const root = showScreen('waiting');
  root.append(inkSwirl(label));
  return root;
}
