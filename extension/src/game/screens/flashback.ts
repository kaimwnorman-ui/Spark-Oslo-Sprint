// The flashback (SPEC §17): Blot is forgetting something the player taught it days ago. Answering
// from memory refreshes the memory (and its trait), and a good answer earns a power-up.
import { MESSAGE_LIMIT } from '../../../../shared/config.ts';
import {
  DAY_MS, REFILL_HP, RECALL_PASS, applyRecall, earnPowerUp, gradeRecall, recallGrade, replaceCard,
  type MemoryCard, type PowerUp, type RecallFlag, type RecallGrade,
} from '../../../../shared/memory.ts';
import type { Trait } from '../../../../shared/types.ts';
import { wait } from '../anim.ts';
import { createBlot } from '../blot.ts';
import { h } from '../dom.ts';
import { Effects } from '../effects.ts';
import { linesFor } from '../lines.ts';
import { currentTraits, now, updateMemory } from '../memory-store.ts';
import { postJson } from '../server-engine.ts';
import { sfx } from '../sound.ts';
import { Bubble, inkSwirl, primary, showScreen } from '../ui.ts';

export interface FlashbackResult {
  /** Null when the player skipped. */
  score: number | null;
  grade: RecallGrade | null;
  earned: PowerUp | null;
}

export interface FlashbackOptions {
  card: MemoryCard;
  traits: Trait[];
  /** Label of the button that leaves the result ("Teach Blot" before a round). */
  continueLabel: string;
  onHome: (() => void) | null;
}

interface Graded {
  score: number;
  feedback: string;
  /** Who graded it: the AI, or a word match against the key points (offline, and always for demo pages). */
  checked: 'ai' | 'words';
  flag: RecallFlag;
}

/**
 * Only an idea taught on a real page (graded by the server's AI) is ever sent to the server. A demo page's
 * flashback is graded here by word matching and says so; nothing leaves the browser.
 */
async function grade(card: MemoryCard, answer: string): Promise<Graded> {
  if (card.live) {
    try {
      const r = await postJson<{ score: number; feedback: string; offline?: boolean; flag?: RecallFlag }>(
        '/recall',
        { ideaName: card.ideaName, question: card.question, modelAnswer: card.modelAnswer, keyPoints: card.keyPoints, language: card.language, answer },
        9000,
      );
      if (typeof r.score === 'number') {
        return { score: Math.round(Math.max(0, Math.min(100, r.score))), feedback: r.feedback || '', checked: r.offline ? 'words' : 'ai', flag: r.flag ?? 'ok' };
      }
    } catch {
      // The server is away: grade here.
    }
  }
  const g = gradeRecall(card, answer);
  return { score: g.score, feedback: '', checked: 'words', flag: g.flag };
}

function ago(at: number): string {
  const days = Math.max(0, Math.round((now() - at) / DAY_MS));
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

/** What to tell the player when the grader gave no sentence of its own: honest about word matching, never "you remembered" for a list of words or the opposite. */
function feedbackFor(g: Graded, grade: RecallGrade): string {
  if (g.flag === 'opposite') return 'That sounds like the opposite of the idea. Read the answer below.';
  if (g.flag === 'keywords') return 'That reads like a list of words. Try one full sentence next time.';
  if (g.flag === 'empty') return 'Blot needs a few more words to go on.';
  if (grade === 'pass') return g.checked === 'words' ? 'Your words cover the key points.' : 'You remembered the heart of it.';
  if (grade === 'partial') return 'You remembered part of it. Read the answer, then teach it better next time.';
  return 'Read the answer once more. Blot will ask again soon.';
}

const POWER_TEXT: Record<PowerUp, { name: string; what: string; icon: string }> = {
  refill: { name: 'Ink refill', what: `Blot starts your next fight with +${REFILL_HP} HP.`, icon: '🧪' },
  double: { name: 'Double ink', what: 'Blot’s first hit in your next fight hits twice as hard.', icon: '✦' },
};

export async function flashbackScreen(opts: FlashbackOptions): Promise<FlashbackResult> {
  const { card } = opts;
  const lines = linesFor(card.language);
  const root = showScreen('flashback', { home: opts.onHome });
  const effects = new Effects();
  const blot = createBlot(250);
  blot.setTraits(opts.traits);
  blot.setPose('confused');
  const bubble = new Bubble('flash-bubble');
  bubble.set(lines.forgetting);

  const input = h('textarea', {
    id: 'flash-input',
    class: 'composer-input flash-input',
    rows: 3,
    maxLength: MESSAGE_LIMIT,
    placeholder: 'Answer from memory, in your own words…',
    'aria-label': 'Your answer from memory',
  });
  const note = h('p', { class: 'note', id: 'flash-note', 'aria-live': 'polite' });
  const send = primary('btn-remind', 'Remind Blot');
  send.disabled = true;
  const forgot = h('button', { class: 'quiet', id: 'btn-forgot' }, 'I don’t remember');
  const skip = h('button', { class: 'quiet', id: 'btn-skip-flash' }, 'Skip for now');
  const card$ = h(
    'div',
    { class: 'flash-card', id: 'flash-card' },
    h('p', { class: 'card-kicker' }, 'A memory is fading'),
    h('p', { class: 'flash-from' }, `“${card.ideaName}” · from ${card.monsterName} · taught ${ago(card.learnedAt)}`),
    h('h1', { class: 'flash-question', id: 'flash-question' }, card.question),
    input,
    note,
    h('div', { class: 'flash-actions' }, send, h('div', { class: 'flash-quiet' }, forgot, skip)),
    h('p', { class: 'flash-reward' }, h('span', { 'aria-hidden': 'true' }, '✦ '), `Remember it to earn a power-up for your next fight.`),
  );
  root.append(h('div', { class: 'flash-blot' }, bubble.el, blot.el), card$, effects.canvas);
  input.focus();

  const words = () => input.value.trim().split(/\s+/).filter(Boolean).length;
  input.addEventListener('input', () => {
    send.disabled = !input.value.trim();
    note.textContent = '';
  });
  const answered = new Promise<{ answer: string } | 'skip'>((resolve) => {
    const submit = () => {
      if (send.disabled) return;
      if (words() < 3) {
        note.textContent = 'A few more words, please.';
        sfx.fizzle();
        return;
      }
      sfx.tap();
      resolve({ answer: input.value.trim() });
    };
    send.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    });
    forgot.addEventListener('click', () => {
      sfx.tap();
      resolve({ answer: '' });
    });
    skip.addEventListener('click', () => {
      sfx.tap();
      resolve('skip');
    });
  });

  const got = await answered;
  if (got === 'skip') {
    blot.destroy();
    effects.destroy();
    return { score: null, grade: null, earned: null };
  }

  // Grading: a short ink swirl (the server answers in about 1–2 s). The card keeps its size.
  card$.style.minHeight = `${card$.offsetHeight}px`;
  card$.replaceChildren(inkSwirl('Blot is remembering…'));
  card$.classList.add('grading');
  blot.setPose('listening');
  const started = performance.now();
  const graded: Graded = got.answer ? await grade(card, got.answer) : { score: 0, feedback: '', checked: 'words', flag: 'empty' };
  const left = 700 - (performance.now() - started);
  if (left > 0) await wait(left);
  const gradeOf = recallGrade(graded.score);

  // Save: the card moves on, a pass earns a power-up.
  const t = now();
  const won: { earned: PowerUp | null } = { earned: null };
  const memory = await updateMemory((m) => {
    const fresh = m.cards.find((c) => c.id === card.id) ?? card;
    const e = earnPowerUp(replaceCard(m, applyRecall(fresh, graded.score, t)), graded.score);
    won.earned = e.earned;
    return e.state;
  });
  const earned = won.earned;
  const refreshed = await currentTraits(memory);
  blot.setTraits(refreshed);

  // The result.
  const kicker = gradeOf === 'pass' ? 'Blot remembers!' : gradeOf === 'partial' ? 'Almost!' : got.answer ? 'Blot forgot this one' : 'Here it is again';
  const ring = h('div', { class: `score-ring grade-${gradeOf}`, id: 'flash-score', role: 'img', 'aria-label': `Score ${graded.score} out of 100` }, h('span', null, String(graded.score)));
  ring.style.setProperty('--p', String(graded.score));
  const reward: HTMLElement = earned
    ? h(
        'div',
        { class: `earned earned-${earned}`, id: 'flash-earned' },
        h('span', { class: 'earned-icon', 'aria-hidden': 'true' }, POWER_TEXT[earned].icon),
        h('div', null, h('p', { class: 'earned-name' }, `${POWER_TEXT[earned].name} earned!`), h('p', { class: 'earned-what' }, POWER_TEXT[earned].what)),
      )
    : h('p', { class: 'flash-reward muted', id: 'flash-earned' }, `Score ${RECALL_PASS} or more to earn a power-up.`);
  const next = primary('btn-flash-continue', opts.continueLabel);
  card$.classList.remove('grading');
  card$.style.minHeight = '';
  card$.replaceChildren(
    h(
      'div',
      { class: 'flash-result-head' },
      ring,
      h(
        'div',
        { class: 'flash-verdict' },
        h('p', { class: 'card-kicker' }, kicker),
        h('p', { class: 'flash-feedback', id: 'flash-feedback' }, graded.feedback || feedbackFor(graded, gradeOf)),
        got.answer
          ? h('p', { class: 'checked-by', id: 'flash-checked' }, graded.checked === 'ai' ? 'Graded by Spark’s AI' : 'Checked by word match: no AI involved, so it can miss a good answer')
          : null,
      ),
    ),
    h('div', { class: 'flash-answer' }, h('p', { class: 'flash-answer-label' }, 'The answer'), h('p', null, card.modelAnswer)),
    reward,
    h('div', { class: 'flash-actions' }, next),
  );
  card$.classList.add('result');
  if (gradeOf === 'pass') {
    blot.setPose('proud');
    bubble.set(lines.remembered);
    sfx.win();
    const r = blot.el.getBoundingClientRect();
    effects.sparks(r.left + r.width / 2, r.top + r.height * 0.3, '#ffd34d', 36, 1.3);
    effects.sparks(r.left + r.width / 2, r.top + r.height * 0.3, card.color, 20, 1);
  } else if (gradeOf === 'partial') {
    blot.setPose('excited');
    bubble.set(lines.almost);
    sfx.ink();
  } else {
    blot.setPose('hurt', 900);
    blot.setPose('listening');
    bubble.set(lines.forgot);
    sfx.fizzle();
  }
  next.focus();
  await new Promise<void>((r) => next.addEventListener('click', () => r(), { once: true }));
  blot.destroy();
  effects.destroy();
  return { score: graded.score, grade: gradeOf, earned };
}
