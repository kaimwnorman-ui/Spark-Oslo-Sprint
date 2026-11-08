// The replay (SPEC §10): five rows, the weakest idea with one source page, Play again / Home.
import { weakestIdeaId } from '../../../../shared/round.ts';
import type { RoundCtx } from '../context.ts';
import { h } from '../dom.ts';
import { createBlot } from '../blot.ts';
import { primary, secondary, showScreen } from '../ui.ts';
import { openShare } from '../share.ts';

export type ReplayChoice = 'again' | 'home' | 'blot';

/** What the learning loop does next (SPEC §17): the monster's comeback, the next memory check, one tip. */
function loopStrip(ctx: RoundCtx): HTMLElement | null {
  const a = ctx.after;
  const lines: HTMLElement[] = [];
  if (a.tamed) lines.push(h('p', { class: 'loop-line tamed', id: 'loop-tamed' }, h('span', { class: 'loop-icon', 'aria-hidden': 'true' }, '✓'), `${ctx.monster.name} is tamed for good.`));
  else if (a.comeback)
    lines.push(
      h('p', { class: 'loop-line comeback', id: 'loop-comeback' }, h('span', { class: 'loop-icon', 'aria-hidden': 'true' }, '↻'), h('span', null, `${a.comeback.monsterName} comes back tomorrow with “${a.comeback.ideaName}”.`)),
    );
  else if (a.recallDays !== null)
    lines.push(h('p', { class: 'loop-line memory', id: 'loop-memory' }, h('span', { class: 'loop-icon', 'aria-hidden': 'true' }, '✦'), `Blot will ask you about this page again in ${a.recallDays} days.`));
  if (a.tip)
    lines.push(
      h(
        'p',
        { class: `loop-line ${a.tip.code === 'praise' ? 'praise' : 'tip'}`, id: 'loop-tip' },
        h('span', { class: 'loop-icon', 'aria-hidden': 'true' }, a.tip.code === 'praise' ? '★' : '→'),
        h('span', null, h('strong', null, a.tip.code === 'praise' ? `${a.tip.title}: ` : `${a.tip.title}. `), a.tip.action),
      ),
    );
  if (!lines.length) return null;
  return h('div', { class: 'loop-strip' }, ...lines, h('button', { class: 'quiet loop-link', id: 'btn-your-blot-replay' }, 'Your Blot →'));
}

export async function replayScreen(ctx: RoundCtx): Promise<ReplayChoice> {
  const root = showScreen('replay', { home: ctx.onHome });
  const exam = ctx.exam!;
  // In a comeback, the ideas already beaten are not candidates for "weakest", and the idea it came
  // back with is only "weakest" if it is still weak.
  const open = { results: exam.results.filter((r) => !(r.id in ctx.locked)) };
  const weakestOpen = weakestIdeaId(open.results.length ? open : exam);
  const weakest = ctx.kind === 'comeback' && (exam.results.find((r) => r.id === weakestOpen)?.score ?? 0) >= 60 ? null : weakestOpen;
  const outcome =
    ctx.kind === 'duel' && ctx.duel
      ? ctx.duelOutcome === 'win'
        ? `You beat ${ctx.duel.name}!`
        : ctx.duelOutcome === 'draw'
          ? `A draw with ${ctx.duel.name}.`
          : `${ctx.duel.name} won this one.`
      : ctx.bout?.outcome === 'win'
        ? 'Blot won!'
        : ctx.bout?.outcome === 'draw'
          ? 'A draw.'
          : 'The monster got away.';
  const blot = createBlot(84);
  blot.setTraits(ctx.traits);
  blot.setPose((ctx.kind === 'duel' ? ctx.duelOutcome : ctx.bout?.outcome) === 'win' ? 'proud' : 'idle');

  const rows = ctx.lesson.ideas.map((idea) => {
    const r = exam.results.find((x) => x.id === idea.id);
    const said = ctx.transcript.filter((e) => e.ideaId === idea.id && e.text).map((e) => e.text!);
    const beaten = idea.id in ctx.locked;
    const model = r?.modelAnswer ?? ctx.fullLesson?.ideas.find((i) => i.id === idea.id)?.modelAnswer ?? '';
    const belief = r?.belief ?? 'unknown';
    const row = h(
      'button',
      { class: `replay-row belief-${belief}${idea.id === weakest ? ' weakest' : ''}`, 'data-id': idea.id, 'aria-expanded': 'false', title: 'Show all' },
      h('header', null, h('h3', null, idea.name), h('span', { class: 'score' }, `${r?.score ?? 0}`)),
      h('div', { class: 'col said', 'data-label': 'What you said' }, said.length ? h('p', { class: 'clamp' }, said.join(' · ')) : h('p', { class: 'muted' }, beaten ? 'Beaten in an earlier fight.' : 'Nothing yet.')),
      h('div', { class: 'col believed', 'data-label': 'What Blot believed' }, beaten ? h('p', { class: 'beaten-note' }, '✓ Already beaten') : h('p', { class: 'clamp' }, r?.creatureAnswer || '…')),
      h('div', { class: 'col stronger', 'data-label': 'Stronger' }, h('p', { class: 'clamp' }, model), r?.tip ? h('p', { class: 'tip' }, `Tip: ${r.tip}`) : null),
    );
    row.addEventListener('click', () => row.setAttribute('aria-expanded', String(row.getAttribute('aria-expanded') !== 'true')));
    return row;
  });

  const weakIdea = ctx.lesson.ideas.find((i) => i.id === weakest);
  // One page to go deeper (SPEC §10): the weakest idea's own link, or else the link of the
  // weakest idea that has one. Every link comes from the page itself; no link at all means none.
  const byScore = [...exam.results].sort((a, b) => a.score - b.score).map((r) => ctx.lesson.ideas.find((i) => i.id === r.id)!);
  // A comeback goes deeper on the idea it came back with.
  const comebackIdea = ctx.comeback ? ctx.lesson.ideas.find((i) => i.id === ctx.comeback!.ideaId) : undefined;
  const linked = weakIdea?.sourceUrl ? weakIdea : comebackIdea?.sourceUrl ? comebackIdea : byScore.find((i) => i?.sourceUrl);
  const deeper =
    linked?.sourceUrl
      ? h(
          'div',
          { class: 'go-deeper', id: 'go-deeper' },
          h('p', { class: 'card-kicker' }, linked === weakIdea ? `Weakest idea: ${weakIdea!.name}` : `Go deeper on ${linked.name}`),
          h('a', { class: 'deeper-link', href: linked.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, `Go deeper: ${linked.sourceTitle ?? new URL(linked.sourceUrl).hostname} ↗`),
        )
      : weakIdea
        ? h('div', { class: 'go-deeper', id: 'go-deeper' }, h('p', { class: 'card-kicker' }, `Weakest idea: ${weakIdea.name}`), h('p', { class: 'muted' }, 'This page had no link for it. Try searching it yourself!'))
        : h('div', { class: 'go-deeper', id: 'go-deeper' });

  root.append(
    h(
      'header',
      { class: 'replay-head' },
      h('div', { class: 'replay-blot' }, blot.el),
      h('div', { class: 'replay-title' }, h('p', { class: 'card-kicker' }, ctx.stage ? 'Stage round · rehearsal' : ctx.provisional ? 'Replay (provisional scores)' : 'Replay'), h('h1', null, outcome), h('p', null, `${ctx.monster.name} · ${ctx.lesson.topic}`)),
      loopStrip(ctx),
    ),
    h(
      'div',
      { class: 'replay-rows' },
      h('div', { class: 'replay-cols', 'aria-hidden': 'true' }, h('span', null, 'Idea'), h('span', null, 'What you said'), h('span', null, 'What Blot believed'), h('span', null, 'Stronger (tap a row for more)')),
      ...rows,
    ),
    h(
      'footer',
      { class: 'replay-foot' },
      deeper,
      h(
        'div',
        { class: 'replay-actions' },
        secondary('btn-home', 'Home'),
        // Duels and comebacks are not shared: a normal round is.
        ctx.kind === 'round' && !ctx.stage ? secondary('btn-challenge', 'Challenge a friend') : null,
        primary('btn-play-again', 'Play again'),
      ),
    ),
  );
  document.getElementById('btn-play-again')!.focus();
  const challenge = document.getElementById('btn-challenge');
  challenge?.addEventListener('click', () => void openShare(ctx, challenge));
  const choice = await new Promise<ReplayChoice>((resolve) => {
    document.getElementById('btn-play-again')!.addEventListener('click', () => resolve('again'), { once: true });
    document.getElementById('btn-home')!.addEventListener('click', () => resolve('home'), { once: true });
    document.getElementById('btn-your-blot-replay')?.addEventListener('click', () => resolve('blot'), { once: true });
  });
  document.getElementById('share')?.remove();
  blot.destroy();
  return choice;
}
