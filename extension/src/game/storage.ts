// chrome.storage when running as the extension; localStorage when the game is opened as a plain page.

const hasChrome = typeof chrome !== 'undefined' && !!chrome.storage?.local;

export async function getLocal<T>(key: string, fallback: T): Promise<T> {
  try {
    if (hasChrome) {
      const got = await chrome.storage.local.get(key);
      return (got[key] as T | undefined) ?? fallback;
    }
    const raw = localStorage.getItem(`spark:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function setLocal(key: string, value: unknown): Promise<void> {
  try {
    if (hasChrome) await chrome.storage.local.set({ [key]: value });
    else localStorage.setItem(`spark:${key}`, JSON.stringify(value));
  } catch {
    // Storage is a convenience: the game works without it.
  }
}

export async function getSession<T>(key: string): Promise<T | null> {
  try {
    if (hasChrome && chrome.storage.session) {
      const got = await chrome.storage.session.get(key);
      return (got[key] as T | undefined) ?? null;
    }
    const raw = sessionStorage.getItem(`spark:${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
