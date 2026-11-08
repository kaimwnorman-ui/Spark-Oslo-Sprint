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

export async function removeLocal(keys: string[]): Promise<void> {
  try {
    if (hasChrome) await chrome.storage.local.remove(keys);
    else for (const key of keys) localStorage.removeItem(`spark:${key}`);
  } catch {
    // Nothing to remove.
  }
}

/** Forgets the page text kept for rounds (the capture the background stored, or its plain-page twin). */
export async function clearRoundHandoffs(): Promise<void> {
  try {
    if (hasChrome && chrome.storage.session) {
      const all = await chrome.storage.session.get(null);
      const keys = Object.keys(all).filter((k) => k.startsWith('round:'));
      if (keys.length) await chrome.storage.session.remove(keys);
    }
    for (const key of Object.keys(sessionStorage)) if (key.startsWith('spark:round:')) sessionStorage.removeItem(key);
  } catch {
    // Nothing to clear.
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
