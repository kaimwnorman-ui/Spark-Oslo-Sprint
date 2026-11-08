// "Pick up where you left off?" (SPEC §18): shown when the game opens on a round that was being taught.
import { createBlot } from '../blot.ts';
import { h } from '../dom.ts';
import { primary, secondary, showScreen } from '../ui.ts';

export interface ResumeOptions {
  monsterName: string;
  taught: number;
  total: number;
  remainingMs: number;
  onHome: () => void;
}

const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export async function resumeScreen(opts: ResumeOptions): Promise<'resume' | 'restart'> {
  const root = showScreen('resume', { home: opts.onHome });
  const blot = createBlot(170);
  blot.setPose('excited');
  const resume = primary('btn-resume', 'Resume');
  const restart = secondary('btn-restart', 'Start over');
  root.append(
    h(
      'div',
      { class: 'resume-card' },
      h('div', { class: 'resume-blot' }, blot.el),
      h(
        'div',
        { class: 'resume-text' },
        h('p', { class: 'card-kicker' }, 'Welcome back'),
        h('h1', null, 'Pick up where you left off?'),
        h('p', { class: 'resume-detail', id: 'resume-detail' }, `You were fighting ${opts.monsterName}: ${opts.taught} of ${opts.total} ideas taught, ${clock(opts.remainingMs)} left.`),
        h('div', { class: 'resume-actions' }, resume, restart),
      ),
    ),
  );
  resume.focus();
  const choice = await new Promise<'resume' | 'restart'>((resolve) => {
    resume.addEventListener('click', () => resolve('resume'), { once: true });
    restart.addEventListener('click', () => resolve('restart'), { once: true });
  });
  blot.destroy();
  return choice;
}
