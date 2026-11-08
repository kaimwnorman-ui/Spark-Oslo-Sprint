// The first-use notice (SPEC §18): Spark sends a page's text away only after the player has seen where it goes.
// Bump CONSENT_VERSION whenever what is sent, or where, changes: everyone is asked again.
export const CONSENT_VERSION = 1;

export async function hasConsent(): Promise<boolean> {
  try {
    const got = await chrome.storage.local.get('consent');
    return (got.consent as { v?: number } | undefined)?.v === CONSENT_VERSION;
  } catch {
    return false;
  }
}

export async function giveConsent(): Promise<void> {
  await chrome.storage.local.set({ consent: { v: CONSENT_VERSION, at: Date.now() } });
}
