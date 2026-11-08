// "Challenge a friend" (SPEC §17): a link to a duel. A demo page's duel lives entirely in the link;
// a real page's duel is stored on the server for 24 hours under a short code.
import { challengeFrom, cleanName, encodeLocalDuel } from '../../../shared/duel.ts';
import type { RoundCtx } from './context.ts';
import { h } from './dom.ts';
import { playerName, setPlayerName } from './memory-store.ts';
import { ServerEngine, ServerError, postJson, serverBase } from './server-engine.ts';
import { sfx } from './sound.ts';
import { primary } from './ui.ts';

/**
 * A demo page's challenge is plain data in the link, so any copy of the game opens it: the hosted guest game
 * (when this build knows where it is), else this page's own address. A real page's challenge lives on the
 * server, so its link opens the game the server itself serves (/app/).
 */
export async function duelLink(token: string, demo: boolean): Promise<string> {
  if (demo) {
    const hosted = location.protocol === 'chrome-extension:' && __GUEST_URL__ ? __GUEST_URL__ : location.href;
    return new URL(`game.html?duel=${encodeURIComponent(token)}`, hosted).href;
  }
  return `${await serverBase()}/app/game.html?duel=${encodeURIComponent(token)}`;
}

async function makeLink(ctx: RoundCtx, name: string): Promise<string> {
  const exam = ctx.exam!;
  if (ctx.demoId) {
    const challenge = challengeFrom({ name, demo: ctx.demoId, topic: ctx.lesson.topic, monsterName: ctx.monster.name, exam, seed: ctx.engine.seed, at: Date.now() });
    return duelLink(encodeLocalDuel(challenge), true);
  }
  if (!(ctx.engine instanceof ServerEngine)) throw new ServerError(0, 'offline');
  const ideas = exam.results.map((r) => ({ id: r.id, score: r.score, belief: r.belief }));
  const { code } = await postJson<{ code: string }>('/duel', { lessonId: ctx.lesson.lessonId, name, ideas });
  return duelLink(code, false);
}

/** Opens the share dialog over the current screen. Resolves when it closes. */
export function openShare(ctx: RoundCtx, opener?: HTMLElement): Promise<void> {
  document.getElementById('share')?.remove();
  const name = h('input', { id: 'share-name', class: 'text-input', type: 'text', maxLength: 24, autocomplete: 'nickname', placeholder: 'Your name', 'aria-label': 'Your name' });
  const make = primary('btn-make-link', 'Make the link');
  const status = h('p', { class: 'note share-status', id: 'share-status', 'aria-live': 'polite' });
  const close = h('button', { class: 'quiet', id: 'btn-share-close' }, 'Close');
  const body = h('div', { class: 'share-body' }, h('label', { class: 'field-label', for: 'share-name' }, 'Your name, so your friend knows who to beat'), h('div', { class: 'share-row' }, name, make), status);
  const dialog = h(
    'div',
    { class: 'share-backdrop', id: 'share' },
    h(
      'div',
      { class: 'share-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'share-title' },
      h('p', { class: 'card-kicker' }, 'Blot vs Blot'),
      h('h2', { id: 'share-title' }, 'Challenge a friend'),
      h('p', { class: 'share-pitch' }, `Your friend reads the same page and teaches their own Blot. Then the two Blots fight, using only what each was taught.`),
      body,
      h('div', { class: 'share-foot' }, close),
    ),
  );
  document.body.append(dialog);
  void playerName().then((n) => {
    name.value = n;
    make.disabled = false;
    name.focus();
    name.select();
  });

  return new Promise<void>((resolve) => {
    const done = () => {
      document.removeEventListener('keydown', onKey);
      dialog.remove();
      opener?.focus();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done();
    };
    document.addEventListener('keydown', onKey);
    close.addEventListener('click', () => {
      sfx.tap();
      done();
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) done();
    });
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') make.click();
    });
    make.addEventListener('click', async () => {
      sfx.tap();
      const clean = cleanName(name.value);
      make.disabled = true;
      status.textContent = 'Making your link…';
      status.classList.remove('bad');
      try {
        await setPlayerName(clean === 'A friend' ? '' : clean);
        const link = await makeLink(ctx, clean);
        const field = h('input', { id: 'share-link', class: 'text-input link-input', type: 'text', readOnly: true, value: link, 'aria-label': 'Your challenge link' });
        const copy = primary('btn-copy-link', 'Copy');
        copy.addEventListener('click', async () => {
          field.select();
          let ok = false;
          try {
            await navigator.clipboard.writeText(link);
            ok = true;
          } catch {
            ok = document.execCommand?.('copy') ?? false;
          }
          sfx.ink();
          copy.textContent = ok ? 'Copied!' : 'Select and copy';
          copy.classList.add('copied');
        });
        body.replaceChildren(
          h('label', { class: 'field-label', for: 'share-link' }, 'Send this link to your friend:'),
          h('div', { class: 'share-row' }, field, copy),
          h(
            'p',
            { class: 'small-note', id: 'share-note' },
            ctx.demoId
              ? 'It opens in Spark, offline. Your name and scores travel inside the link, so send it only to people you trust.'
              : 'It opens in Spark for 24 hours. Your name, scores and this page’s text stay on the server until then.',
          ),
        );
        copy.focus();
        field.addEventListener('focus', () => field.select());
      } catch (err) {
        make.disabled = false;
        status.classList.add('bad');
        status.textContent =
          err instanceof ServerError && err.status === 410
            ? 'This round is too old to share. Play it again, then challenge a friend.'
            : 'Spark can’t reach its server, so this page can’t be shared right now.';
      }
    });
  });
}
