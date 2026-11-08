// Spark's service worker (SPEC §13): the toolbar button, Alt+Shift+B (the action's shortcut)
// and the right-click "Turn into a monster" all start the transformation on the current tab.
import { LESSON_TTL_MS } from '../../shared/config.ts';
import type { PageCapture, RoundHandoff } from '../../shared/types.ts';
import { clientToken, serverUrl } from './settings.ts';

const MENU_ID = 'spark-transform';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: MENU_ID, title: 'Turn into a monster', contexts: ['page', 'selection'] });
});

chrome.action.onClicked.addListener((tab) => void transform(tab));
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab) void transform(tab);
});

function openGame(query = ''): Promise<chrome.tabs.Tab> {
  return chrome.tabs.create({ url: chrome.runtime.getURL(`game.html${query}`) });
}

/** Injects the content script, which reads the page and mounts the lift-off overlay. */
async function transform(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id || !tab.url || !/^https?:/.test(tab.url)) {
    // Browser pages and the game itself can't be read: show Home instead of failing quietly.
    await openGame();
    return;
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch {
    await openGame('?msg=cant-read');
  }
}

// The test hook for smoke:ext (Playwright cannot click the toolbar).
(globalThis as Record<string, unknown>).sparkTransform = async (tabId: number) => transform(await chrome.tabs.get(tabId));

// A page being turned into a monster can be cancelled: the request to the server is aborted, not just hidden.
const inflight = new Map<number, AbortController>();
(globalThis as Record<string, unknown>).sparkInflight = () => inflight.size; // test hook (smoke:ext)

chrome.runtime.onMessage.addListener((msg: { type?: string; capture?: PageCapture }, sender) => {
  if (msg?.type === 'spark:capture' && msg.capture && sender.tab?.id !== undefined) {
    void handleCapture(msg.capture, sender.tab);
  } else if (msg?.type === 'spark:cancel' && sender.tab?.id !== undefined) {
    inflight.get(sender.tab.id)?.abort();
  } else if (msg?.type === 'spark:demo') {
    void openGame('?demo=tides');
  }
  return false;
});

async function errorText(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // not JSON
  }
  return `The Spark server answered ${res.status}.`;
}

/** Sends the page to /extract while the overlay animates, then hands off to a game tab. */
async function handleCapture(capture: PageCapture, tab: chrome.tabs.Tab): Promise<void> {
  const tabId = tab.id!;
  const server = await serverUrl();
  const token = await clientToken();
  const controller = new AbortController();
  inflight.get(tabId)?.abort();
  inflight.set(tabId, controller);
  try {
    // The word boxes stay in the browser: the server only needs text and links.
    const { url, title, text, links, source } = capture;
    let res: Response;
    try {
      res = await fetch(`${server}/extract`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-spark': token },
        body: JSON.stringify({ capture: { url, title, text, links, source } }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]),
      });
    } catch {
      if (controller.signal.aborted) return; // the player cancelled: nothing more to say
      throw new Error('Spark can’t reach its server. Is it running?');
    }
    if (!res.ok) throw new Error(await errorText(res));
    const data = (await res.json()) as Omit<RoundHandoff, 'capture' | 'server'>;
    const id = crypto.randomUUID();
    if (controller.signal.aborted) return;
    const handoff: RoundHandoff = { at: Date.now(), capture, lesson: data.lesson, seed: data.seed, offline: data.offline, roundId: data.roundId, server };
    await chrome.storage.session.set({ [`round:${id}`]: handoff });
    await pruneHandoffs();
    await chrome.tabs.sendMessage(tabId, { type: 'spark:ready' }).catch(() => {});
    await chrome.tabs.create({ url: chrome.runtime.getURL(`game.html?round=${id}`), index: tab.index + 1, openerTabId: tabId });
  } catch (err) {
    if (controller.signal.aborted) return;
    const message = err instanceof Error ? err.message : 'Something went wrong.';
    await chrome.tabs.sendMessage(tabId, { type: 'spark:failed', message }).catch(() => {});
  } finally {
    if (inflight.get(tabId) === controller) inflight.delete(tabId);
  }
}

/** The page text kept for a round lives in session storage (memory only): forget it after two hours, and keep the newest five. */
async function pruneHandoffs(): Promise<void> {
  const all = await chrome.storage.session.get(null);
  const rounds = Object.entries(all)
    .filter(([key]) => key.startsWith('round:'))
    .map(([key, value]) => ({ key, at: (value as RoundHandoff).at ?? 0 }))
    .sort((a, b) => b.at - a.at);
  const stale = rounds.filter((r, i) => i >= 5 || Date.now() - r.at > LESSON_TTL_MS).map((r) => r.key);
  if (stale.length) await chrome.storage.session.remove(stale);
}
