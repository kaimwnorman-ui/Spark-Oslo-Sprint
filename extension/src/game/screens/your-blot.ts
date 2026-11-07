// "Your Blot" (SPEC §17): what Blot remembers, what the player struggles with (in their own numbers),
// the power-ups earned by remembering, and the monsters coming back. One obvious next step.
import { insights, stats, type RoundSummary } from '../../../../shared/insights.ts';
import {
  DAY_MS, dueAt, dueCard, dueComebacks, freshness, freshnessShare, nextDueIn, type Comeback, type MemoryCard, type MemoryState,
} from '../../../../shared/memory.ts';
import type { Trait } from '../../../../shared/types.ts';
import { createBlot } from '../blot.ts';
import { h } from '../dom.ts';
import { now } from '../memory-store.ts';
import { Bubble, primary, showScreen } from '../ui.ts';

export type BlotAction = { kind: 'remind'; card: MemoryCard } | { kind: 'comeback'; id: string } | { kind: 'play' } | { kind: 'home' };

const FRESH_LABEL = { fresh: 'Fresh', fading: 'Fading', faded: 'Faded' } as const;

function inDays(at: number, t: number): string {
  const d = Math.ceil((at - t) / DAY_MS);
  return d <= 0 ? 'now' : d === 1 ? 'tomorrow' : `in ${d} days`;
}

export async function yourBlotScreen(memory: MemoryState, history: RoundSummary[], traits: Trait[]): Promise<BlotAction> {
  const t = now();
  let leave: (a: BlotAction) => void = () => {};
  const root = showScreen('blot', { home: () => leave({ kind: 'home' }) });
  const due = dueCard(memory.cards, t);
  const back = dueComebacks(memory, t);
  const s = stats(history);
  const tips = insights(history);

  const blot = createBlot(220);
  blot.setTraits(traits);
  const bubble = new Bubble('blot-home-bubble');
  if (!memory.cards.length && !history.length) {
    blot.setPose('listening');
    bubble.set('Teach me a page, and I’ll remember it here!');
  } else if (due) {
    blot.setPose('confused');
    bubble.set(`My “${due.ideaName}” memory is fading… remind me?`);
  } else if (back[0]) {
    blot.setPose('excited');
    bubble.set(`${back[0].monsterName} is back! It still has “${back[0].ideaName}”.`);
  } else {
    blot.setPose('proud');
    bubble.set('I remember everything you taught me!');
  }

  // ---- left: Blot, numbers, power-ups
  const tile = (value: string | number, label: string, id: string) => h('div', { class: 'stat', id }, h('span', { class: 'stat-value' }, String(value)), h('span', { class: 'stat-label' }, label));
  const power = (icon: string, name: string, n: number, id: string) =>
    h('div', { class: `power${n ? '' : ' none'}`, id }, h('span', { class: 'pu-icon', 'aria-hidden': 'true' }, icon), h('span', { class: 'power-name' }, name), h('span', { class: 'power-count' }, `×${n}`));
  const left = h(
    'section',
    { class: 'blot-left' },
    h('div', { class: 'blot-portrait' }, bubble.el, blot.el),
    h('div', { class: 'stats' }, tile(s.rounds, s.rounds === 1 ? 'fight' : 'fights', 'stat-fights'), tile(s.wins, s.wins === 1 ? 'win' : 'wins', 'stat-wins'), tile(memory.tamed, 'tamed', 'stat-tamed')),
    h(
      'div',
      { class: 'powers', 'aria-label': 'Power-ups' },
      h('p', { class: 'section-title' }, 'Power-ups'),
      h('div', { class: 'power-row' }, power('🧪', 'Ink refill', memory.powerUps.refill, 'power-refill'), power('✦', 'Double ink', memory.powerUps.double, 'power-double')),
      h('p', { class: 'small-note' }, 'Earned only by remembering. Blot uses them in the next fight.'),
    ),
  );

  // ---- right: work on, memories, comebacks
  const tipList = tips.length
    ? h(
        'ul',
        { class: 'insights', id: 'insights' },
        ...tips.map((i) => h('li', { class: `insight insight-${i.code === 'praise' ? 'praise' : 'tip'}`, 'data-code': i.code }, h('p', { class: 'insight-title' }, i.code === 'praise' ? `✓ ${i.title}` : i.title), h('p', { class: 'insight-detail' }, i.detail))),
      )
    : h('p', { class: 'empty-note', id: 'insights' }, 'Play a round and Blot will spot what you do well, and what to work on.');

  const cards = [...memory.cards].sort((a, b) => dueAt(a) - dueAt(b)).slice(0, 8);
  const memList = cards.length
    ? h(
        'ul',
        { class: 'memories', id: 'memories' },
        ...cards.map((c) => {
          const f = freshness(c, t);
          const bar = h('span', { class: 'fresh-fill' });
          bar.style.width = `${Math.round(freshnessShare(c, t) * 100)}%`;
          const when = dueAt(c) <= t ? 'due now' : `next check ${inDays(dueAt(c), t)}`;
          return h(
            'li',
            { class: `memory fresh-${f}`, 'data-card': c.id },
            h('div', { class: 'memory-text' }, h('p', { class: 'memory-name' }, c.ideaName), h('p', { class: 'memory-from' }, `${c.monsterName} · ${FRESH_LABEL[f]}, ${when}`)),
            h('span', { class: 'fresh-bar', 'aria-hidden': 'true' }, bar),
          );
        }),
      )
    : h('p', { class: 'empty-note', id: 'memories' }, 'Nothing yet. Everything you teach Blot shows up here, and fades unless you remember it.');

  const comebackRow = (c: Comeback) =>
    h(
      'li',
      { class: `comeback${c.dueAt <= t ? ' due' : ''}`, 'data-id': c.id },
      h('span', { class: 'comeback-dot', 'aria-hidden': 'true' }),
      h('p', null, h('strong', null, c.monsterName), ` returns ${c.dueAt <= t ? 'today' : inDays(c.dueAt, t)} with “${c.ideaName}”`),
    );

  const right = h(
    'section',
    { class: 'blot-right' },
    h('header', { class: 'blot-head' }, h('p', { class: 'card-kicker' }, 'Your Blot'), h('h1', null, 'What Blot remembers')),
    h('div', { class: 'blot-section' }, h('p', { class: 'section-title' }, 'What to work on'), tipList),
    h('div', { class: 'blot-section grow' }, h('p', { class: 'section-title' }, 'Memories'), memList),
    memory.comebacks.length ? h('div', { class: 'blot-section' }, h('p', { class: 'section-title' }, 'Coming back'), h('ul', { class: 'comebacks', id: 'comebacks' }, ...memory.comebacks.map(comebackRow))) : null,
  );

  // ---- one obvious next step
  const next = nextDueIn(memory.cards, t);
  let action: BlotAction;
  let label: string;
  if (due) {
    action = { kind: 'remind', card: due };
    label = 'Remind Blot';
  } else if (back[0]) {
    action = { kind: 'comeback', id: back[0].id };
    label = `Fight ${back[0].monsterName} again`;
  } else {
    action = { kind: 'play' };
    label = history.length ? 'Play another page' : 'Play the demo';
  }
  const go = primary('btn-blot-primary', label);
  const nextLine = !due && next !== null ? h('p', { class: 'small-note', id: 'next-check' }, `Blot’s next memory check: ${next <= 0 ? 'today' : next === 1 ? 'tomorrow' : `in ${next} days`}.`) : null;
  root.append(left, right, h('footer', { class: 'blot-foot' }, nextLine ?? h('span'), go));
  go.focus();

  const chosen = await new Promise<BlotAction>((resolve) => {
    leave = resolve;
    go.addEventListener('click', () => resolve(action), { once: true });
  });
  blot.destroy();
  return chosen;
}
