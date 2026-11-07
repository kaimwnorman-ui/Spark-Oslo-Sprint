// The bout (SPEC §8): automatic, deterministic from (scores, beliefs, seed).
// Pure: the extension only renders the exchanges this returns.
import type { BoutExchange, BoutIdea, BoutResult } from './types.ts';
import { clamp, gaussian, rng, shuffle } from './random.ts';

/** Tuned against the target table in shared/bout.test.ts. */
export const BOUT = {
  hp: 100,
  noise: 8,
  /** Blot deals clamp(dealSlope·s + dealBase + noise, 0, dealMax). */
  dealSlope: 0.55,
  dealBase: -10,
  dealMax: 50,
  /** The monster deals clamp(takeBase − takeSlope·s + noise, 0, takeMax). */
  takeBase: 28,
  takeSlope: 0.25,
  takeMax: 40,
  backfire: 22,
  fizzle: 15,
  /** Below this score an idea counts as never taught. */
  unknownBelow: 10,
};

export type BoutConstants = typeof BOUT;

export function exchangeKind(idea: BoutIdea, k: BoutConstants = BOUT): BoutExchange['kind'] {
  if (idea.belief === 'wrong') return 'backfire';
  if (idea.belief === 'unknown' || idea.score < k.unknownBelow) return 'fizzle';
  return 'hit';
}

export function simulateBout(ideas: readonly BoutIdea[], seed: number, k: BoutConstants = BOUT): BoutResult {
  const next = rng(seed);
  let blotHp = k.hp;
  let monsterHp = k.hp;
  const exchanges: BoutExchange[] = [];

  const weakest = [...ideas].sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))[0];
  const order = shuffle(ideas, next).map((idea) => ({ idea, suddenDeath: false }));
  if (weakest) order.push({ idea: weakest, suddenDeath: true });

  for (const { idea, suddenDeath } of order) {
    if (blotHp <= 0 || monsterHp <= 0) break;
    if (suddenDeath && exchanges.length < ideas.length) break;
    // Draw both noise terms every exchange so one idea's kind never shifts the others.
    const dealNoise = gaussian(next, k.noise);
    const takeNoise = gaussian(next, k.noise);
    const kind = exchangeKind(idea, k);
    let dealt = 0;
    let taken = 0;
    if (kind === 'hit') {
      dealt = Math.round(clamp(k.dealSlope * idea.score + k.dealBase + dealNoise, 0, k.dealMax));
      taken = Math.round(clamp(k.takeBase - k.takeSlope * idea.score + takeNoise, 0, k.takeMax));
    } else {
      taken = kind === 'backfire' ? k.backfire : k.fizzle;
    }
    // Blot answers the monster's attack: its counter lands first, then the attack.
    monsterHp = Math.max(0, monsterHp - dealt);
    if (monsterHp > 0) blotHp = Math.max(0, blotHp - taken);
    else taken = 0;
    exchanges.push({ ideaId: idea.id, name: idea.name, kind, dealt, taken, blotHp, monsterHp, suddenDeath });
    // Sudden death only happens when nobody is knocked out after the five exchanges.
    if (exchanges.length === ideas.length && (blotHp <= 0 || monsterHp <= 0)) break;
  }

  const knockout = blotHp <= 0 || monsterHp <= 0;
  const outcome = blotHp > monsterHp ? 'win' : blotHp < monsterHp ? 'lose' : 'draw';
  return { exchanges, outcome, knockout, blotHp, monsterHp };
}
