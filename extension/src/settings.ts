// The few settings the extension keeps: where the Spark server is, and the token it expects.
// Works in the service worker and the game tab (chrome.storage), and in a plain page (localStorage).
import { CLIENT_TOKEN, SERVER_URL } from '../../shared/config.ts';

const hasChrome = typeof chrome !== 'undefined' && !!chrome.storage?.local;

async function readString(key: string): Promise<string> {
  try {
    if (hasChrome) {
      const got = await chrome.storage.local.get(key);
      return typeof got[key] === 'string' ? (got[key] as string).trim() : '';
    }
    return (localStorage.getItem(`spark:${key}`) ?? '').replace(/^"|"$/g, '').trim();
  } catch {
    return '';
  }
}

/** The Spark server: the options page's address, else http://localhost:8787. */
export async function serverUrl(): Promise<string> {
  return (await readString('serverUrl')) || SERVER_URL;
}

/** The X-Spark token: the options page's own secret, else the public default (fine while the server stays on this computer). */
export async function clientToken(): Promise<string> {
  return (await readString('clientToken')) || CLIENT_TOKEN;
}
