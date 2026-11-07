// The replay (SPEC §10): five rows, the weakest idea with one source page, Play again / Home.
import { weakestIdeaId } from '../../../../shared/round.ts';
import type { RoundCtx } from '../context.ts';
import { h } from '../dom.ts';
import { createBlot } from '../blot.ts';
import { primary, secondary, showScreen } from '../ui.ts';

export async function replayScreen(ctx: RoundCtx): Promise<'again' | 'home'> {
  const root = showScreen('replay', { home: ctx.onHome });
  const exam = ctx.exam!;
  const weakest = weakestIdeaId(exam);
  const outcome = ctx.bout?.outcome === 'win' ? 'Blot won!' : ctx.bout?.outcome === 'draw' ? 'A draw.' : 'The monster got away.';
  const blot = createBlot(120);
  blot.setTraits(ctx.traits);
  blot.setPose(ctx.bout?.outcome === 'win' ? 'proud' : 'idle');

  const rows = ctx.lesson.ideas.map((idea) => {
    const r = exam.results.find((x) => x.id === idea.id);
    const said = ctx.transcript.filter((e) => e.ideaId === idea.id && e.text).map((e) => e.text!);
    const model = r?.modelAnswer ?? ctx.fullLesson?.ideas.find((i) => i.id === idea.id)?.modelAnswer ?? '';
    const belief = r?.belief ?? 'unknown';
    return h(
      'article',
      { class: `replay-row belief-${belief}${idea.id === weakest ? ' weakest' : ''}`, 'data-id': idea.id },
      h('header', null, h('h3', null, idea.name), h('span', { class: 'score' }, `${r?.score ?? 0}`)),
      h('div', { class: 'col said' }, h('p', { class: 'col-label' }, 'What you said'), said.length ? h('p', null, said.join(' · ')) : h('p', { class: 'muted' }, 'Nothing yet.')),
      h('div', { class: 'col believed' }, h('p', { class: 'col-label' }, 'What Blot believed'), h('p', null, r?.creatureAnswer || '…')),
      h('div', { class: 'col stronger' }, h('p', { class: 'col-label' }, 'Stronger'), h('p', null, model), r?.tip ? h('p', { class: 'tip' }, `Tip: ${r.tip}`) : null),
    );
  });

  const weakIdea = ctx.lesson.ideas.find((i) => i.id === weakest);
  const deeper =
    weakIdea?.sourceUrl
      ? h(
          'div',
          { class: 'go-deeper', id: 'go-deeper' },
          h('p', { class: 'card-kicker' }, `Weakest idea: ${weakIdea.name}`),
          h('a', { class: 'deeper-link', href: weakIdea.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, `Go deeper: ${weakIdea.sourceTitle ?? new URL(weakIdea.sourceUrl).hostname} ↗`),
        )
      : h('div', { class: 'go-deeper', id: 'go-deeper' }, h('p', { class: 'card-kicker' }, `Weakest idea: ${weakIdea?.name ?? ''}`), h('p', { class: 'muted' }, 'This page had no link for it. Try searching it yourself!'));

  root.append(
    h(
      'header',
      { class: 'replay-head' },
      h('div', { class: 'replay-blot' }, blot.el),
      h('div', null, h('p', { class: 'card-kicker' }, ctx.provisional ? 'Replay (provisional scores)' : 'Replay'), h('h1', null, outcome), h('p', null, `${ctx.monster.name} · ${ctx.lesson.topic}`)),
    ),
    h('div', { class: 'replay-rows' }, ...rows),
    h('footer', { class: 'replay-foot' }, deeper, h('div', { class: 'replay-actions' }, secondary('btn-home', 'Home'), primary('btn-play-again', 'Play again'))),
  );
  document.getElementById('btn-play-again')!.focus();
  const choice = await new Promise<'again' | 'home'>((resolve) => {
    document.getElementById('btn-play-again')!.addEventListener('click', () => resolve('again'), { once: true });
    document.getElementById('btn-home')!.addEventListener('click', () => resolve('home'), { once: true });
  });
  blot.destroy();
  return choice;
}
