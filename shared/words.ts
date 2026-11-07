// Word helpers: tokenising, stop words, the monster's distinctive words, 6-word windows.

const STOP = new Set(
  (
    // English
    'a an the and or but if then than so of to in on at by for from with without into onto over under up down out off ' +
    'is are was were be been being am do does did done have has had having can could will would shall should may might must ' +
    'i me my we our us you your he him his she her it its they them their this that these those there here what which who whom whose ' +
    'when where why how all any both each few more most other some such no nor not only own same too very just also as about ' +
    'again once because until while during before after above below between through against further one two three ' +
    'get gets got make makes made like way ways thing things lot lots much many every even still yet ever well really quite ' +
    // Norwegian
    'og i er det som en et å på til av for med har de ikke den om var så men vi kan seg han hun jeg du deg meg sin sitt sine ' +
    'eller når fra ble blir være vært hva hvor hvorfor hvordan dette disse der her alle noe noen mer mest også bare enn ved etter ' +
    'før under over mot inn ut opp ned man mange mye hver hvert skal skulle vil ville kunne må'
  ).split(/\s+/),
);

/** Lower-case word tokens (letters and digits, any script). */
export function tokens(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
}

export function isStopWord(word: string): boolean {
  return STOP.has(word.toLowerCase());
}

/** Content words: no stop words, no numbers, at least 3 letters. */
export function contentWords(text: string): string[] {
  return tokens(text).filter((w) => w.length >= 3 && !STOP.has(w) && !/^\p{N}+$/u.test(w));
}

/**
 * The monster's texture: the page's most distinctive words, by frequency, longest
 * first (SPEC §6). Keeps the page's own spelling of each word.
 */
export function distinctiveWords(text: string, count: number): string[] {
  const freq = new Map<string, { n: number; first: number; shown: string }>();
  const raw = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
  raw.forEach((shown, i) => {
    const w = shown.toLowerCase();
    if (w.length < 4 || STOP.has(w) || /^\p{N}+$/u.test(w)) return;
    const entry = freq.get(w);
    if (entry) entry.n++;
    else freq.set(w, { n: 1, first: i, shown });
  });
  return [...freq.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first)
    .slice(0, count)
    .sort((a, b) => b[0].length - a[0].length || b[1].n - a[1].n)
    .map(([, e]) => e.shown);
}

/** All 6-word windows of a text, as normalised strings. */
export function windows(text: string, size = 6): string[] {
  const t = tokens(text);
  const out: string[] = [];
  for (let i = 0; i + size <= t.length; i++) out.push(t.slice(i, i + size).join(' '));
  return out;
}

/** Rough stem for loose matching across word forms ("tides" ~ "tidal"). */
export function stem(word: string): string {
  return word.toLowerCase().slice(0, 5);
}
