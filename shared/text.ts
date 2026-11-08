// Text that came from a web page, a player or a model, made safe to show and to put back into a prompt.
// Pure and tested. The goal is structural: no tag can be opened or closed, no line can be forged,
// no invisible or direction-changing character can hide an instruction.

/**
 * Control, zero-width and direction-changing characters (tab, newline and carriage return are handled
 * separately). Built from code points so this file itself holds no invisible characters.
 */
const HIDDEN_RANGES: readonly (readonly [number, number])[] = [
  [0x0000, 0x0008],
  [0x000b, 0x000c],
  [0x000e, 0x001f],
  [0x007f, 0x009f],
  [0x200b, 0x200f], // zero-width space and joiners, left-to-right and right-to-left marks
  [0x2028, 0x2029], // line and paragraph separators
  [0x202a, 0x202e], // embeddings and overrides
  [0x2066, 0x2069], // isolates
  [0xfeff, 0xfeff], // byte order mark
];

const HIDDEN = new RegExp(
  '[' + HIDDEN_RANGES.map(([a, b]) => String.fromCharCode(a) + (b > a ? '-' + String.fromCharCode(b) : '')).join('') + ']',
  'g',
);

/** True when the text holds a hidden or direction-changing character (for tests and checks). */
export function hasHidden(text: string): boolean {
  return new RegExp(HIDDEN.source).test(text);
}

const BRACKETS = (c: string) => (c === '<' ? '‹' : '›');

/** One short line for the lesson: hidden characters gone, angle brackets turned into ‹ ›, whitespace collapsed, capped. */
export function tidy(text: unknown, max: number): string {
  const s = typeof text === 'string' ? text : '';
  return s.replace(HIDDEN, ' ').replace(/[<>]/g, BRACKETS).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** tidy, and no quote characters either: for a value placed between quotes inside an instruction. */
export function inert(text: unknown, max = 200): string {
  return tidy(text, max).replace(/["`]/g, "'");
}

/** The first sentence of a text. */
export function firstSentence(text: string): string {
  return text.trim().split(/(?<=[.!?])\s+/)[0] ?? '';
}

/** At most `words` words, with an ellipsis when it was cut, and no closing punctuation to clash with quote marks around it. */
export function clip(text: string, words: number): string {
  const all = text.trim().split(/\s+/).filter(Boolean);
  return all.slice(0, words).join(' ').replace(/[.!?…]+$/, '') + (all.length > words ? '…' : '');
}

/** Page or player text inside a data block: lines are kept, but no tag can be opened or closed. */
export function neutral(text: string): string {
  return text.replace(HIDDEN, ' ').replace(/[<>]/g, BRACKETS);
}
