// The stage round (SPEC §13): the tides round with four ideas already taught and the fifth empty,
// so a juror teaches the last idea live and lands the knockout. The seed is chosen so that the
// juror's idea decides it: without it Blot does not knock the monster out; with it, it does.
import { simulateBout } from '../shared/bout.ts';
import { demoExam, scriptedPlayer } from '../shared/demo.ts';
import { boutIdeas } from '../shared/round.ts';
import type { DemoRound, TranscriptEntry } from '../shared/types.ts';

export function makeStage(tides: DemoRound): DemoRound {
  const ideas = tides.lesson.ideas;
  const last = ideas[4]!.id;
  const line = (id: string, key: 'say' | 'example') => tides.lines?.[id]?.[key] ?? '';
  const pretaught: TranscriptEntry[] = ideas.slice(0, 4).flatMap((i) => [
    { ideaId: i.id, move: 'say' as const, text: line(i.id, 'say') },
    { ideaId: i.id, move: 'example' as const, text: line(i.id, 'example') || line(i.id, 'say') },
  ]);
  // Pre-taught ideas sit around 58: solid, but not enough on their own for a knockout.
  const bars = Object.fromEntries(ideas.map((i) => [i.id, i.id === last ? tides.bars[i.id]! : { ...tides.bars[i.id]!, example: Math.min(58, tides.bars[i.id]?.example ?? 58) }]));
  // The juror teaches the last idea the way the game asks: explain, check Blot's say-back, answer its why.
  const juror: TranscriptEntry[] = scriptedPlayer(tides, [last], []);
  const draft: DemoRound = { ...tides, id: 'stage', title: 'Stage round: one idea left', bars, pretaught, script: juror };
  const without = boutIdeas(ideas, demoExam(draft, pretaught, []));
  const withLast = boutIdeas(ideas, demoExam(draft, [...pretaught, ...juror], []));
  for (let seed = 1; seed < 20000; seed++) {
    const a = simulateBout(without, (seed + 7919) >>> 0);
    const b = simulateBout(withLast, (seed + 7919) >>> 0);
    if (!(a.outcome === 'win' && a.knockout) && b.outcome === 'win' && b.knockout) return { ...draft, seed };
  }
  throw new Error('No stage seed where the last idea decides the knockout.');
}
