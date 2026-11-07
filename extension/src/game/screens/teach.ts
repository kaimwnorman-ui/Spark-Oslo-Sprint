// Teaching (SPEC §7): five bars, five moves, Blot's questions, the timer and the bell.
import { BARS_DEBOUNCE_MS, BELL_ARM_MS, MESSAGE_LIMIT, QUESTION_GAP_MS } from '../../../../shared/config.ts';
import {
  barValue, capFor, clampMessage, counterVisible, atLimit, effectiveMove, isPasted, levelOf, sourceWindows, wordsMissing,
} from '../../../../shared/bars.ts';
import type { Move, SealedIdea, TranscriptEntry } from '../../../../shared/types.ts';
import { createBlot, type Pose } from '../blot.ts';
import type { RoundCtx } from '../context.ts';
import { h } from '../dom.ts';
import type { CreatureEvent } from '../engine.ts';
import { MonsterView } from '../monster.ts';
import { sfx } from '../sound.ts';
import { Bubble, showScreen } from '../ui.ts';
import { recordFrame } from '../anim.ts';

const MOVE_LABELS: Record<Exclude<Move, 'why'>, string> = {
  say: 'Say it',
  example: 'Give an example',
  when: 'Tell when',
  check: 'Check it',
};
const PLACEHOLDER: Partial<Record<Move, string>> = {
  say: 'Say what it means, in your own words…',
  example: 'Give an example of it in real life…',
  why: 'Tell Blot why…',
};
const LEVEL_LABEL = { empty: '', started: '', solid: 'Solid', signature: 'Signature' } as const;

type Panel =
  | { kind: 'pick' }
  | { kind: 'move'; move: Exclude<Move, 'why'> }
  | { kind: 'confirm' }
  | { kind: 'fix' }
  | { kind: 'why' }
  | { kind: 'whenq' }
  | { kind: 'card' };

export function teachScreen(ctx: RoundCtx): Promise<void> {
  const { lesson, lines, engine } = ctx;
  const root = showScreen('teach', { home: ctx.onHome });
  const windows = sourceWindows(ctx.pageText);
  const progress = ctx.progress;

  let selected: string | null = null;
  let panel: Panel = { kind: 'pick' };
  let busy = false;
  const setBusy = (value: boolean) => {
    busy = value;
    root.dataset.busy = value ? '1' : '';
    const send = panelEl.querySelector<HTMLButtonElement>('#btn-send');
    const input = panelEl.querySelector<HTMLTextAreaElement>('#teach-input');
    if (send) send.disabled = value || !input?.value.trim();
  };
  let lastQuestionAt = -Infinity;
  let questionTimer = 0;
  let hintShown = ctx.firstRound;
  let finished = false;
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));

  // ---------------------------------------------------------------- layout
  const monster = new MonsterView(ctx.monster.shape, ctx.monster.words, ctx.monster.color, 200, 120);
  const timerEl = h('div', { class: 'timer', id: 'timer', role: 'timer', 'aria-live': 'off' });
  const bellBtn = h('button', { class: 'bell', id: 'btn-bell' }, '🔔 Ring the bell');
  const header = h(
    'header',
    { class: 'teach-header' },
    h('div', { class: 'foe' }, monster.canvas, h('div', null, h('p', { class: 'foe-label' }, 'Your monster'), h('h2', null, ctx.monster.name))),
    timerEl,
    bellBtn,
  );
  const hint = h('p', { class: 'hint', id: 'hint' }, lines.hint);
  const ideaList = h('div', { class: 'ideas', role: 'list' });
  const blot = createBlot(230);
  blot.setTraits(ctx.traits);
  const bubble = new Bubble('teach-bubble');
  const panelEl = h('div', { class: 'panel', id: 'panel' });
  const stage = h('div', { class: 'blot-stage' }, bubble.el, blot.el);
  root.append(
    header,
    h('div', { class: 'teach-body' }, h('aside', { class: 'idea-col' }, hasHint() ? hint : null, ideaList), h('div', { class: 'teach-main' }, stage, panelEl)),
  );
  bubble.set(ctx.attempt > 1 && ctx.focus ? lines.rematch(nameOf(ctx.focus)) : lines.hello);

  function hasHint() {
    return hintShown;
  }
  function dismissHint() {
    if (hintShown) {
      hintShown = false;
      hint.remove();
    }
  }
  function nameOf(id: string) {
    return lesson.ideas.find((i) => i.id === id)?.name ?? '';
  }
  function idea(id: string): SealedIdea {
    return lesson.ideas.find((i) => i.id === id)!;
  }

  // ---------------------------------------------------------------- ideas and bars
  const ideaButtons = new Map<string, HTMLButtonElement>();
  for (const i of lesson.ideas) {
    const btn = h(
      'button',
      { class: 'idea', 'data-id': i.id, role: 'listitem', 'aria-pressed': 'false', onclick: () => selectIdea(i.id) },
      h('span', { class: 'idea-name' }, i.name),
      h('span', { class: 'ink-bar', 'aria-hidden': 'true' }, h('span', { class: 'ink-fill' }), h('span', { class: 'mark mark-solid' }), h('span', { class: 'mark mark-sig' })),
      h('span', { class: 'idea-level' }),
    );
    ideaButtons.set(i.id, btn);
    ideaList.append(btn);
  }

  function paintBars(flash?: string) {
    for (const [id, btn] of ideaButtons) {
      const p = progress[id]!;
      const fill = btn.querySelector<HTMLElement>('.ink-fill')!;
      fill.style.width = `${p.value}%`;
      const level = levelOf(p.value);
      btn.dataset.level = level;
      btn.querySelector('.idea-level')!.textContent = LEVEL_LABEL[level];
      btn.setAttribute('aria-pressed', String(id === selected));
      btn.setAttribute('aria-label', `${idea(id).name}: ${p.value} percent`);
      if (id === flash) {
        btn.classList.remove('inked');
        void btn.offsetWidth;
        btn.classList.add('inked');
      }
    }
  }
  paintBars();

  function provisional(id: string) {
    // Instant feedback before the live bars answer (SPEC §7 rule 6): a +ink tick and a flash.
    const p = progress[id]!;
    const cap = capFor(p.moves);
    p.value = Math.min(cap, Math.max(p.value, p.value + 6));
    paintBars(id);
    bump(id, 'ticks');
    sfx.ink();
  }
  /** Counters the smoke test reads: instant ticks and real live-bars answers per idea. */
  function bump(id: string, key: 'ticks' | 'answers') {
    const btn = ideaButtons.get(id);
    if (btn) btn.dataset[key] = String(Number(btn.dataset[key] ?? 0) + 1);
  }

  const barTimers = new Map<string, number>();
  function scheduleBars(id: string, now = false): Promise<void> {
    clearTimeout(barTimers.get(id));
    return new Promise((resolve) => {
      barTimers.set(
        id,
        window.setTimeout(async () => {
          await refreshBars(id);
          resolve();
        }, now ? 0 : BARS_DEBOUNCE_MS),
      );
    });
  }
  async function refreshBars(id: string) {
    try {
      const reply = await engine.bars(id, ctx.transcript);
      bump(id, 'answers');
      const p = progress[id]!;
      p.raw = Math.max(p.raw, reply.raw);
      const next = barValue(p.moves, p.raw);
      if (next !== p.value) {
        p.value = Math.max(p.value, next);
        paintBars(id);
      }
      return reply;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------- Blot talks
  function pose(p: Pose, hold?: number) {
    blot.setPose(p, hold);
  }
  async function blotSays(ideaId: string, event: CreatureEvent, extra: Partial<TranscriptEntry> = {}) {
    pose('listening');
    let text = '';
    try {
      text = await bubble.stream(
        engine.creature({ ideaId, event, text: extra.text, tap: typeof extra.tap === 'number' ? extra.tap : undefined, belief: progress[ideaId]!.belief, transcript: ctx.transcript.filter((e) => e.ideaId === ideaId) }),
      );
    } catch (err) {
      // The server failed: Blot still reacts, and the round goes on (M7 switches to offline mode).
      ctx.onEngineError?.(err);
      text = lines.gotIt;
      bubble.set(text);
    }
    pose(event === 'check' ? 'idle' : 'excited', 1400);
    pose('idle');
    return text;
  }
  function blotLine(text: string, p: Pose = 'excited') {
    bubble.set(text);
    pose(p, 1400);
  }

  // ---------------------------------------------------------------- panel
  let panelSeq = 0;
  function renderPanel() {
    panelSeq++;
    panelEl.replaceChildren();
    panelEl.dataset.kind = panel.kind;
    if (panel.kind === 'pick') {
      panelEl.append(h('p', { class: 'panel-prompt' }, '← Pick an idea to teach'));
      return;
    }
    if (!selected) return;
    const current = idea(selected);
    if (panel.kind === 'move') {
      const moves = h('div', { class: 'moves', role: 'tablist' });
      for (const m of Object.keys(MOVE_LABELS) as Exclude<Move, 'why'>[]) {
        moves.append(
          h('button', { class: 'move', 'data-move': m, role: 'tab', 'aria-selected': String(panel.move === m), onclick: () => selectMove(m) }, MOVE_LABELS[m]),
        );
      }
      panelEl.append(moves);
      if (panel.move === 'say' || panel.move === 'example') {
        const move = panel.move;
        panelEl.append(composer(move, (text) => void submitTyped(move, text)));
      }
      if (panel.move === 'when') {
        panelEl.append(
          h('p', { class: 'panel-prompt' }, `When does "${current.name}" matter? Tap one.`),
          h(
            'div',
            { class: 'options' },
            ...current.whenOptions.map((o, i) =>
              h('button', { class: 'when-option', 'data-index': String(i), onclick: (e: Event) => tapWhen(i, e.currentTarget as HTMLButtonElement) }, o.text),
            ),
          ),
        );
      }
      if (panel.move === 'check') panelEl.append(h('p', { class: 'panel-prompt' }, 'Blot is explaining it back…'));
    } else if (panel.kind === 'confirm') {
      panelEl.append(
        h('p', { class: 'panel-prompt' }, 'Is that what you meant?'),
        h(
          'div',
          { class: 'options two' },
          h('button', { class: 'confirm yes', id: 'btn-check-yes', onclick: () => confirmCheck(true) }, '✓ Yes, that’s right'),
          h('button', { class: 'confirm no', id: 'btn-check-no', onclick: () => confirmCheck(false) }, '✗ Not quite'),
        ),
      );
    } else if (panel.kind === 'fix') {
      panelEl.append(h('p', { class: 'panel-prompt' }, `Tell Blot what "${current.name}" really is.`), composer('say', (text) => void submitFix(text)));
    } else if (panel.kind === 'whenq') {
      panelEl.append(
        h('div', { class: 'question', id: 'question' }, h('p', { class: 'panel-prompt' }, `Blot asked: when would I use "${current.name}"? Tap one.`)),
        h(
          'div',
          { class: 'options' },
          ...current.whenOptions.map((o, i) =>
            h('button', { class: 'when-option', 'data-index': String(i), onclick: (e: Event) => tapWhen(i, e.currentTarget as HTMLButtonElement) }, o.text),
          ),
        ),
        h('button', { class: 'quiet', id: 'btn-dontknow', onclick: () => { panel = { kind: 'move', move: 'say' }; renderPanel(); } }, 'I don’t know'),
      );
    } else if (panel.kind === 'why') {
      panelEl.append(
        h('div', { class: 'question', id: 'question' }, h('p', { class: 'panel-prompt' }, 'Blot asked you why.'), composer('why', (text) => void submitWhyAnswer(text))),
        h('button', { class: 'quiet', id: 'btn-dontknow', onclick: () => dontKnow() }, 'I don’t know'),
      );
    } else if (panel.kind === 'card') {
      const url = current.sourceUrl!;
      panelEl.append(
        h(
          'div',
          { class: 'source-card', id: 'source-card' },
          h('p', { class: 'card-kicker' }, 'Go find out'),
          h('h3', null, current.sourceTitle ?? url),
          h('p', { class: 'card-url' }, new URL(url).hostname),
          h('a', { class: 'primary', id: 'btn-open-source', href: url, target: '_blank', rel: 'noopener noreferrer', onclick: () => sfx.tap() }, 'Open the page'),
        ),
        h('button', { class: 'quiet', id: 'btn-keep-teaching', onclick: () => { panel = { kind: 'move', move: 'say' }; renderPanel(); } }, 'Keep teaching'),
      );
    }
  }

  function composer(move: Move, onSubmit: (text: string) => void): HTMLElement {
    const input = h('textarea', {
      id: 'teach-input',
      class: 'composer-input',
      rows: 2,
      maxLength: MESSAGE_LIMIT,
      placeholder: PLACEHOLDER[move] ?? '',
      'aria-label': PLACEHOLDER[move] ?? 'Your message',
    });
    const counter = h('span', { class: 'counter', 'aria-live': 'polite' });
    const note = h('p', { class: 'note', id: 'composer-note' });
    const send = h('button', { class: 'send', id: 'btn-send', disabled: true }, 'Send');
    const update = () => {
      const value = clampMessage(input.value);
      if (value !== input.value) input.value = value;
      counter.textContent = counterVisible(value.length) ? `${value.length}/${MESSAGE_LIMIT}` : '';
      note.textContent = atLimit(value.length) ? 'That’s the limit: 400 characters.' : '';
      send.disabled = !value.trim() || busy;
    };
    input.addEventListener('input', () => {
      update();
      dismissHint();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!send.disabled) submit();
      }
    });
    const submit = () => {
      const text = input.value.trim();
      const missing = wordsMissing(move, text);
      if (missing > 0) {
        note.textContent = lines.tooShort(missing);
        blotLine(lines.tooShort(missing), 'confused');
        sfx.fizzle();
        return;
      }
      input.value = '';
      update();
      onSubmit(text);
    };
    send.addEventListener('click', submit);
    queueMicrotask(() => input.focus());
    return h('div', { class: 'composer' }, h('div', { class: 'composer-row' }, input, send), h('div', { class: 'composer-meta' }, note, counter));
  }

  // ---------------------------------------------------------------- actions
  function selectIdea(id: string) {
    if (finished) return;
    dismissHint();
    sfx.tap();
    selected = id;
    clearTimeout(questionTimer);
    panel = { kind: 'move', move: 'say' };
    paintBars();
    renderPanel();
    pose('listening');
  }

  function selectMove(move: Exclude<Move, 'why'>) {
    if (!selected || finished) return;
    sfx.tap();
    clearTimeout(questionTimer);
    panel = { kind: 'move', move };
    renderPanel();
    if (move === 'check') void doCheck();
  }

  function record(entry: TranscriptEntry) {
    ctx.transcript.push(entry);
    const p = progress[entry.ideaId]!;
    if (entry.move !== 'same' && entry.move !== 'dontknow') p.moves.push(entry.move);
  }

  async function submitTyped(move: Move, rawText: string) {
    if (!selected || busy) return;
    const id = selected;
    const p = progress[id]!;
    const pasted = isPasted(rawText, windows);
    const counted = effectiveMove(move, pasted);
    record({ ideaId: id, move: counted, text: rawText });
    setBusy(true);
    provisional(id);
    try {
      if (pasted) {
        blotLine(lines.pasted, 'confused');
        void scheduleBars(id);
        return;
      }
      if (counted === 'say' && !p.said) {
        p.said = true;
        if (ctx.misreads.includes(id)) {
          // Rule 3: Blot quietly adopts the misread unless the message already rules it out.
          pose('listening');
          const reply = await refreshBars(id);
          if (reply?.contradictsMisread) {
            p.belief = 'right';
            await blotSays(id, 'say', { text: rawText });
          } else {
            p.belief = 'misread';
            blotLine(lines.gotIt);
          }
        } else {
          p.belief = 'right';
          await blotSays(id, 'say', { text: rawText });
        }
        maybeAskWhy(id);
      } else {
        if (p.belief === 'none') p.belief = 'right';
        await blotSays(id, counted as CreatureEvent, { text: rawText });
        maybeAskWhen(id);
      }
      void scheduleBars(id);
    } finally {
      setBusy(false);
      renderPanelKeepInput();
    }
  }

  async function submitFix(text: string) {
    if (!selected || busy) return;
    const id = selected;
    const p = progress[id]!;
    const counted = effectiveMove('say', isPasted(text, windows));
    record({ ideaId: id, move: counted, text });
    setBusy(true);
    provisional(id);
    try {
      const reply = await refreshBars(id);
      if (p.belief === 'misread' && reply?.contradictsMisread) p.belief = 'right';
      else if (p.belief === 'none') p.belief = 'right';
      const seq = panelSeq;
      await blotSays(id, 'fix', { text });
      if (seq === panelSeq && selected === id) {
        panel = { kind: 'move', move: 'example' };
        renderPanel();
      }
    } finally {
      setBusy(false);
    }
  }

  async function tapWhen(index: number, btn: HTMLButtonElement) {
    if (!selected || busy) return;
    const id = selected;
    setBusy(true);
    btn.classList.add('chosen');
    record({ ideaId: id, move: 'when', tap: index });
    if (progress[id]!.belief === 'none') progress[id]!.belief = 'right';
    provisional(id);
    try {
      const reply = await refreshBars(id);
      btn.classList.add(reply?.whenRight ? 'right' : 'wrong');
      await blotSays(id, 'when', { tap: index });
    } finally {
      setBusy(false);
    }
  }

  async function doCheck() {
    if (!selected) return;
    const id = selected;
    const p = progress[id]!;
    if (p.belief === 'none') {
      blotLine(lines.dontKnowYet, 'confused');
      panel = { kind: 'move', move: 'say' };
      renderPanel();
      return;
    }
    setBusy(true);
    try {
      await blotSays(id, 'check');
      if (selected === id && panel.kind === 'move' && panel.move === 'check') {
        panel = { kind: 'confirm' };
        renderPanel();
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmCheck(yes: boolean) {
    if (!selected) return;
    const id = selected;
    sfx.tap();
    record({ ideaId: id, move: 'check', tap: yes ? 'yes' : 'no' });
    if (yes) {
      // ✓ on a wrong belief leaves it wrong (the replay shows it).
      blotLine(lines.yay);
      provisional(id);
      void scheduleBars(id, true);
      panel = { kind: 'move', move: 'example' };
    } else {
      blotLine(lines.thenWhat, 'confused');
      panel = { kind: 'fix' };
    }
    renderPanel();
  }

  function maybeAskWhy(id: string) {
    if (!idea(id).asksWhy || progress[id]!.asked) return;
    const wait = Math.max(1200, lastQuestionAt + QUESTION_GAP_MS - performance.now());
    clearTimeout(questionTimer);
    questionTimer = window.setTimeout(() => void askWhy(id), wait);
  }

  /** "When would I use X?" (3 taps), once per idea, after a typed message and never right after another question. */
  function maybeAskWhen(id: string) {
    const p = progress[id]!;
    if (p.moves.includes('when') || p.askedWhen) return;
    const wait = Math.max(1500, lastQuestionAt + QUESTION_GAP_MS - performance.now());
    clearTimeout(questionTimer);
    questionTimer = window.setTimeout(() => {
      if (finished || selected !== id || busy || panel.kind !== 'move') return;
      p.askedWhen = true;
      lastQuestionAt = performance.now();
      sfx.question();
      blotLine(lines.whenQuestion(idea(id).name), 'listening');
      panel = { kind: 'whenq' };
      renderPanel();
    }, wait);
  }

  async function askWhy(id: string) {
    if (finished || selected !== id || busy || panel.kind === 'why' || panel.kind === 'confirm' || panel.kind === 'fix') return;
    progress[id]!.asked = true;
    lastQuestionAt = performance.now();
    sfx.question();
    panel = { kind: 'why' };
    renderPanel();
    await blotSays(id, 'askWhy');
    pose('confused');
  }

  async function submitWhyAnswer(text: string) {
    if (!selected) return;
    const id = selected;
    const seq = panelSeq;
    await submitTyped('why', text);
    if (seq === panelSeq && selected === id) {
      panel = { kind: 'move', move: 'example' };
      renderPanel();
    }
  }

  function dontKnow() {
    if (!selected) return;
    const id = selected;
    sfx.tap();
    record({ ideaId: id, move: 'dontknow' });
    if (idea(id).sourceUrl) {
      blotLine(lines.dontKnowCard, 'excited');
      panel = { kind: 'card' };
      pausedForCard = true;
    } else {
      blotLine(lines.noSource, 'idle');
      panel = { kind: 'move', move: 'say' };
    }
    renderPanel();
  }

  function renderPanelKeepInput() {
    // Re-enable the composer after Blot answers, without wiping what the player is typing.
    const input = panelEl.querySelector<HTMLTextAreaElement>('#teach-input');
    const send = panelEl.querySelector<HTMLButtonElement>('#btn-send');
    if (input && send) send.disabled = !input.value.trim();
  }

  // ---------------------------------------------------------------- timer, pause, bell
  let remaining = ctx.teachSeconds * 1000;
  let lastTick = performance.now();
  let paused = false;
  let pausedForCard = false;
  let warned = false;
  const paintTimer = () => {
    const s = Math.ceil(remaining / 1000);
    timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    timerEl.classList.toggle('low', s <= 10);
    timerEl.classList.toggle('paused', paused);
  };
  paintTimer();
  const ticker = window.setInterval(() => {
    const now = performance.now();
    if (!paused) remaining -= now - lastTick;
    lastTick = now;
    if (remaining <= 10_000 && !warned) {
      warned = true;
      blotLine(lines.timeLow, 'excited');
    }
    if (remaining <= 0) {
      remaining = 0;
      finish();
    }
    paintTimer();
  }, 200);

  const onVisibility = () => {
    if (document.hidden) {
      paused = true;
    } else if (paused) {
      paused = false;
      lastTick = performance.now();
      if (pausedForCard && selected) {
        pausedForCard = false;
        blotLine(lines.soWhy, 'listening');
        panel = { kind: 'why' };
        renderPanel();
      }
    }
    paintTimer();
  };
  document.addEventListener('visibilitychange', onVisibility);

  let armedUntil = 0;
  bellBtn.addEventListener('click', () => {
    const now = performance.now();
    if (now < armedUntil) {
      sfx.bell();
      finish();
      return;
    }
    armedUntil = now + BELL_ARM_MS;
    sfx.tap();
    bellBtn.classList.add('armed');
    bellBtn.textContent = '🔔 Ring again to fight now';
    setTimeout(() => {
      if (!finished && performance.now() >= armedUntil) {
        bellBtn.classList.remove('armed');
        bellBtn.textContent = '🔔 Ring the bell';
      }
    }, BELL_ARM_MS + 50);
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && (panel.kind === 'card' || panel.kind === 'why' || panel.kind === 'confirm')) {
      panel = { kind: 'move', move: 'say' };
      renderPanel();
    }
  };
  document.addEventListener('keydown', onKey);

  // Mini monster in the header.
  let raf = 0;
  const loop = (now: number) => {
    recordFrame(now);
    monster.draw(now);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  function finish() {
    if (finished) return;
    finished = true;
    clearInterval(ticker);
    clearTimeout(questionTimer);
    for (const t of barTimers.values()) clearTimeout(t);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('keydown', onKey);
    cancelAnimationFrame(raf);
    blot.destroy();
    resolveDone();
  }

  if (ctx.focus) selectIdea(ctx.focus);
  else renderPanel();
  return done;
}
