// npm run measure: times real calls per role on demo/pages/tides.html (SPEC §12 "Measurement").
//   ROLES=extractor,grader,creature   which roles to measure (default: all three)
//   MODEL_GRADER=... EFFORT_GRADER=... MODEL_EXTRACTOR=... to try alternatives; RUNS=5 for the extractor.
// The grader is also checked for calibration: realistic answers, each with the score range the rubric gives it.
import { readFileSync } from 'node:fs';
import { createAnthropic } from '../server/src/anthropic.ts';
import { loadSettings } from '../server/src/settings.ts';
import { makeLiveAi } from '../server/src/ai.ts';
import type { StoredLesson } from '../server/src/lessons.ts';
import type { DemoRound, TranscriptEntry } from '../shared/types.ts';
import { ensureEnvProxy } from './lib.mjs';

await ensureEnvProxy();
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
const fresh = (): StoredLesson => ({ lesson: round.lesson, roundId: null, text, seed: 1, page: null, expires: Infinity });

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

/** What real players type (short, loose, their own words), with the score range the grader's scale gives each. */
const say = (ideaId: string, t: string): TranscriptEntry => ({ ideaId, move: 'say', text: t });
const why = (ideaId: string, t: string): TranscriptEntry => ({ ideaId, move: 'why', text: t });
const yes = (ideaId: string): TranscriptEntry => ({ ideaId, move: 'check', tap: 'yes' });
const CASES: { name: string; idea: string; entries: TranscriptEntry[]; min: number; max: number; belief?: string }[] = [
  { name: 'explained, correct', idea: 'i1', min: 40, max: 70, entries: [say('i1', 'The moon pulls the near side of the ocean more than the far side so the earth gets stretched'), yes('i1')] },
  { name: 'explained + why', idea: 'i1', min: 75, max: 100, entries: [say('i1', 'The moon pulls the near side of the ocean more than the far side so the earth gets stretched'), yes('i1'), why('i1', 'because gravity gets weaker the further away you are from the moon')] },
  { name: 'two bulges + why', idea: 'i2', min: 75, max: 100, entries: [say('i2', 'There are two bulges of water, one facing the moon and one on the other side of the earth'), yes('i2'), why('i2', 'because the earth spins through both bulges every day so every beach gets two high tides')] },
  { name: 'vague', idea: 'i2', min: 10, max: 39, entries: [say('i2', 'it is about bulges of water and the moon')] },
  { name: 'later each day + why', idea: 'i3', min: 75, max: 100, entries: [say('i3', 'High tide comes about 50 minutes later every day because the moon moves along its orbit'), yes('i3'), why('i3', 'because the earth has to spin a bit extra to catch up with the moon each day')] },
  { name: 'the misreading', idea: 'i1', min: 0, max: 20, belief: 'wrong', entries: [say('i1', 'The moon sucks the sea up like a giant straw, one big pull does it all')] },
  { name: 'wrong reason', idea: 'i4', min: 0, max: 45, entries: [say('i4', 'Spring tides are extra big tides and neap tides are small ones'), yes('i4'), why('i4', 'because in spring the sea is warmer so it rises higher')] },
  { name: 'off topic', idea: 'i5', min: 0, max: 5, belief: 'unknown', entries: [say('i5', 'I had pizza with extra cheese for dinner on Friday night')] },
  { name: "I don't know", idea: 'i5', min: 0, max: 5, belief: 'unknown', entries: [say('i5', "I don't know what this one means at all")] },
];

const roles = (process.env.ROLES ?? 'extractor,grader,creature').split(',');
const report: Record<string, unknown> = {};
if (roles.includes('extractor')) {
  report.extractor = { model: settings.models.extractor, ...(await time('extractor', () => ai.extract({ url: 'http://localhost:8787/pages/tides.html', title: 'Why the sea breathes', text, links, source: 'page' }))) };
}
if (roles.includes('grader')) {
  const rows: string[] = [];
  const ms: number[] = [];
  let inRange = 0;
  for (const c of CASES) {
    const t = Date.now();
    // A fresh round each time: no cached grade, so every call is a real one.
    const g = await ai.grade(fresh(), c.idea, c.entries);
    ms.push(Date.now() - t);
    const ok = g.score >= c.min && g.score <= c.max && (!c.belief || g.belief === c.belief);
    if (ok) inRange++;
    rows.push(`${ok ? 'ok  ' : 'MISS'} ${c.name.padEnd(22)} ${String(g.score).padStart(3)} (want ${c.min}–${c.max}${c.belief ? `, ${c.belief}` : ''}) ${g.belief.padEnd(8)} ${String(ms.at(-1)).padStart(5)} ms  “${g.creatureAnswer.slice(0, 70)}” tip: ${g.tip.slice(0, 60)}`);
  }
  console.log(rows.join('\n'));
  report.grader = { model: settings.models.grader, effort: settings.efforts.grader, inRange: `${inRange}/${CASES.length}`, p50: p50(ms), max: Math.max(...ms) };
}
if (roles.includes('creature')) {
  const firsts: number[] = [];
  const stored = fresh();
  for (const event of ['check', 'askWhy', 'why'] as const) {
    const t = Date.now();
    let first = 0;
    let out = '';
    for await (const chunk of ai.creature(stored, { ideaId: 'i2', event, belief: 'right', transcript: [say('i2', 'There are two bulges of water, one facing the moon and one on the other side'), why('i2', 'because the earth spins through both bulges every day')] })) {
      if (!first) first = Date.now() - t;
      out += chunk;
    }
    firsts.push(first);
    console.log(`creature ${event}: first token ${first} ms, total ${Date.now() - t} ms: ${out}`);
  }
  report.creature = { model: settings.models.creature, firstTokenP50: p50(firsts) };
}
console.log(JSON.stringify(report, null, 2));
console.log(lines.filter((l) => l.startsWith('ai ')).slice(-3).join('\n'));
