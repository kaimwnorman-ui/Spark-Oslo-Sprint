// Screens, the top bar and Blot's speech bubble.
import { h } from './dom.ts';
import { isMuted, setMuted, sfx } from './sound.ts';

window.__screens = [];

// Leaving mid-round loses it: ask first, but only when there is something to lose.
let leaveGuard: (() => boolean) | null = null;
export function setLeaveGuard(hasWork: (() => boolean) | null): void {
  leaveGuard = hasWork;
}
window.addEventListener('beforeunload', (e) => {
  if (!leaveGuard?.()) return;
  e.preventDefault();
  e.returnValue = '';
});

export interface ScreenOptions {
  /** Keep the previous screen underneath (the forming overlay sits on the page). */
  overlay?: boolean;
  /** Label for the top bar's Home button; null hides it. */
  home?: (() => void) | null;
  /** Something else for the top bar's left slot when there is no Home button (the home screen). */
  left?: HTMLElement | null;
}

let homeHandler: (() => void) | null = null;
let leftSlot: HTMLElement | null = null;

/** Mounts a new screen root (#screen-<id>) and records it for the smoke test. */
export function showScreen(id: string, opts: ScreenOptions = {}): HTMLElement {
  const app = document.getElementById('app')!;
  const el = h('section', { class: `screen screen-${id}`, id: `screen-${id}` });
  if (!opts.overlay) {
    for (const child of [...app.children]) child.remove();
  } else {
    el.classList.add('overlay');
  }
  app.append(el);
  window.__screens.push(id);
  homeHandler = opts.home ?? null;
  leftSlot = opts.left ?? null;
  renderTopBar();
  return el;
}

export function removeScreen(id: string): void {
  document.getElementById(`screen-${id}`)?.remove();
}

function renderTopBar(): void {
  let bar = document.getElementById('topbar');
  if (!bar) {
    bar = h('div', { id: 'topbar' });
    document.body.append(bar);
  }
  bar.replaceChildren(
    homeHandler
      ? h('button', { class: 'icon-btn', id: 'btn-topbar-home', onclick: () => homeHandler?.(), 'aria-label': 'Home' }, '⌂ Home')
      : (leftSlot ?? h('span')),
    muteButton(),
  );
}

function muteButton(): HTMLButtonElement {
  const btn = h('button', { class: 'icon-btn', id: 'btn-mute', 'aria-pressed': String(isMuted()) });
  const paint = () => {
    btn.textContent = isMuted() ? '🔇 Sound off' : '🔊 Sound on';
    btn.setAttribute('aria-pressed', String(isMuted()));
  };
  btn.addEventListener('click', async () => {
    await setMuted(!isMuted());
    paint();
    sfx.tap();
  });
  paint();
  return btn;
}

/** A primary action: big, high-contrast, verb-labelled. */
export function primary(id: string, label: string, onClick?: () => void): HTMLButtonElement {
  return h('button', { class: 'primary', id, onclick: onClick ? () => { sfx.tap(); onClick(); } : undefined }, label);
}

export function secondary(id: string, label: string, onClick?: () => void): HTMLButtonElement {
  return h('button', { class: 'secondary', id, onclick: onClick ? () => { sfx.tap(); onClick(); } : undefined }, label);
}

/** Blot's speech bubble: streams text in as it arrives. */
export class Bubble {
  readonly el: HTMLElement;
  private token = 0;
  constructor(extraClass = '') {
    this.el = h('div', { class: `bubble ${extraClass}`, role: 'status', 'aria-live': 'polite' });
  }
  set(text: string): void {
    this.token++;
    this.el.textContent = text;
    this.el.classList.toggle('empty', !text);
    this.pop();
  }
  async stream(chunks: AsyncIterable<string>): Promise<string> {
    const my = ++this.token;
    this.el.textContent = '';
    this.el.classList.remove('empty');
    this.el.classList.add('typing');
    this.pop();
    let text = '';
    try {
      for await (const chunk of chunks) {
        if (my !== this.token) break;
        text += chunk;
        this.el.textContent = text;
      }
    } finally {
      if (my === this.token) this.el.classList.remove('typing');
    }
    return text;
  }
  private pop(): void {
    this.el.classList.remove('pop');
    void this.el.offsetWidth;
    this.el.classList.add('pop');
  }
}

/** A playful loader: ink swirling, never a bare spinner (SPEC §4.1). */
export function inkSwirl(label: string): HTMLElement {
  return h(
    'div',
    { class: 'ink-swirl', role: 'status' },
    h('div', { class: 'swirl-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'), h('i')),
    h('p', null, label),
  );
}

/** One small "offline mode" line (SPEC §13): shown once the round runs without the AI. */
export function showOfflineNote(text: string): void {
  document.getElementById('device-note')?.remove();
  if (document.getElementById('offline-note')) return;
  document.body.append(h('div', { id: 'offline-note', class: 'offline-note', role: 'status' }, text));
}

/** A quieter line in the same spot: Blot is thinking on this device (Opera WebAI). */
export function showDeviceNote(text: string): void {
  if (document.getElementById('device-note') || document.getElementById('offline-note')) return;
  document.body.append(h('div', { id: 'device-note', class: 'device-note', role: 'status' }, text));
}
