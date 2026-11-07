// npm run measure: times 5 real calls per role on demo/pages/tides.html (SPEC §12 "Measurement").
//   MODEL_EXTRACTOR=... MODEL_EXAMINER=... EFFORT_EXAMINER=... to try alternatives.
import { readFileSync } from 'node:fs';
import { createAnthropic } from '../server/src/anthropic.ts';
import { loadSettings } from '../server/src/settings.ts';
import { makeLiveAi } from '../server/src/ai.ts';
import type { DemoRound } from '../shared/types.ts';

const RUNS = Number(process.env.RUNS ?? 5);
const settings = loadSettings(process.env);
const client = createAnthropic(settings.keys);
if (!client) {
  console.error('No Anthropic key: nothing to measure.');
  process.exit(1);
}
const lines: string[] = [];
const ai = makeLiveAi(client, settings, (l) => lines.push(l));
const html = readFileSync(new URL('../demo/pages/tides.html', import.meta.url), 'utf8');
const article = html.match(/<article>([\s\S]*)<\/article>/)![1]!;
const text = article.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
const links = [...article.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map((m) => ({ href: m[1]!, text: m[2]! }));
const round = JSON.parse(readFileSync(new URL('../demo/rounds/tides.json', import.meta.url), 'utf8')) as DemoRound;

const p50 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
async function time(label: string, fn: () => Promise<unknown>) {
  const ms: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t = Date.now();
    await fn();
    ms.push(Date.now() - t);
    process.stdout.write(`${label} ${i + 1}/${RUNS}: ${ms.at(-1)} ms\n`);
  }
  return { p50: p50(ms), min: Math.min(...ms), max: Math.max(...ms) };
}

const roles = (process.env.ROLES ?? 'extractor,examiner').split(',');
const report: Record<string, unknown> = {};
if (roles.includes('extractor')) {
  report.extractor = { model: settings.models.extractor, ...(await time('extractor', () => ai.extract({ url: 'http://localhost:8787/pages/tides.html', title: 'Why the sea breathes', text, links, source: 'page' }))) };
}
if (roles.includes('examiner')) {
  const stored = { lesson: round.lesson, roundId: null, text, seed: 1, page: null, expires: Infinity };
  report.examiner = { model: settings.models.examiner, effort: settings.efforts.examiner, ...(await time('examiner', () => ai.examine(stored, round.script, []))) };
}
console.log(JSON.stringify(report, null, 2));
console.log(lines.filter((l) => l.startsWith('ai ')).slice(-4).join('\n'));
