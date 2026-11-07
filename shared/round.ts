// Round rules that both the demo engine and the live game use. Pure and tested.
import { MISREAD_COUNT } from './config.ts';
import type { Belief, BoutIdea, ExamItem, ExamResult, Idea, Trait, TraitKind, TraitLook } from './types.ts';
import { hashString, rng, shuffle } from './random.ts';
import { contentWords, stem } from './words.ts';

/**
 * Rule 3: exactly two ideas (deterministic from the seed) where Blot quietly misreads.
 * A player who tends to accept Blot's wrong explanations gets three (the coach's "trust" focus).
 */
export function misreadIdeaIds(ids: readonly string[], seed: number, count: number = MISREAD_COUNT): string[] {
  return shuffle(ids, rng(seed ^ 0x9e3779b9)).slice(0, Math.min(count, ids.length));
}

/** What Blot believes about one idea while teaching. */
export type TeachBelief = 'none' | 'right' | 'misread';

/** The belief the bout uses: a held misread is always wrong; otherwise it follows the score. */
export function finalBelief(teach: TeachBelief, score: number): Belief {
  if (teach === 'misread') return 'wrong';
  if (score < 10) return 'unknown';
  return score >= 60 ? 'right' : 'partial';
}

export function boutIdeas(names: readonly { id: string; name: string }[], exam: ExamResult): BoutIdea[] {
  return names.map(({ id, name }) => {
    const r = exam.results.find((x) => x.id === id);
    return { id, name, score: r?.score ?? 0, belief: r?.belief ?? 'unknown' };
  });
}

/**
 * Demo mode only (no AI): a typed message scores its canned value when it talks about
 * the idea, less when it barely does, and almost nothing when it is off topic.
 */
export function offlineScore(idea: Idea, text: string, canned: number): number {
  const ideaStems = new Set(contentWords([idea.name, idea.modelAnswer, ...idea.keyPoints].join(' ')).map(stem));
  const hits = new Set(contentWords(text).map(stem).filter((s) => ideaStems.has(s))).size;
  if (hits === 0) return 5;
  if (hits === 1) return Math.round(canned * 0.6);
  return canned;
}

export interface CannedExam {
  right: string;
  partial: string;
  unknown: string;
  tip: string;
}

/** Demo mode only: the examiner's result from the bar values and Blot's beliefs. */
export function offlineExam(
  ideas: readonly Idea[],
  values: Readonly<Record<string, number>>,
  beliefs: Readonly<Record<string, TeachBelief>>,
  canned: Readonly<Record<string, CannedExam>>,
): ExamResult {
  return {
    results: ideas.map((idea): ExamItem => {
      const score = Math.round(values[idea.id] ?? 0);
      const belief = finalBelief(beliefs[idea.id] ?? 'none', score);
      const c = canned[idea.id];
      const creatureAnswer =
        belief === 'wrong' ? idea.misread : belief === 'unknown' ? (c?.unknown ?? '') : belief === 'right' ? (c?.right ?? '') : (c?.partial ?? '');
      return { id: idea.id, score, grounded: score >= 10, belief, creatureAnswer, tip: c?.tip ?? '' };
    }),
  };
}

// ---- After the bout ----

export const TRAIT_KINDS: readonly TraitKind[] = ['horn', 'fin', 'tail', 'spikes'];

export function traitLook(score: number): TraitLook {
  if (score >= 85) return 'shining';
  return score >= 60 ? 'solid' : 'wobbly';
}

/** The idea's key word: its longest content word, as written in the name. */
export function keyWord(name: string): string {
  const words = name.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [name];
  const content = words.filter((w) => contentWords(w).length > 0);
  return [...(content.length ? content : words)].sort((a, b) => b.length - a.length)[0] ?? name;
}

/** The trait comes from the highest-scoring idea (SPEC §9). */
export function chooseTrait(
  exam: ExamResult,
  names: readonly { id: string; name: string }[],
  monster: { name: string; color: string },
  at: number,
): Trait | null {
  const best = [...exam.results].sort((a, b) => b.score - a.score)[0];
  const idea = best && names.find((n) => n.id === best.id);
  if (!best || !idea) return null;
  return {
    kind: TRAIT_KINDS[hashString(`${monster.name}:${idea.id}`) % TRAIT_KINDS.length]!,
    look: traitLook(best.score),
    word: keyWord(idea.name),
    color: monster.color,
    monsterName: monster.name,
    ideaName: idea.name,
    score: best.score,
    at,
  };
}

export function weakestIdeaId(exam: ExamResult): string | null {
  return [...exam.results].sort((a, b) => a.score - b.score)[0]?.id ?? null;
}

/** Each monster gets one ink colour, picked from its name. */
export const MONSTER_INKS = ['#6a3df0', '#0b7a8a', '#c0306a', '#2f7d32', '#d2511f', '#3550c8'] as const;
export function monsterInk(name: string): string {
  return MONSTER_INKS[hashString(name) % MONSTER_INKS.length]!;
}
