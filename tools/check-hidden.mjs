// check:hidden: no invisible or direction-changing characters in the repo's text files (the "Trojan
// source" trick: code that reads one way and runs another). Built from code points so this file is clean too.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { ROOT } from './lib.mjs';

const RANGES = [
  [0x200b, 0x200f], // zero-width characters and direction marks
  [0x2028, 0x2029], // line and paragraph separators
  [0x202a, 0x202e], // embeddings and overrides
  [0x2066, 0x2069], // isolates
  [0xfeff, 0xfeff], // byte order mark
];
const BINARY = /\.(png|webp|jpe?g|gif|ico|woff2?|zip|ttf|mp3|wav)$/i;

const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && !BINARY.test(f));

const hits = [];
let checked = 0;
for (const file of files) {
  let text;
  try {
    if (!statSync(`${ROOT}/${file}`).isFile()) continue;
    text = readFileSync(`${ROOT}/${file}`, 'utf8');
  } catch {
    continue;
  }
  checked++;
  text.split('\n').forEach((line, i) => {
    for (const ch of line) {
      const code = ch.codePointAt(0);
      if (RANGES.some(([a, b]) => code >= a && code <= b)) hits.push(`${file}:${i + 1}: U+${code.toString(16).toUpperCase().padStart(4, '0')}`);
    }
  });
}

if (hits.length) {
  console.error(`check:hidden FAILED: ${hits.length} hidden character(s):\n${hits.slice(0, 20).join('\n')}`);
  process.exit(1);
}
console.log(`check:hidden ok: ${checked} files, no hidden or direction-changing characters.`);
