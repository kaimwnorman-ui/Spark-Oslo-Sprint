// The teach-back round (SPEC §7): pure rules for the steps each idea goes through and the time good answers earn.
// The teaching screen follows these; nothing here touches the page.
import { SIGNATURE, SOLID, TIME_BONUS } from './config.ts';

/**
 * Where an idea is (SPEC §7). Blot leads, one thing at a time: the player explains the idea; Blot says it back and the
 * player checks it (yes, or no and then puts Blot right); Blot asks why (or for an example); then the idea is done.
 */
export type Step = 'explain' | 'check' | 'fix' | 'why' | 'done';
export const STEPS: readonly Step[] = ['explain', 'check', 'fix', 'why', 'done'];

/** The time an idea can earn, each kind at most once: Blot gets it, Blot masters it, the player catches Blot's mix-up. */
export type BonusKind = keyof typeof TIME_BONUS;
export type Earned = Partial<Record<BonusKind, true>>;

/** The level bonuses a bar's new value earns that this idea has not earned yet (SPEC §7). */
export function levelBonuses(earned: Earned, value: number): BonusKind[] {
  const out: BonusKind[] = [];
  if (value >= SOLID && !earned.ready) out.push('ready');
  if (value >= SIGNATURE && !earned.mastered) out.push('mastered');
  return out;
}

export function bonusSeconds(kinds: readonly BonusKind[]): number {
  return kinds.reduce((sum, k) => sum + TIME_BONUS[k], 0);
}

/** After Blot says the idea back: "yes" moves on to Blot's why; "no" means Blot has it wrong and the player puts it right. */
export function afterCheck(yes: boolean): Step {
  return yes ? 'why' : 'fix';
}

/**
 * What Blot asks third: why, when the idea has a reason behind it (two or more key points), else for an example.
 */
export function deepenMove(asksWhy: boolean): 'why' | 'example' {
  return asksWhy ? 'why' : 'example';
}

/** How many ideas Blot can fight with: bars at Ready or above. */
export function readyCount(values: readonly number[]): number {
  return values.filter((v) => v >= SOLID).length;
}
