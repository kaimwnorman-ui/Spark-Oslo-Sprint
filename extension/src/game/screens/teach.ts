// Teaching (SPEC §7). Blot leads, one idea and one step at a time: the player explains an idea, checks what Blot
// says back (Blot sometimes mixes it up: catch it), answers Blot's "but why?" (or gives an example), and the idea is
// done. Good answers earn time, and the clock waits while Blot thinks.
import { BELL_ARM_MS, MESSAGE_LIMIT } from '../../../../shared/config.ts';
import { atLimit, barValue, clampMessage, counterVisible, effectiveMove, isPasted, levelOf, sourceWindows, wordsMissing } from '../../../../shared/bars.ts';
import { bonusSeconds, deepenMove, levelBonuses, readyCount, type BonusKind } from '../../../../shared/teach.ts';
import type { Move, SealedIdea, TranscriptEntry } from '../../../../shared/types.ts';
import { COACH_NOTES } from '../../../../shared/insights.ts';
import { recordFrame, wait } from '../anim.ts';
import { createBlot, type Pose } from '../blot.ts';
import type { IdeaProgress, RoundCtx } from '../context.ts';
import { append, h } from '../dom.ts';
import type { CreatureEvent } from '../engine.ts';
import { MonsterView } from '../monster.ts';
import { sfx } from '../sound.ts';
import { Bubble, showScreen } from '../ui.ts';

/** The steps the player sees for one idea. Putting Blot right is part of checking. */
const SHOWN = ['explain', 'check', 'deep', 'done'] as const;

const hasDeep = (p: IdeaProgress) => p.moves.includes('why') || p.moves.includes('example');

export function teachScreen(ctx: RoundCtx): Promise<void> {
  const { lesson, lines } = ctx;
  const root = showScreen('teach', { home: ctx.onHome });
  const windows = sourceWindows(ctx.pageText);
  const progress = ctx.progress;

  let selected: string | null = null;
  /** The idea whose "go find out" card is open, and the step to go back to. */
  let cardFor: string | null = null;
  let busy = false;
  /** The clock starts with the player's first action, so reading the screen costs nothing. */
  let started = false;
  let finished = false;
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));

  // ---------------------------------------------------------------- layout
  const monster = new MonsterView(ctx.monster.shape, ctx.monster.words, ctx.monster.color, 200, 120);
  const timerEl = h('div', { class: 'timer', id: 'timer', role: 'timer', 'aria-live': 'off' });
  const bonusEl = h('span', { class: 'time-bonus', id: 'time-bonus', role: 'status', 'aria-live': 'polite' });
  const readyEl = h('p', { class: 'ready-count', id: 'ready-count' });
  const bellBtn = h('button', { class: 'bell', id: 'btn-bell' }, lines.bell);
  const header = h(
    'header',
    { class: 'teach-header' },
    h('div', { class: 'foe' }, monster.canvas, h('div', null, h('p', { class: 'foe-label' }, 'Your monster'), h('h2', null, ctx.monster.name))),
    h('div', { class: 'clock' }, timerEl, bonusEl, readyEl),
    bellBtn,
  );
  // First round: the one rule worth knowing up front. Returning players get their coach's note instead (SPEC §17).
  let hint: HTMLElement | null = ctx.firstRound && ctx.kind === 'round' && !ctx.stage ? h('p', { class: 'hint', id: 'hint' }, lines.hint) : null;
  const focusCode = ctx.kind === 'round' ? ctx.coach[0] : undefined;
  const stageIdea = ctx.stage && ctx.focus ? lesson.ideas.find((i) => i.id === ctx.focus) : undefined;
  const coachNote = stageIdea
    ? h('p', { class: 'coach-note', id: 'coach-note' }, h('span', { class: 'coach-kicker' }, 'Stage'), lines.stageNote(stageIdea.name))
    : focusCode
      ? h('p', { class: 'coach-note', id: 'coach-note' }, h('span', { class: 'coach-kicker' }, 'Coach'), COACH_NOTES[focusCode])
      : null;
  const ideaList = h('div', { class: 'ideas', role: 'list' });
  const blot = createBlot(230);
  blot.setTraits(ctx.traits);
  const bubble = new Bubble('teach-bubble');
  const panelEl = h('div', { class: 'panel', id: 'panel' });
  const stage = h('div', { class: 'blot-stage' }, bubble.el, blot.el);
  root.append(
    header,
    h('div', { class: 'teach-body' }, h('aside', { class: 'idea-col' }, coachNote ?? hint, ideaList), h('div', { class: 'teach-main' }, stage, panelEl)),
  );
  bubble.set(
    ctx.resumeRemainingMs !== null
      ? lines.resumed
      : ctx.kind === 'comeback' && ctx.focus
        ? lines.comebackHello(nameOf(ctx.focus))
        : ctx.kind === 'duel' && ctx.duel && ctx.attempt === 1
          ? lines.duelHello(ctx.duel.name)
          : ctx.stage && ctx.focus && ctx.attempt === 1
            ? lines.stageHello(nameOf(ctx.focus))
            : ctx.attempt > 1 && ctx.focus
              ? lines.rematch(nameOf(ctx.focus))
              : lines.hello,
  );

  function nameOf(id: string) {
    return lesson.ideas.find((i) => i.id === id)?.name ?? '';
  }
  function idea(id: string): SealedIdea {
    return lesson.ideas.find((i) => i.id === id)!;
  }
  const isLocked = (id: string) => id in ctx.locked;

  // ---------------------------------------------------------------- ideas and bars
  const ideaButtons = new Map<string, HTMLButtonElement>();
  for (const i of lesson.ideas) {
    const locked = isLocked(i.id);
    const btn = h(
      'button',
      { class: `idea${locked ? ' locked' : ''}`, 'data-id': i.id, role: 'listitem', 'aria-pressed': 'false', disabled: locked, onclick: () => selectIdea(i.id) },
      h('span', { class: 'idea-name' }, i.name),
      h('span', { class: 'ink-bar', 'aria-hidden': 'true' }, h('span', { class: 'ink-fill' }), h('span', { class: 'mark mark-solid' }), h('span', { class: 'mark mark-sig' })),
      h('span', { class: 'idea-level' }),
    );
    ideaButtons.set(i.id, btn);
    ideaList.append(btn);
  }

  function paintIdeas(flash?: string) {
    for (const [id, btn] of ideaButtons) {
      const p = progress[id]!;
      btn.querySelector<HTMLElement>('.ink-fill')!.style.width = `${p.value}%`;
      const level = levelOf(p.value);
      btn.dataset.level = level;
      btn.dataset.step = p.step;
      // Blot's mix-up shows on the bar once it is out in the open (never before the player has checked).
      const mixed = p.belief === 'misread' && p.step === 'fix';
      btn.classList.toggle('mixed', mixed);
      const label = isLocked(id) ? lines.beaten : mixed ? lines.mixedUp : level === 'signature' ? lines.levelMastered : level === 'solid' ? lines.levelReady : '';
      btn.querySelector('.idea-level')!.textContent = label;
      btn.setAttribute('aria-pressed', String(id === selected));
      btn.setAttribute('aria-label', isLocked(id) ? `${idea(id).name}: ${lines.beaten}` : `${idea(id).name}: ${p.value} percent${label ? `, ${label}` : ''}`);
      if (id === flash) {
        btn.classList.remove('inked');
        void btn.offsetWidth;
        btn.classList.add('inked');
      }
    }
    const values = lesson.ideas.map((i) => progress[i.id]!.value);
    readyEl.textContent = lines.readyCount(readyCount(values), values.length);
  }

  /** Counters the smoke tests read: real grades answered per idea. */
  function bump(id: string) {
    const btn = ideaButtons.get(id);
    if (btn) btn.dataset.answers = String(Number(btn.dataset.answers ?? 0) + 1);
  }

  /** The bar is the latest grade under the move caps; reaching Ready or Mastered earns time, once each. */
  function applyValue(id: string) {
    const p = progress[id]!;
    const before = p.value;
    p.value = barValue(p.moves, p.raw);
    if (p.value > before) sfx.ink();
    paintIdeas(p.value !== before ? id : undefined);
    // A bar never earns time while Blot holds a mix-up the player has not caught.
    if (p.belief !== 'misread') award(id, levelBonuses(p.earned, p.value));
    persist();
  }

  /** Grades one idea from everything the player said about it (the exam reuses this exact grade). */
  async function refreshGrade(id: string): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const engine = ctx.engine;
      try {
        const g = await engine.grade(id, ctx.transcript);
        if (finished) return;
        const p = progress[id]!;
        p.raw = g.score;
        p.tip = g.tip;
        bump(id);
        applyValue(id);
        // A done idea's card shows the newest level.
        if (selected === id && p.step === 'done' && !busy) renderPanel();
        return;
      } catch (err) {
        // The server failed: the round goes on offline (main.ts switches the engine), so try once more there.
        ctx.onEngineError?.(err);
        if (ctx.engine === engine) return;
      }
    }
  }

  // ---------------------------------------------------------------- time
  let remaining = ctx.resumeRemainingMs ?? ctx.teachSeconds * 1000;
  const persist = () => ctx.persist?.(remaining);
  let lastTick = performance.now();
  /** The tab is hidden (the player went to read a page). */
  let hidden = false;
  let pausedForCard = false;
  let warned = false;
  let nudged = false;
  const clockStopped = () => !started || hidden || busy;
  const paintTimer = () => {
    const s = Math.ceil(remaining / 1000);
    timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    timerEl.classList.toggle('low', s <= 10 && started);
    timerEl.classList.toggle('paused', clockStopped());
  };
  function start() {
    if (started || finished) return;
    started = true;
    lastTick = performance.now();
    paintTimer();
  }

  function award(id: string, kinds: readonly BonusKind[]) {
    const p = progress[id]!;
    const fresh = kinds.filter((k) => !p.earned[k]);
    if (!fresh.length || finished) return;
    for (const k of fresh) p.earned[k] = true;
    const seconds = bonusSeconds(fresh);
    remaining += seconds * 1000;
    if (remaining > 10_000) warned = false;
    bonusEl.textContent = `+${seconds} s ${fresh.map((k) => lines.bonus[k]).join(' ')}`;
    bonusEl.classList.remove('show');
    void bonusEl.offsetWidth;
    bonusEl.classList.add('show');
    sfx.bonus();
    paintTimer();
    persist();
  }

  // ---------------------------------------------------------------- Blot talks
  function pose(p: Pose, hold?: number) {
    blot.setPose(p, hold);
  }
  function blotLine(text: string, p: Pose = 'excited') {
    bubble.set(text);
    pose('idle');
    pose(p, 1600);
  }
  /** Blot's reply, streamed into the bubble. If the server fails, the offline Blot answers instead. */
  async function blotSays(id: string, event: CreatureEvent, text?: string): Promise<string> {
    pose('listening');
    let said = '';
    for (let attempt = 0; attempt < 2 && !said; attempt++) {
      const engine = ctx.engine;
      try {
        said = (await bubble.stream(engine.creature({ ideaId: id, event, text, belief: progress[id]!.belief, transcript: ctx.transcript.filter((e) => e.ideaId === id) }))).trim();
      } catch (err) {
        ctx.onEngineError?.(err);
        if (ctx.engine === engine) break;
      }
    }
    if (!said) {
      said = lines.gotIt;
      bubble.set(said);
    }
    pose('idle');
    pose(event === 'askWhy' ? 'confused' : event === 'check' ? 'listening' : 'excited', 1600);
    return said;
  }

  /** Blot is busy: the clock waits, the panel says so, and nothing else can start. */
  async function think(work: () => Promise<unknown>): Promise<void> {
    busy = true;
    root.dataset.busy = '1';
    paintTimer();
    renderPanel();
    try {
      await work();
    } finally {
      busy = false;
      root.dataset.busy = '';
      lastTick = performance.now();
      if (!finished) {
        paintTimer();
        paintIdeas();
        renderPanel();
      }
    }
  }

  // ---------------------------------------------------------------- the panel: one step, one action
  function renderPanel() {
    if (finished) return;
    panelEl.replaceChildren();
    const id = selected;
    if (!id) {
      panelEl.dataset.kind = 'pick';
      append(panelEl, h('p', { class: 'panel-prompt pick-prompt' }, 'Pick an idea to teach'));
      return;
    }
    const p = progress[id]!;
    const current = idea(id);
    if (cardFor === id) {
      panelEl.dataset.kind = 'card';
      append(panelEl, sourceCard(current));
      return;
    }
    panelEl.dataset.kind = busy ? 'thinking' : p.step;
    append(panelEl, stepper(id));
    if (busy) {
      append(panelEl, 
        h('p', { class: 'panel-status', id: 'panel-status' }, h('span', { class: 'think-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), lines.thinking),
      );
      return;
    }
    const deep = deepenMove(current.asksWhy);
    switch (p.step) {
      case 'explain':
        append(panelEl, 
          stepPrompt(p.saidBack !== undefined ? lines.morePrompt(current.name) : lines.explainPrompt(current.name)),
          composer(lines.explainPlaceholder, 'say', (text) => void sendExplain(id, text)),
          dontKnowButton(id),
        );
        break;
      case 'check':
        append(panelEl, 
          stepPrompt(lines.checkPrompt),
          h(
            'div',
            { class: 'options two' },
            h('button', { class: 'confirm yes', id: 'btn-check-yes', onclick: () => check(id, true) }, lines.checkYes),
            h('button', { class: 'confirm no', id: 'btn-check-no', onclick: () => check(id, false) }, lines.checkNo),
          ),
          // The first round says the rule where it matters, until the player has met one of Blot's mix-ups.
          ctx.firstRound && ctx.misreads.length && !ctx.transcript.some((e) => e.caught || e.fooled) ? h('p', { class: 'check-help', id: 'check-help' }, lines.checkHelp) : null,
        );
        break;
      case 'fix':
        append(panelEl, stepPrompt(lines.fixPrompt(current.name)), composer(lines.fixPlaceholder, 'say', (text) => void sendFix(id, text)));
        break;
      case 'why':
        append(panelEl, 
          stepPrompt(deep === 'why' ? lines.whyPrompt : lines.examplePrompt(current.name)),
          composer(deep === 'why' ? lines.whyPlaceholder : lines.examplePlaceholder, deep, (text) => void sendDeep(id, text)),
          dontKnowButton(id),
        );
        break;
      case 'done':
        append(panelEl, doneCard(id));
        break;
    }
  }

  function stepPrompt(text: string): HTMLElement {
    return h('p', { class: 'panel-prompt', id: 'step-prompt' }, text);
  }

  /** Explain → Check → Why → Done, with where this idea is. */
  function stepper(id: string): HTMLElement {
    const p = progress[id]!;
    const at = p.step === 'fix' ? 'check' : p.step === 'why' ? 'deep' : p.step;
    // A done idea ticks every step, Done included.
    const index = p.step === 'done' ? SHOWN.length : SHOWN.indexOf(at);
    const deep = deepenMove(idea(id).asksWhy);
    return h(
      'ol',
      { class: 'stepper', id: 'stepper', 'aria-label': idea(id).name },
      ...SHOWN.map((s, n) =>
        h(
          'li',
          { class: n < index ? 'past' : n === index ? 'now' : '', 'aria-current': n === index ? 'step' : null },
          h('span', { class: 'step-dot', 'aria-hidden': 'true' }, n < index ? '✓' : String(n + 1)),
          s === 'deep' ? lines.steps[deep] : lines.steps[s],
        ),
      ),
    );
  }

  function dontKnowButton(id: string): HTMLElement {
    return h('button', { class: 'quiet', id: 'btn-dontknow', onclick: () => dontKnow(id) }, lines.dontKnow);
  }

  function composer(placeholder: string, move: Move, onSubmit: (text: string) => void): HTMLElement {
    const label = ctx.coach.includes('paste') ? `${placeholder} (copied text is capped)` : placeholder;
    const input = h('textarea', { id: 'teach-input', class: 'composer-input', rows: 2, maxLength: MESSAGE_LIMIT, placeholder: label, 'aria-label': label });
    const counter = h('span', { class: 'counter', 'aria-live': 'polite' });
    const note = h('p', { class: 'note', id: 'composer-note' });
    const send = h('button', { class: 'send', id: 'btn-send', disabled: true }, lines.send);
    const update = () => {
      const value = clampMessage(input.value);
      if (value !== input.value) input.value = value;
      counter.textContent = counterVisible(value.length) ? `${value.length}/${MESSAGE_LIMIT}` : '';
      note.textContent = atLimit(value.length) ? 'That’s the limit: 400 characters.' : '';
      send.disabled = !value.trim() || busy;
    };
    input.addEventListener('input', () => {
      start();
      update();
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
      start();
      sfx.tap();
      if (hint) {
        hint.remove();
        hint = null;
      }
      onSubmit(text);
    };
    send.addEventListener('click', submit);
    queueMicrotask(() => input.focus());
    return h('div', { class: 'composer' }, h('div', { class: 'composer-row' }, input, send), h('div', { class: 'composer-meta' }, note, counter));
  }

  function doneCard(id: string): HTMLElement {
    const p = progress[id]!;
    const name = idea(id).name;
    const level = levelOf(p.value);
    const strong = level === 'signature' || level === 'solid';
    const earned = bonusSeconds(Object.keys(p.earned) as BonusKind[]);
    const next = nextIdea(id);
    const action = next
      ? h('button', { class: 'primary', id: 'btn-next', onclick: () => goTo(next) }, `${lines.nextIdea(nameOf(next))} →`)
      : h('button', { class: 'primary', id: 'btn-fight', onclick: () => fightNow() }, lines.fight);
    queueMicrotask(() => action.focus({ preventScroll: true }));
    return h(
      'div',
      { class: `done-card level-${level}`, id: 'done-card', 'data-level': level },
      h('p', { class: 'done-badge' }, level === 'signature' ? `★ ${lines.levelMastered}` : level === 'solid' ? `✓ ${lines.levelReady}` : lines.levelWeak),
      h('h3', null, level === 'signature' ? lines.doneMastered(name) : strong ? lines.doneReady(name) : lines.doneWeak(name)),
      // The grader's tip: what would make this idea stronger (a mastered idea needs none).
      p.tip && level !== 'signature' ? h('p', { class: 'done-tip', id: 'done-tip' }, p.tip) : null,
      earned ? h('p', { class: 'done-earned' }, lines.earnedHere(earned)) : null,
      h('div', { class: 'done-actions' }, action, isLocked(id) ? null : h('button', { class: 'quiet', id: 'btn-more', onclick: () => teachMore(id) }, lines.teachMore)),
    );
  }

  function sourceCard(current: SealedIdea): HTMLElement {
    const url = current.sourceUrl!;
    return h(
      'div',
      { class: 'source-card', id: 'source-card' },
      h('p', { class: 'card-kicker' }, lines.goFindOut),
      h('h3', null, current.sourceTitle ?? url),
      h('p', { class: 'card-url' }, new URL(url).hostname),
      h('div', { class: 'card-actions' },
        h('a', { class: 'primary', id: 'btn-open-source', href: url, target: '_blank', rel: 'noopener noreferrer', onclick: () => sfx.tap() }, lines.openSource),
        h('button', { class: 'quiet', id: 'btn-keep-teaching', onclick: () => closeCard() }, lines.keepTeaching),
      ),
    );
  }

  // ---------------------------------------------------------------- the steps
  function record(entry: TranscriptEntry) {
    ctx.transcript.push(entry);
    const p = progress[entry.ideaId]!;
    if (entry.move !== 'same' && entry.move !== 'dontknow') p.moves.push(entry.move);
    persist();
  }

  /** A typed message, with pasted text counted as a bare explanation. False when it was pasted (Blot asks again). */
  function recordTyped(id: string, move: Move, text: string): boolean {
    const pasted = isPasted(text, windows);
    record({ ideaId: id, move: effectiveMove(move, pasted), text, ...(pasted ? { pasted } : {}) });
    if (!pasted) return true;
    blotLine(lines.pasted, 'confused');
    sfx.fizzle();
    void refreshGrade(id);
    return false;
  }

  /** Step 1: the player explains; Blot says it back. A misread idea is said back wrong, the first time (SPEC §7 rule 3). */
  async function sendExplain(id: string, text: string) {
    if (busy || finished) return;
    if (!recordTyped(id, 'say', text)) return;
    const p = progress[id]!;
    if (p.belief === 'none') p.belief = ctx.misreads.includes(id) ? 'misread' : 'right';
    // The grade fills the bar while the player reads Blot's say-back.
    void refreshGrade(id);
    await think(async () => {
      p.saidBack = await blotSays(id, 'check', text);
      p.step = 'check';
    });
    persist();
  }

  /** Step 2: ✓ or ✗ on what Blot said back. Catching Blot's mix-up earns time; missing it, Blot owns up. */
  function check(id: string, yes: boolean) {
    if (busy || finished) return;
    start();
    const p = progress[id]!;
    const misread = p.belief === 'misread';
    record({ ideaId: id, move: 'check', tap: yes ? 'yes' : 'no', ...(misread ? (yes ? { fooled: true } : { caught: true }) : {}) });
    if (misread) {
      p.step = 'fix';
      if (yes) {
        sfx.fizzle();
        blotLine(lines.fooled, 'confused');
      } else {
        sfx.caught();
        award(id, ['caught']);
        blotLine(lines.caught, 'excited');
      }
      paintIdeas(id);
      renderPanel();
      return;
    }
    if (!yes) {
      sfx.tap();
      p.step = 'fix';
      blotLine(lines.fixWhat, 'confused');
      renderPanel();
      return;
    }
    sfx.tap();
    // A checked explanation raises the cap (shared/bars.ts): the bar may reach Ready right here.
    applyValue(id);
    if (hasDeep(p)) {
      p.step = 'done';
      celebrate(id);
    } else {
      void think(() => ask(id)).then(persist);
    }
  }

  /** Step 2b: the player puts Blot right, and Blot asks its why. */
  async function sendFix(id: string, text: string) {
    if (busy || finished) return;
    if (!recordTyped(id, 'say', text)) return;
    const p = progress[id]!;
    void refreshGrade(id);
    await think(async () => {
      await blotSays(id, 'fix', text);
      // Whatever Blot had mixed up, the player has now told it the right way round.
      p.belief = 'right';
      applyValue(id);
      if (hasDeep(p)) {
        p.step = 'done';
        return;
      }
      // A beat to read Blot's reply before its question (the clock is waiting anyway).
      await wait(1500);
      await ask(id);
    });
    if (p.step === 'done') celebrate(id);
    persist();
  }

  /** Step 3: Blot asks why, or for an example when the idea has no reason behind it. Runs inside think(). */
  async function ask(id: string): Promise<void> {
    const p = progress[id]!;
    p.step = 'why';
    sfx.question();
    if (deepenMove(idea(id).asksWhy) === 'example') {
      p.blotAsked = lines.exampleQuestion(idea(id).name);
      blotLine(p.blotAsked, 'listening');
      return;
    }
    p.blotAsked = await blotSays(id, 'askWhy');
  }

  async function sendDeep(id: string, text: string) {
    if (busy || finished) return;
    const move = deepenMove(idea(id).asksWhy);
    if (!recordTyped(id, move, text)) return;
    const p = progress[id]!;
    // The done card waits for the grade: it says how well Blot now knows the idea.
    await think(async () => {
      await Promise.all([blotSays(id, move, text), refreshGrade(id)]);
      p.step = 'done';
    });
    celebrate(id);
  }

  /** The idea is done: the card shows how well Blot knows it, and what comes next. */
  function celebrate(id: string) {
    const p = progress[id]!;
    persist();
    if (finished) return;
    paintIdeas(id);
    renderPanel();
    const level = levelOf(p.value);
    if (!nextIdea(id)) blotLine(lines.allDone, 'proud');
    else if (level === 'signature' || level === 'solid') pose(level === 'signature' ? 'proud' : 'excited', 1800);
  }

  function teachMore(id: string) {
    if (busy || finished) return;
    sfx.tap();
    const p = progress[id]!;
    p.step = 'explain';
    bubble.set(lines.morePrompt(idea(id).name));
    pose('listening');
    paintIdeas();
    renderPanel();
    persist();
  }

  function dontKnow(id: string) {
    if (busy || finished) return;
    start();
    sfx.tap();
    record({ ideaId: id, move: 'dontknow' });
    const p = progress[id]!;
    if (idea(id).sourceUrl) {
      cardFor = id;
      pausedForCard = true;
      blotLine(lines.dontKnowCard, 'excited');
      renderPanel();
      return;
    }
    blotLine(lines.noSource, 'idle');
    if (p.step === 'why') {
      p.step = 'done';
      celebrate(id);
      return;
    }
    const next = nextIdea(id);
    if (next) goTo(next, false);
  }

  function closeCard() {
    if (!cardFor) return;
    const id = cardFor;
    cardFor = null;
    pausedForCard = false;
    blotLine(progress[id]!.step === 'why' ? lines.soWhy : lines.soWhat, 'listening');
    renderPanel();
  }

  // ---------------------------------------------------------------- moving between ideas
  /** The next idea still to finish, after this one (wrapping round); null when every idea is done. */
  function nextIdea(from: string): string | null {
    const ids = lesson.ideas.map((i) => i.id).filter((i) => !isLocked(i));
    const at = ids.indexOf(from);
    for (let n = 1; n <= ids.length; n++) {
      const id = ids[(at + n) % ids.length]!;
      if (id !== from && progress[id]!.step !== 'done') return id;
    }
    return null;
  }

  function goTo(id: string, greet = true) {
    sfx.tap();
    selectIdea(id, greet);
  }

  /** What Blot says when the player turns to an idea: whatever that idea's step needs. */
  function greetFor(id: string) {
    const p = progress[id]!;
    const name = idea(id).name;
    if (p.step === 'check' && p.saidBack) blotLine(p.saidBack, 'listening');
    else if (p.step === 'fix') blotLine(lines.fixWhat, 'confused');
    else if (p.step === 'why' && p.blotAsked) blotLine(p.blotAsked, 'confused');
    else if (p.step === 'done') blotLine(levelOf(p.value) === 'signature' ? lines.doneMastered(name) : levelOf(p.value) === 'solid' ? lines.doneReady(name) : lines.doneWeak(name), 'idle');
    else blotLine(lines.askAbout(name), 'listening');
  }

  function selectIdea(id: string, greet = true) {
    if (finished || busy || isLocked(id)) return;
    if (id === selected && !cardFor) return;
    selected = id;
    cardFor = null;
    pausedForCard = false;
    paintIdeas();
    renderPanel();
    if (greet) greetFor(id);
    // A round picked up after a reload may have lost Blot's last words: Blot says them again.
    const p = progress[id]!;
    if (p.step === 'check' && !p.saidBack) {
      void think(async () => {
        p.saidBack = await blotSays(id, 'check');
      });
    } else if (p.step === 'why' && !p.blotAsked) {
      void think(() => ask(id));
    }
  }

  // ---------------------------------------------------------------- the clock, the bell, the end
  paintTimer();
  let ticks = 0;
  const ticker = window.setInterval(() => {
    const now = performance.now();
    if (!clockStopped()) remaining -= now - lastTick;
    lastTick = now;
    if (++ticks % 15 === 0) persist(); // the time left, every three seconds
    if (started && remaining <= 10_000 && !warned) {
      warned = true;
      if (!busy) blotLine(lines.timeLow, 'excited');
    }
    // Coach focus "coverage": at half time, Blot points out the empty ideas.
    if (!nudged && started && ctx.coach.includes('coverage') && remaining <= (ctx.teachSeconds * 1000) / 2) {
      nudged = true;
      const empty = lesson.ideas.filter((i) => !isLocked(i.id) && !progress[i.id]!.moves.length).length;
      if (empty >= 2 && !busy) blotLine(lines.coverage(empty), 'excited');
    }
    if (remaining <= 0) {
      remaining = 0;
      sfx.bell();
      finish();
    }
    paintTimer();
  }, 200);

  const onVisibility = () => {
    if (document.hidden) {
      hidden = true;
    } else if (hidden) {
      hidden = false;
      lastTick = performance.now();
      // Back from the page Blot pointed to: Blot asks again.
      if (pausedForCard) closeCard();
    }
    paintTimer();
  };
  document.addEventListener('visibilitychange', onVisibility);

  let armedUntil = 0;
  bellBtn.addEventListener('click', () => {
    const now = performance.now();
    if (now < armedUntil) {
      fightNow();
      return;
    }
    armedUntil = now + BELL_ARM_MS;
    sfx.tap();
    bellBtn.classList.add('armed');
    bellBtn.textContent = lines.bellAgain;
    setTimeout(() => {
      if (!finished && performance.now() >= armedUntil) {
        bellBtn.classList.remove('armed');
        bellBtn.textContent = lines.bell;
      }
    }, BELL_ARM_MS + 50);
  });

  function fightNow() {
    sfx.bell();
    finish();
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && cardFor) closeCard();
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
    persist();
    clearInterval(ticker);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('keydown', onKey);
    cancelAnimationFrame(raf);
    blot.destroy();
    resolveDone();
  }

  // A resumed round picks up its grades (the server keeps them, so this costs nothing new).
  if (ctx.resumeRemainingMs !== null) {
    for (const i of lesson.ideas) if (!isLocked(i.id) && progress[i.id]!.moves.length) void refreshGrade(i.id);
  }
  paintIdeas();
  const first = ctx.focus && !isLocked(ctx.focus) ? ctx.focus : (lesson.ideas.find((i) => !isLocked(i.id) && progress[i.id]!.step !== 'done') ?? lesson.ideas.find((i) => !isLocked(i.id)))?.id;
  if (first) selectIdea(first, false);
  else renderPanel();
  return done;
}
