// URL parameters the game reads, parsed safely. Pure and tested.

/** ?teach=N (presenters, tests): seconds of teaching, kept between 20 and 300. Missing or not a number: null, so the default applies. */
export function teachSeconds(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(300, Math.max(20, Math.round(n)));
}

/** ?days=N: how many days the game's clock runs ahead (presenters, tests), 0 to 365. */
export function daysAhead(raw: string | null | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(365, Math.floor(n)) : 0;
}
