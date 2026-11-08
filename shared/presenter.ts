// The presenter kit (SPEC §18): a learner who played two demo pages a few days ago, so the learning loop
// (a fading trait, Your Blot, a flashback, a returning monster, a friend's challenge) can be shown in three
// minutes without playing through it. Pure: the game saves what this returns.
import { challengeFrom, type DuelChallenge } from './duel.ts';
import { summarizeRound, type RoundSummary } from './insights.ts';
import { emptyMemory, planComeback, recordCards, type MemoryState } from './memory.ts';
import { chooseTrait, monsterInk } from './round.ts';
import type { Belief, DemoRound, ExamResult, TranscriptEntry, Trait } from './types.ts';

export interface PresenterSeed {
  memory: MemoryState;
  history: RoundSummary[];
  traits: Trait[];
  /** A friend's challenge on the lost page, for the duel tab. */
  challenge: DuelChallenge;
  /** The comeback to open (the lost page's monster). */
  comebackId: string;
}

type Scores = Record<string, { score: number; belief: Belief }>;

/** The examiner's result for a round, with every idea's answer revealed (as after a real exam). */
function examOf(round: DemoRound, scores: Scores): ExamResult {
  return {
    results: round.lesson.ideas.map((i) => {
      const s = scores[i.id] ?? { score: 0, belief: 'unknown' as Belief };
      return {
        id: i.id, score: s.score, grounded: s.score > 0, belief: s.belief, creatureAnswer: s.belief === 'wrong' ? i.misread : '', tip: '',
        modelAnswer: i.modelAnswer, question: i.question, keyPoints: i.keyPoints,
      };
    }),
  };
}

const said = (ideaId: string, ...moves: TranscriptEntry['move'][]): TranscriptEntry[] =>
  moves.map((move) => ({ ideaId, move, ...(move === 'say' || move === 'example' ? { text: 'taught in own words' } : {}) }) as TranscriptEntry);

/**
 * `lost`: a page whose monster got away (one idea taught wrongly and never caught, two taught well, two left empty),
 * so it comes back. `won`: a page that was beaten with three ideas taught well, so Blot wears a trait from it.
 */
export function presenterSeed(rounds: { lost: DemoRound; won: DemoRound; wonIdeas: readonly string[] }, now: number): PresenterSeed {
  const { lost, won } = rounds;
  const ideaRefs = (r: DemoRound) => r.lesson.ideas.map((i) => ({ id: i.id, name: i.name, sourceUrl: i.sourceUrl, sourceTitle: i.sourceTitle }));
  const monsterOf = (r: DemoRound) => ({ name: r.lesson.monsterName, color: monsterInk(r.lesson.monsterName) });
  const ids = lost.lesson.ideas.map((i) => i.id);

  // The lost fight: the first idea was misread by Blot and the player said ✓ to it; two others were taught well.
  const [misread, good1, , good2] = ids;
  const lostExam = examOf(lost, { [misread!]: { score: 88, belief: 'wrong' }, [good1!]: { score: 85, belief: 'right' }, [good2!]: { score: 85, belief: 'right' } });
  const lostTranscript = [...said(misread!, 'say', 'check'), ...said(good1!, 'say', 'example'), ...said(good2!, 'say', 'example')];
  lostTranscript[1] = { ...lostTranscript[1]!, tap: 'yes', fooled: true };

  // The won fight: three ideas taught well.
  const wonScores: Scores = Object.fromEntries(rounds.wonIdeas.map((id) => [id, { score: 92, belief: 'right' as Belief }]));
  const wonExam = examOf(won, wonScores);
  const wonTranscript = rounds.wonIdeas.flatMap((id) => said(id, 'say', 'example'));

  let memory = emptyMemory();
  const wonCards = recordCards(memory, { live: false, monster: monsterOf(won), topic: won.lesson.topic, language: won.lesson.language, ideas: ideaRefs(won), exam: wonExam }, now);
  memory = wonCards.state;
  memory = recordCards(memory, { live: false, monster: monsterOf(lost), topic: lost.lesson.topic, language: lost.lesson.language, ideas: ideaRefs(lost), exam: lostExam }, now).state;

  const comeback = planComeback(
    {
      live: false,
      monster: { ...monsterOf(lost), shape: lost.lesson.monsterShape, words: lost.lesson.words },
      topic: lost.lesson.topic, language: lost.lesson.language, demoId: lost.id, ideas: ideaRefs(lost), exam: lostExam, won: false,
    },
    now,
  )!;
  memory = { ...memory, comebacks: [comeback] };

  // Blot wears the trait the won fight earned, tied to the memory it came from so it fades with it.
  const chosen = chooseTrait(wonExam, won.lesson.ideas, monsterOf(won), now)!;
  const best = won.lesson.ideas.find((i) => i.name === chosen.ideaName)!;
  const trait: Trait = { ...chosen, cardId: wonCards.ids[best.id]! };

  const hour = 3_600_000;
  const history = [
    summarizeRound({ at: now - 2 * hour, topic: won.lesson.topic, monsterName: won.lesson.monsterName, outcome: 'win', ideas: won.lesson.ideas, transcript: wonTranscript, exam: wonExam }),
    summarizeRound({ at: now - hour, topic: lost.lesson.topic, monsterName: lost.lesson.monsterName, outcome: 'lose', ideas: lost.lesson.ideas, transcript: lostTranscript, exam: lostExam }),
  ];

  // A friend who taught the other three ideas of the lost page well.
  const friend = examOf(lost, { [ids[1]!]: { score: 80, belief: 'right' }, [ids[2]!]: { score: 75, belief: 'right' }, [ids[4]!]: { score: 82, belief: 'right' } });
  const challenge = challengeFrom({ name: 'Kai', demo: lost.id, topic: lost.lesson.topic, monsterName: lost.lesson.monsterName, exam: friend, seed: lost.seed, at: now });

  return { memory, history, traits: [trait], challenge, comebackId: comeback.id };
}
