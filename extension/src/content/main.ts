// Spark's content script, injected on click (SPEC §13): reads the page, mounts the overlay
// (Shadow DOM, the page itself is never changed), and lifts the page's words into a swirling
// cloud while the server builds the monster. Then the game tab takes over.
import { capturePage } from '../capture.ts';
import { giveConsent, hasConsent } from '../consent.ts';
import { shortUrl } from '../../../shared/url.ts';
import type { PageCapture, WordBox } from '../../../shared/types.ts';

declare global {
  interface Window {
    __sparkOverlay?: boolean;
  }
}

const CSS = `
:host { all: initial; }
.veil { position: fixed; inset: 0; background: rgba(247, 241, 227, 0); transition: background 500ms ease-out; }
.veil.on { background: rgba(247, 241, 227, 0.92); }
canvas { position: fixed; inset: 0; pointer-events: none; }
.card { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); display: grid; gap: 8px; justify-items: center;
  max-width: min(560px, 92vw); padding: 16px 22px; border-radius: 22px; background: #f7f1e3; color: #1d1a2f;
  border: 3px solid #1d1a2f; box-shadow: 0 8px 0 #1d1a2f; font: 600 18px/1.35 system-ui, sans-serif; text-align: center; }
.row { display: flex; align-items: center; gap: 12px; font-size: 20px; font-weight: 800; }
.note { margin: 0; font-size: 16px; font-weight: 600; color: #3a3650; }
.dots { position: relative; width: 36px; height: 36px; animation: spin 1.2s linear infinite; flex: none; }
.dots i { position: absolute; left: 50%; top: 0; width: 10px; height: 10px; margin-left: -5px; border-radius: 50%; background: #1d1a2f; transform-origin: 5px 18px; }
.dots i:nth-child(2) { transform: rotate(120deg); background: #5b4bff; }
.dots i:nth-child(3) { transform: rotate(240deg); background: #ff7a1a; }
@keyframes spin { to { transform: rotate(360deg); } }
.actions { display: flex; gap: 12px; align-items: center; margin-top: 4px; }
.card.consent { max-width: min(600px, 94vw); text-align: left; justify-items: stretch; gap: 10px; }
.card.consent .row { font-size: 22px; }
.preview { margin: 0; padding: 10px 14px; border-radius: 14px; background: #fff; border: 2px solid #1d1a2f; font-size: 16px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
.preview b { font-weight: 800; }
.preview q { color: #3a3650; font-weight: 500; }
.card.consent .actions { justify-content: flex-end; }
button { font: 800 18px/1 system-ui, sans-serif; min-height: 48px; padding: 10px 20px; border-radius: 999px; border: 3px solid #1d1a2f; cursor: pointer; color: #1d1a2f; }
button.primary { background: #ff7a1a; box-shadow: 0 4px 0 #1d1a2f; font-size: 20px; }
button.quiet { background: transparent; border-color: transparent; text-decoration: underline; font-weight: 700; }
button:focus-visible { outline: 4px solid #5b4bff; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .dots { animation: none; } .veil { transition: none; } }
`;

/** Builds a one-line element from plain text (the page's own words are never put through innerHTML). */
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
}

/** The exact capture, in a few lines: what Spark would send (SPEC §18). */
function previewOf(capture: PageCapture): HTMLElement {
  const words = capture.text.split(/\s+/).filter(Boolean).length;
  const box = document.createElement('p');
  box.className = 'preview';
  box.append(node('b', '', capture.title.trim().slice(0, 90) || shortUrl(capture.url) || 'This page'), document.createElement('br'));
  box.append(document.createTextNode(`${shortUrl(capture.url) || 'this tab'} · ${words.toLocaleString()} words · ${capture.links.length} links`), document.createElement('br'));
  box.append(node('q', '', `${capture.text.slice(0, 140).replace(/\s+/g, ' ').trim()}…`));
  return box;
}

function main(): void {
  if (window.__sparkOverlay) return;
  window.__sparkOverlay = true;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Reading the page happens in this tab only: nothing leaves until the player has said yes.
  const capture = capturePage(document, window);

  // ---- overlay ----
  const host = document.createElement('div');
  host.setAttribute('data-spark-overlay', '');
  host.dataset.state = 'starting';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = CSS;
  const veil = document.createElement('div');
  veil.className = 'veil';
  const canvas = document.createElement('canvas');
  const card = document.createElement('div');
  card.className = 'card';
  card.setAttribute('role', 'status');
  shadow.append(style, veil, canvas, card);
  document.documentElement.append(host);

  const setCard = (html: string) => {
    card.innerHTML = html;
  };
  const enoughWords = capture.text.split(/\s+/).length >= 60;
  const WORKING = `<div class="row"><div class="dots"><i></i><i></i><i></i></div>Your page is turning into a monster…</div>
         <p class="note">Sending this page to your Spark server, which asks Anthropic’s AI for the five ideas.</p>
         <div class="actions"><button class="quiet" data-act="close">Cancel</button></div>`;
  if (!enoughWords) {
    setCard(`<div class="row">Not enough words here to make a monster.</div>
         <p class="note">Try a longer article, or select some text first.</p>
         <div class="actions"><button class="primary" data-act="demo">Play the demo</button><button class="quiet" data-act="close">Close</button></div>`);
  }

  let closed = false;
  let sent = false;
  let delivered = false;
  const close = () => {
    if (closed) return;
    closed = true;
    // Cancelling while the page is on its way aborts the request, it does not just hide the card.
    if (sent && !delivered) {
      try {
        void chrome.runtime.sendMessage({ type: 'spark:cancel' }).catch(() => {});
      } catch {
        // The extension was reloaded: there is nothing left to cancel.
      }
    }
    cancelAnimationFrame(raf);
    host.remove();
    document.removeEventListener('keydown', onKey, true);
    window.__sparkOverlay = false;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  card.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest('button')?.dataset.act;
    if (act === 'close') close();
    if (act === 'allow') {
      void giveConsent().then(begin, begin);
    }
    if (act === 'demo') {
      void chrome.runtime.sendMessage({ type: 'spark:demo' });
      close();
    }
  });

  // ---- the words lift off and swirl ----
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = innerWidth;
  const H = innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const g = canvas.getContext('2d')!;
  const cx = W / 2;
  const cy = H * 0.42;
  const words = capture.boxes.map((b: WordBox, i) => {
    const x = b.x + b.w / 2;
    const y = b.y + b.h / 2;
    return {
      b,
      r0: Math.hypot(x - cx, y - cy),
      a0: Math.atan2(y - cy, x - cx),
      ring: Math.min(W, H) * (0.12 + 0.2 * ((i * 37) % 100) / 100),
      spin: 0.9 + ((i * 53) % 100) / 160,
    };
  });
  let started = performance.now();
  let collapseAt = 0;
  let raf = 0;
  const frame = (now: number) => {
    const t = (now - started) / 1000;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    const lift = Math.min(1, t / 0.5);
    const swirl = reduce ? 0 : Math.min(1, Math.max(0, (t - 0.5) / 1.8));
    const e = swirl * swirl * (3 - 2 * swirl);
    const collapse = collapseAt ? Math.min(1, (now - collapseAt) / 500) : 0;
    let font = '';
    for (const w of words) {
      const r = (w.r0 + (w.ring - w.r0) * e) * (1 - collapse);
      const a = w.a0 + (reduce ? 0 : w.spin * Math.max(0, t - 0.5) * e);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r - lift * 10 * (1 - e);
      const size = Math.round(w.b.size * (1 + 0.2 * lift) * (1 - 0.35 * e));
      const next = `${w.b.weight ?? 400} ${size}px ${w.b.font ?? 'system-ui, sans-serif'}`;
      if (next !== font) g.font = font = next;
      g.globalAlpha = 1 - collapse;
      g.fillStyle = e > 0.5 ? '#3b2fd6' : '#1d1a2f';
      g.fillText(w.b.text, x, y);
    }
    if (collapse < 1 && !closed) raf = requestAnimationFrame(frame);
  };
  /** The words lift off and the page goes to the server. */
  function begin(): void {
    if (closed || sent) return;
    sent = true;
    started = performance.now(); // the lift-off starts now, not when the page was read
    host.dataset.state = 'working';
    card.classList.remove('consent');
    setCard(WORKING);
    raf = requestAnimationFrame(frame);
    void chrome.runtime.sendMessage({ type: 'spark:capture', capture });
  }

  /** First use: show what would be sent, and where, and wait for a yes. */
  function askFirst(): void {
    host.dataset.state = 'consent';
    card.classList.add('consent');
    card.replaceChildren(
      node('div', 'row', 'Send this page to Spark?'),
      node('p', 'note', 'Spark sends this page’s text and links to your Spark server, which asks Anthropic’s AI to write the five ideas. While you teach, your messages go the same way. The page text stays on the server for about two hours. You only see this once.'),
      previewOf(capture),
    );
    const actions = document.createElement('div');
    actions.className = 'actions';
    const allow = node('button', 'primary', 'Send and continue');
    allow.dataset.act = 'allow';
    const cancel = node('button', 'quiet', 'Cancel');
    cancel.dataset.act = 'close';
    actions.append(cancel, allow);
    card.append(actions);
    allow.focus();
  }

  requestAnimationFrame(() => veil.classList.add('on'));
  if (enoughWords) void hasConsent().then((yes) => (yes ? begin() : askFirst()));

  // Even when the server is instant (cache, demo), the words get time to lift and swirl.
  const MIN_SHOW_MS = reduce ? 600 : 2200;
  chrome.runtime.onMessage.addListener((msg: { type?: string; message?: string }, _sender, sendResponse) => {
    if (closed) return false;
    if (msg.type === 'spark:ready') {
      delivered = true;
      host.dataset.state = 'ready';
      const wait = Math.max(0, started + MIN_SHOW_MS - performance.now());
      setTimeout(() => {
        collapseAt = performance.now();
        setCard('<div class="row">Monster ready! Opening the game…</div>');
        // The background opens the game tab once the words have collapsed.
        setTimeout(() => {
          sendResponse(true);
          setTimeout(close, 300);
        }, 550);
      }, wait);
      return true;
    } else if (msg.type === 'spark:failed') {
      host.dataset.state = 'failed';
      cancelAnimationFrame(raf);
      g.clearRect(0, 0, W, H);
      const text = document.createElement('div');
      text.className = 'row';
      text.textContent = msg.message ?? 'Something went wrong.';
      setCard('');
      card.append(text);
      card.insertAdjacentHTML('beforeend', '<p class="note">You can still play: the demo works offline.</p><div class="actions"><button class="primary" data-act="demo">Play the demo</button><button class="quiet" data-act="close">Close</button></div>');
      card.querySelector<HTMLButtonElement>('.primary')?.focus();
    }
    return false;
  });
}

main();
