// The presenter kit's page (SPEC §18): the tabs to open for the three-minute pitch. The game's clock is simulated
// (?days=N), which is said out loud on the page so a presenter says it out loud too.
import type { PresenterSeed } from '../../../../shared/presenter.ts';
import { encodeLocalDuel } from '../../../../shared/duel.ts';
import { createBlot } from '../blot.ts';
import { h } from '../dom.ts';
import { primary, showScreen } from '../ui.ts';

interface Tab {
  id: string;
  title: string;
  what: string;
  href: string;
}

export function presenterScreen(seed: PresenterSeed, goHome: () => void): void {
  const root = showScreen('presenter', { home: goHome });
  const blot = createBlot(120);
  blot.setTraits(seed.traits);
  blot.setPose('proud');
  const tabs: Tab[] = [
    { id: 'tab-day0', title: 'Day 0: a fresh memory', what: 'Blot wears a shining trait it earned on the P-value page.', href: 'game.html?blot=1' },
    { id: 'tab-day4', title: 'Day 4: Your Blot', what: 'The trait is a step down. Six fading memories, three insights in the player’s own numbers.', href: 'game.html?blot=1&days=4' },
    { id: 'tab-day7', title: 'Day 7: faded', what: 'The same trait, grey and dashed, because nobody refreshed the memory.', href: 'game.html?blot=1&days=7' },
    { id: 'tab-flash', title: 'Day 4: a flashback', what: 'Starting any new page, Blot first asks about a fading memory. A good answer earns a power-up.', href: 'game.html?demo=solar&days=4' },
    { id: 'tab-comeback', title: 'Day 4: the monster is back', what: 'The Tide Serpent returns with the idea that was missed. The beaten ideas are locked.', href: `game.html?comeback=${encodeURIComponent(seed.comebackId)}&days=4&teach=60` },
    { id: 'tab-duel', title: 'A friend’s challenge', what: 'Kai taught the same page. Play the other side, then the two Blots fight.', href: `game.html?duel=${encodeURIComponent(encodeLocalDuel(seed.challenge))}&teach=60` },
  ];
  root.append(
    h(
      'div',
      { class: 'presenter-card' },
      h('div', { class: 'presenter-head' }, h('div', { class: 'presenter-blot' }, blot.el), h('div', null, h('p', { class: 'card-kicker' }, 'Presenter kit'), h('h1', null, 'A learner four days in, ready'), h('p', { class: 'presenter-note', id: 'presenter-note' }, 'Open these in separate tabs before you start. The clock is simulated (days=N): say so out loud.'))),
      h(
        'ul',
        { class: 'presenter-tabs', id: 'presenter-tabs' },
        ...tabs.map((t) =>
          h(
            'li',
            null,
            h('a', { class: 'presenter-tab', id: t.id, href: t.href, target: '_blank', rel: 'noopener' }, h('span', { class: 'presenter-tab-title' }, t.title), h('span', { class: 'presenter-tab-what' }, t.what)),
          ),
        ),
      ),
      h('div', { class: 'presenter-foot' }, primary('btn-presenter-home', 'Home', goHome)),
    ),
  );
}
