// Fails if the built extension contains an Anthropic key prefix or the literal value
// of any *_API_KEY environment variable. Never prints a value, only file names.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { DIST } from './lib.mjs';

if (!existsSync(DIST)) {
  console.error('extension/dist/ is missing: run npm run build first.');
  process.exit(1);
}
const secrets = Object.entries(process.env)
  .filter(([name, value]) => /_API_KEY$/.test(name) && value && value.trim().length >= 8)
  .map(([name, value]) => ({ name, value: value.trim() }));
const needles = [{ name: 'the sk-ant key prefix', value: 'sk-ant' }, ...secrets];

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* files(full);
    else yield full;
  }
}

let failed = false;
let count = 0;
for (const file of files(DIST)) {
  count++;
  const content = readFileSync(file).toString('latin1');
  for (const needle of needles) {
    if (content.includes(needle.value)) {
      console.error(`KEY FOUND: ${path.relative(DIST, file)} contains ${needle.name}`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);
console.log(`check:nokey ok: ${count} files, ${needles.length} patterns (${secrets.map((s) => s.name).join(', ') || 'no *_API_KEY set'}).`);
