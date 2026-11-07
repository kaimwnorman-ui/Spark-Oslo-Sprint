// Blot vs Blot (SPEC §17): an async duel by link. A friend's Blot (their exam, frozen in the link)
// fights yours on the same page's five ideas. Pure and deterministic, like the bout.
import { BOUT, exchangeKind } from './bout.ts';
import { BELIEFS, type Belief, type BoutIdea, type BoutOutcome, type ExamResult } from './types.ts';
import { clamp, gaussian, rng, shuffle } from './random.ts';

export const DUEL = {
  hp: 100,
  noise: 6,
  /** A hit deals clamp(dealSlope·s + dealBase + noise, 0, dealMax) to the other Blot. */
  dealSlope: 0.5,
  dealBase: -8,
  dealMax: 45,
  /** A misreading backfires on the Blot that holds it. */
  backfire: 18,
  /** Below this score an idea counts as never taught. */
  unknownBelow: 10,
};

export interface DuelMove {
  kind: 'hit' | 'backfire' | 'fizzle';
  /** Damage dealt to the other Blot. */
  dealt: number;
  /** Damage this Blot did to itself (a backfire). */
  self: number;
}

export interface DuelExchange {
  ideaId: string;
  name: string;
  challenger: DuelMove;
  player: DuelMove;
  challengerHp: number;
  playerHp: number;
}

export interface DuelResult {
  exchanges: DuelExchange[];
  /** From the player's side: 'win' means your Blot beat your friend's. */
  outcome: BoutOutcome;
  knockout: boolean;
  challengerHp: number;
  playerHp: number;
}

function move(idea: BoutIdea | undefined, noise: number): DuelMove {
  const kind = idea ? exchangeKind(idea, { ...BOUT, unknownBelow: DUEL.unknownBelow }) : 'fizzle';
  if (kind === 'backfire') return { kind, dealt: 0, self: DUEL.backfire };
  if (kind === 'fizzle') return { kind, dealt: 0, self: 0 };
  return { kind, dealt: Math.round(clamp(DUEL.dealSlope * idea!.score + DUEL.dealBase + noise, 0, DUEL.dealMax)), self: 0 };
}

/** Both Blots use each idea in turn (both moves land together); first to 0 HP loses. */
export function simulateDuel(challenger: readonly BoutIdea[], player: readonly BoutIdea[], seed: number): DuelResult {
  const next = rng(seed);
  let challengerHp = DUEL.hp;
  let playerHp = DUEL.hp;
  const exchanges: DuelExchange[] = [];
  const order = shuffle(player.length ? player : challenger, next);
  for (const idea of order) {
    if (challengerHp <= 0 || playerHp <= 0) break;
    // Both noise terms are always drawn, so one side's move never shifts the other's.
    const cNoise = gaussian(next, DUEL.noise);
    const pNoise = gaussian(next, DUEL.noise);
    const c = move(challenger.find((i) => i.id === idea.id), cNoise);
    const p = move(player.find((i) => i.id === idea.id), pNoise);
    challengerHp = Math.max(0, challengerHp - p.dealt - c.self);
    playerHp = Math.max(0, playerHp - c.dealt - p.self);
    exchanges.push({ ideaId: idea.id, name: idea.name, challenger: c, player: p, challengerHp, playerHp });
  }
  return {
    exchanges,
    outcome: playerHp > challengerHp ? 'win' : playerHp < challengerHp ? 'lose' : 'draw',
    knockout: playerHp <= 0 || challengerHp <= 0,
    challengerHp,
    playerHp,
  };
}

// ---------------------------------------------------------------- the challenge in a link

export interface DuelIdea {
  id: string;
  score: number;
  belief: Belief;
}

/** Everything a friend needs to fight your Blot. */
export interface DuelChallenge {
  v: 1;
  /** A demo page (the duel runs offline), or null for a real page stored on the server. */
  demo: string | null;
  name: string;
  topic: string;
  monsterName: string;
  ideas: DuelIdea[];
  seed: number;
  at: number;
}

/** A display name: plain text, one line, at most 24 characters. */
export function cleanName(raw: unknown): string {
  const text = typeof raw === 'string' ? raw : '';
  const clean = text.replace(/[\p{C}<>]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 24).trim();
  return clean || 'A friend';
}

export function challengeFrom(opts: { name: string; demo: string | null; topic: string; monsterName: string; exam: ExamResult; seed: number; at: number }): DuelChallenge {
  return {
    v: 1,
    demo: opts.demo,
    name: cleanName(opts.name),
    topic: opts.topic.slice(0, 120),
    monsterName: opts.monsterName.slice(0, 80),
    ideas: opts.exam.results.map((r) => ({ id: r.id, score: Math.round(clamp(r.score, 0, 100)), belief: r.belief })),
    seed: opts.seed >>> 0,
    at: opts.at,
  };
}

/** The challenger's side of the duel, named from the lesson. */
export function challengerIdeas(challenge: DuelChallenge, names: readonly { id: string; name: string }[]): BoutIdea[] {
  return names.map(({ id, name }) => {
    const x = challenge.ideas.find((i) => i.id === id);
    return { id, name, score: x?.score ?? 0, belief: x?.belief ?? 'unknown' };
  });
}

/** Checks anything that claims to be a challenge (from a link or the server). */
export function readChallenge(x: unknown): DuelChallenge | null {
  if (!x || typeof x !== 'object') return null;
  const c = x as Record<string, unknown>;
  if (c.v !== 1 || !Array.isArray(c.ideas) || c.ideas.length < 1 || c.ideas.length > 5) return null;
  const demo = typeof c.demo === 'string' && /^[a-z0-9-]{1,24}$/.test(c.demo) ? c.demo : null;
  if (c.demo !== null && !demo) return null;
  const ideas: DuelIdea[] = [];
  for (const raw of c.ideas as unknown[]) {
    const i = raw as Record<string, unknown>;
    if (!i || typeof i.id !== 'string' || !/^[a-z0-9]{1,8}$/.test(i.id)) return null;
    if (typeof i.score !== 'number' || !Number.isFinite(i.score)) return null;
    const belief = BELIEFS.includes(i.belief as Belief) ? (i.belief as Belief) : 'unknown';
    ideas.push({ id: i.id, score: Math.round(clamp(i.score, 0, 100)), belief });
  }
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\p{C}<>]/gu, ' ').trim().slice(0, max) : '');
  return {
    v: 1,
    demo,
    name: cleanName(c.name),
    topic: text(c.topic, 120),
    monsterName: text(c.monsterName, 80),
    ideas,
    seed: typeof c.seed === 'number' && Number.isFinite(c.seed) ? c.seed >>> 0 : 1,
    at: typeof c.at === 'number' && Number.isFinite(c.at) ? c.at : 0,
  };
}

// Links: a demo-page duel lives entirely in the link ("L" + base64url JSON); a real page's duel
// is a short server code (8 lowercase letters and digits).

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(token: string): string {
  const bin = atob(token.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

export function encodeLocalDuel(challenge: DuelChallenge): string {
  return `L${toBase64Url(JSON.stringify(challenge))}`;
}

export function isLocalDuel(token: string): boolean {
  return token.startsWith('L') && token.length > 12;
}

export function isServerDuelCode(token: string): boolean {
  return /^[a-z0-9]{8}$/.test(token);
}

export function decodeLocalDuel(token: string): DuelChallenge | null {
  if (!isLocalDuel(token) || token.length > 2000) return null;
  try {
    return readChallenge(JSON.parse(fromBase64Url(token.slice(1))));
  } catch {
    return null;
  }
}
