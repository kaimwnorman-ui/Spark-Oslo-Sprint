// The extension's settings page: where the Spark server is, and the token it expects (SPEC §18).
// Both live in chrome.storage.local and are read by the service worker and the game tab (settings.ts).
import { CLIENT_TOKEN, SERVER_URL } from '../../shared/config.ts';

const server = document.getElementById('server') as HTMLInputElement;
const token = document.getElementById('token') as HTMLInputElement;
const status = document.getElementById('status') as HTMLElement;
const form = document.getElementById('form') as HTMLFormElement;
const test = document.getElementById('test') as HTMLButtonElement;

const say = (text: string, kind: 'ok' | 'bad' | '' = '') => {
  status.textContent = text;
  status.className = kind;
};

/** An address the extension can use: http(s) only, no path, no trailing slash. Empty means the default. */
export function normaliseServer(raw: string): string | null {
  const text = raw.trim();
  if (!text) return '';
  try {
    const u = new URL(text);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

async function load(): Promise<void> {
  const got = await chrome.storage.local.get(['serverUrl', 'clientToken']);
  server.value = typeof got.serverUrl === 'string' ? got.serverUrl : '';
  token.value = typeof got.clientToken === 'string' ? got.clientToken : '';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const address = normaliseServer(server.value);
  if (address === null) {
    say('That is not a web address. Try something like http://localhost:8787.', 'bad');
    server.focus();
    return;
  }
  if (address) await chrome.storage.local.set({ serverUrl: address });
  else await chrome.storage.local.remove('serverUrl');
  if (token.value.trim()) await chrome.storage.local.set({ clientToken: token.value.trim() });
  else await chrome.storage.local.remove('clientToken');
  server.value = address;
  say('Saved.', 'ok');
});

/** Reaches the server, then checks the token with a call that costs nothing (an unknown challenge code: 410 means the token was accepted). */
test.addEventListener('click', async () => {
  const address = normaliseServer(server.value);
  if (address === null) {
    say('That is not a web address.', 'bad');
    return;
  }
  const base = address || SERVER_URL;
  say('Testing…');
  try {
    const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
    if (!health.ok) throw new Error(`The server answered ${health.status}.`);
    const info = (await health.json()) as { ai?: string };
    const probe = await fetch(`${base}/duel/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-spark': token.value.trim() || CLIENT_TOKEN },
      body: JSON.stringify({ code: 'zzzzzzzz' }),
      signal: AbortSignal.timeout(5000),
    });
    if (probe.status === 403) say('The server is there, but it does not accept this token.', 'bad');
    else say(`Connected. The server is in ${info.ai === 'live' ? 'live AI' : info.ai === 'stub' ? 'test' : 'offline'} mode.`, 'ok');
  } catch (err) {
    say(`Spark cannot reach ${base}. ${err instanceof Error && err.name !== 'TimeoutError' ? err.message : 'Is the server running?'}`, 'bad');
  }
});

void load();
