// Live AI roles (SPEC §12), following the claude-api skill: structured outputs through
// output_config.format, explicit effort, no prefill, no sampling parameters, server-side
// fallbacks where the model supports them, and stop_reason checked before reading content.
import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { MONSTER_WORDS, type Role } from '../../shared/config.ts';
import type { CreatureRequest } from '../../shared/demo.ts';
import { barValue, effectiveMove, isPasted, sourceWindows } from '../../shared/bars.ts';
import { checkLesson } from '../../shared/lesson.ts';
import { hashString, rng, shuffle } from '../../shared/random.ts';
import { BELIEFS, type Belief, type ExamItem, type ExamResult, type Idea, type IdeaGrade, type Lesson, type Move, type PageCapture, type TranscriptEntry, type WhenOption } from '../../shared/types.ts';
import { distinctiveWords } from '../../shared/words.ts';
import { tidy } from '../../shared/text.ts';
import { HttpError } from './http.ts';
import type { StoredLesson } from './lessons.ts';
import {
  CREATURE_SYSTEM, EXTRACTOR_SCHEMA, EXTRACTOR_SYSTEM, GRADER_SCHEMA, GRADER_SYSTEM, IDEA_IDS, RECALL_SCHEMA, RECALL_SYSTEM,
  creatureTask, dataBlock, extractorMessage, graderMessage, recallMessage,
  type ExtractorOutput, type GraderOutput, type RecallInput, type RecallOutput,
} from './prompts.ts';
import type { Settings } from './settings.ts';

export interface LiveAi {
  extract(capture: Pick<PageCapture, 'url' | 'title' | 'text' | 'links' | 'source'>): Promise<Lesson>;
  creature(stored: StoredLesson, req: CreatureRequest): AsyncIterable<string>;
  /** One idea's grade from everything the player did on it: the live bar (SPEC §12.2). Cached per answer. */
  grade(stored: StoredLesson, ideaId: string, transcript: TranscriptEntry[]): Promise<IdeaGrade>;
  /** The exam: every idea's grade (the same, cached grades the bars showed), with the answers revealed. */
  examine(stored: StoredLesson, transcript: TranscriptEntry[], heldMisreads: string[]): Promise<ExamResult>;
  /** Grades a flashback answer against the idea's revealed answer (SPEC §17). */
  recall(input: RecallInput): Promise<RecallOutput>;
}

type Effort = 'low' | 'medium' | 'high';

/** Models with server-side refusal fallbacks (the skill: opt in by default). Haiku has none. */
export function supportsFallbacks(model: string): boolean {
  return /^claude-(opus-5|fable-5|sonnet-5-5)/.test(model);
}

/**
 * The lowest thinking setting each model accepts, for the short, latency-sensitive calls (the claude-api skill):
 * Claude Haiku 5.5 takes `disabled` and Claude Sonnet 5.5 `between_tools` (each at effort high or below, which
 * Spark's roles never exceed); Claude Opus 5.5 always thinks, so it gets nothing and runs at its effort.
 */
export function lowestThinking(model: string): Anthropic.Beta.BetaThinkingConfigParam | undefined {
  if (/^claude-haiku-5/.test(model)) return { type: 'disabled' };
  if (/^claude-sonnet-5-5/.test(model)) return { type: 'between_tools' };
  return undefined;
}

class Truncated extends Error {}

/** A denial in the player's words (English and Norwegian). */
const NEGATION = /\b(not|no|never|nothing|none|nor|cannot|ikke|nei|aldri|ingen|ingenting)\b|n['’]t\b/i;

const UNKNOWN_LINE: Record<string, string> = { en: "I... don't know this one!", nb: 'Jeg... kan ikke denne!', nn: 'Eg... kan ikkje denne!' };
const unknownLine = (language: string) => UNKNOWN_LINE[language] ?? UNKNOWN_LINE.en!;

export function makeLiveAi(client: Anthropic, settings: Settings, log: (line: string) => void = console.log): LiveAi {
  const effortFor = (role: Role): Effort => settings.efforts[role];

  /** One structured-output call. Returns the parsed JSON. */
  async function jsonCall<T>(
    role: Role,
    system: string,
    content: Anthropic.Beta.BetaContentBlockParam[],
    schema: object,
    maxTokens: number,
    opts: { fast?: boolean } = {},
  ): Promise<T> {
    const model = settings.models[role];
    const started = Date.now();
    const thinking = opts.fast ? lowestThinking(model) : undefined;
    const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: maxTokens,
      // The system prompt is the same on every call of a role: cached when long enough for the model.
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
      output_config: { effort: effortFor(role), format: { type: 'json_schema', schema: schema as Record<string, unknown> } },
      ...(thinking ? { thinking } : {}),
    };
    const msg = supportsFallbacks(model)
      ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.beta.messages.create(params);
    const u = msg.usage;
    log(`ai ${role} ${msg.model} ${Date.now() - started}ms in=${u.input_tokens} out=${u.output_tokens} cache_read=${u.cache_read_input_tokens ?? 0} stop=${msg.stop_reason}`);
    if (msg.stop_reason === 'refusal') throw new HttpError(502, 'Spark’s AI would not work on this page. Try another one.');
    if (msg.stop_reason === 'max_tokens') throw new Truncated(`${role} hit max_tokens`);
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    return JSON.parse(text) as T;
  }

  /** Retries once on truncation or a malformed answer (with more room the second time). */
  async function withRetry<T>(fn: (maxTokens: number) => Promise<T>, first = 4000): Promise<T> {
    try {
      return await fn(first);
    } catch (err) {
      if (err instanceof HttpError || err instanceof Anthropic.APIError) throw err;
      return fn(first * 2);
    }
  }

  /**
   * One idea's grade. The grade depends only on what the player did on that idea, so it is cached by those entries:
   * the exam then reuses exactly the grades the bars showed, and a call already in flight is shared, never repeated.
   */
  function gradeIdea(stored: StoredLesson, idea: Idea, mine: TranscriptEntry[]): Promise<IdeaGrade> {
    const language = stored.lesson.language;
    if (!mine.some((e) => e.text?.trim())) return Promise.resolve(emptyGrade(idea.id, language));
    const key = createHash('sha256').update(JSON.stringify(mine.map((e) => [e.move, e.text ?? '', e.tap ?? '']))).digest('hex');
    const grades = (stored.grades ??= new Map());
    const hit = grades.get(idea.id);
    if (hit && hit.key === key) return hit.grade;
    const grade = withRetry(
      (maxTokens) => jsonCall<GraderOutput>('grader', GRADER_SYSTEM, [{ type: 'text', text: graderMessage(idea, language, mine) }], GRADER_SCHEMA, maxTokens, { fast: true }),
      1500,
    ).then((out) => toGrade(idea.id, out, mine, language));
    grades.set(idea.id, { key, grade });
    // A failed call is not remembered: the next one tries again.
    grade.catch(() => {
      if (grades.get(idea.id)?.grade === grade) grades.delete(idea.id);
    });
    return grade;
  }

  return {
    async extract(capture) {
      return withRetry(async (maxTokens) => {
        const out = await jsonCall<ExtractorOutput>(
          'extractor',
          EXTRACTOR_SYSTEM,
          [{ type: 'text', text: extractorMessage(capture.title, capture.text, capture.links, capture.source === 'selection' ? 'selection' : 'page') }],
          EXTRACTOR_SCHEMA,
          maxTokens,
        );
        return toLesson(out, capture);
      });
    },

    async *creature(stored, req) {
      const lesson = stored.lesson;
      const idea = lesson.ideas.find((i) => i.id === req.ideaId)!;
      const model = settings.models.creature;
      const mine = req.transcript.filter((e) => e.ideaId === idea.id && e.text);
      const task = creatureTask(req.event, { ideaName: idea.name, question: idea.question, misread: idea.misread, belief: req.belief });
      const started = Date.now();
      let first = 0;
      const thinking = lowestThinking(model);
      // Stable first (system, then the page, cached across Blot's replies); volatile last.
      const stream = client.messages.stream({
        model,
        max_tokens: 300,
        ...(thinking ? { thinking: thinking as Anthropic.ThinkingConfigParam } : {}),
        output_config: { effort: effortFor('creature') },
        system: [{ type: 'text', text: CREATURE_SYSTEM }],
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: `The page (language: ${lesson.language}):\n${dataBlock('page_text', stored.text)}`, cache_control: { type: 'ephemeral' } },
              {
                type: 'text',
                text: `What your coach has told you about "${idea.name}" so far:\n${mine.length ? mine.map((e) => dataBlock('player_message', e.text!, `move="${e.move}"`)).join('\n') : '(nothing yet)'}\n\n${task}`,
              },
            ],
          },
        ],
      });
      let sent = '';
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          if (!first) first = Date.now() - started;
          sent += event.delta.text;
          yield event.delta.text;
          // Blot never says more than 60 words (SPEC §12): stop the stream there.
          if (sent.split(/\s+/).filter(Boolean).length >= 60) {
            stream.abort();
            break;
          }
        }
      }
      const msg = await stream.finalMessage().catch(() => null);
      if (!msg) return;
      const u = msg.usage;
      log(`ai creature ${msg.model} ${Date.now() - started}ms first=${first}ms in=${u.input_tokens} out=${u.output_tokens} cache_read=${u.cache_read_input_tokens ?? 0} stop=${msg.stop_reason}`);
      if (msg.stop_reason === 'refusal' && !sent) yield lesson.language === 'en' ? 'Hmm, my ink went blank. Say that another way?' : 'Hm, blekket mitt ble blankt. Si det på en annen måte?';
    },

    async grade(stored, ideaId, transcript) {
      const idea = stored.lesson.ideas.find((i) => i.id === ideaId);
      if (!idea) throw new HttpError(400, 'Unknown idea.');
      return gradeIdea(stored, idea, gradedEntries(recountPastes(transcript, stored.text), ideaId));
    },

    async examine(stored, transcript, heldMisreads) {
      const lesson = stored.lesson;
      const fixed = recountPastes(transcript, stored.text);
      const grades = await Promise.all(
        lesson.ideas.map((idea) => {
          const mine = gradedEntries(fixed, idea.id);
          return mine.length ? gradeIdea(stored, idea, mine) : Promise.resolve(null);
        }),
      );
      return { results: lesson.ideas.map((idea, n) => examItem(idea, fixed, grades[n] ?? null, heldMisreads, lesson.language)) };
    },

    async recall(input) {
      // Too short to be an answer: no call.
      if (input.answer.trim().split(/\s+/).filter(Boolean).length < 3) return { score: 0, feedback: '' };
      const out = await jsonCall<RecallOutput>('recall', RECALL_SYSTEM, [{ type: 'text', text: recallMessage(input) }], RECALL_SCHEMA, 600, { fast: true });
      return { score: Math.round(Math.min(100, Math.max(0, out.score))), feedback: (out.feedback ?? '').trim().slice(0, 240) };
    },
  };
}

function emptyGrade(id: string, language: string): IdeaGrade {
  return { id, score: 0, belief: 'unknown', grounded: false, contradictsMisread: false, creatureAnswer: unknownLine(language), tip: '' };
}

/** The grader's answer as a grade, with the grounding rules held in code: no grounding is 0, a wrong idea scores at most 20. */
export function toGrade(id: string, out: GraderOutput, mine: readonly TranscriptEntry[], language: string): IdeaGrade {
  let belief: Belief = BELIEFS.includes(out.belief) ? out.belief : 'unknown';
  let score = out.grounded ? Math.round(Math.min(100, Math.max(0, Number(out.score) || 0))) : 0;
  if (belief === 'wrong') score = Math.min(score, 20);
  else if (score < 10) belief = 'unknown';
  else if (belief === 'unknown') belief = score >= 60 ? 'right' : 'partial';
  // "Contradicts the misreading" needs an actual denial in the player's latest words.
  const latest = mine.filter((e) => e.text).at(-1)?.text ?? '';
  return {
    id,
    score,
    belief,
    grounded: score > 0,
    contradictsMisread: !!out.contradictsMisread && NEGATION.test(latest),
    creatureAnswer: tidy(out.creatureAnswer, 320) || unknownLine(language),
    tip: tidy(out.tip, 240),
  };
}

/** The extractor's answer as a lesson: shuffled situations, links by number, the page's own words. */
export function toLesson(out: ExtractorOutput, capture: Pick<PageCapture, 'text' | 'links'>): Lesson {
  const nb = out.language === 'nb' || out.language === 'nn';
  const ideas = IDEA_IDS.map((id) => {
    const x = repairIdea(tidyIdea(out.ideas[id]), nb);
    const options: WhenOption[] = shuffle(
      [
        { text: x.whenRight, right: true },
        { text: x.whenWrong1, right: false },
        { text: x.whenWrong2, right: false },
      ],
      rng(hashString(x.name)),
    );
    const link = typeof x.sourceLink === 'number' ? capture.links[x.sourceLink - 1] : undefined;
    return {
      id,
      name: x.name,
      question: x.question,
      modelAnswer: x.modelAnswer,
      keyPoints: x.keyPoints.filter(Boolean).slice(0, 4),
      whenOptions: options,
      misread: x.misread,
      sourceUrl: link?.href ?? null,
      sourceTitle: link ? tidy(link.text, 160) : null,
    };
  });
  return checkLesson({
    topic: tidy(out.topic, 100),
    monsterName: tidy(out.monsterName, 60),
    monsterShape: out.monsterShape,
    language: out.language,
    ideas,
    words: distinctiveWords(capture.text, MONSTER_WORDS),
  });
}

/** What the extractor wrote is page-derived data: one short line each, no tags, no hidden characters. */
function tidyIdea(x: ExtractorOutput['ideas'][(typeof IDEA_IDS)[number]]): ExtractorOutput['ideas'][(typeof IDEA_IDS)[number]] {
  return {
    ...x,
    name: tidy(x.name, 60),
    question: tidy(x.question, 200),
    modelAnswer: tidy(x.modelAnswer, 420),
    keyPoints: (Array.isArray(x.keyPoints) ? x.keyPoints : []).map((k) => tidy(k, 120)).filter(Boolean),
    whenRight: tidy(x.whenRight, 120),
    whenWrong1: tidy(x.whenWrong1, 120),
    whenWrong2: tidy(x.whenWrong2, 120),
    misread: tidy(x.misread, 200),
  };
}

/** A rare empty field from the model gets a safe, in-character stand-in instead of failing the page. */
function repairIdea(x: ExtractorOutput['ideas'][(typeof IDEA_IDS)[number]], nb: boolean): ExtractorOutput['ideas'][(typeof IDEA_IDS)[number]] {
  const name = x.name?.trim() || (nb ? 'En idé' : 'An idea');
  const sentences = (x.modelAnswer ?? '').split(/(?<=[.!?])\s+/).filter(Boolean);
  return {
    ...x,
    name,
    question: x.question?.trim() || (nb ? `Hvorfor er «${name}» viktig?` : `Why does "${name}" matter?`),
    modelAnswer: x.modelAnswer?.trim() || name,
    keyPoints: x.keyPoints?.filter((k) => k.trim()).length ? x.keyPoints : sentences.slice(0, 3),
    whenRight: x.whenRight?.trim() || (nb ? `Når du vil forklare ${name}` : `When you want to explain ${name}`),
    whenWrong1: x.whenWrong1?.trim() || (nb ? 'Når du lager middag' : 'When you are cooking dinner'),
    whenWrong2: x.whenWrong2?.trim() || (nb ? 'Når du velger sokker' : 'When you are choosing socks'),
    misread: x.misread?.trim() || (nb ? `Jeg tror «${name}» bare skjer av magi!` : `I think "${name}" just happens by magic!`),
  };
}

/**
 * What a grade is made from: the player's own words on one idea, and the situations they tapped. A ✓ or ✗ on
 * Blot's say-back explains nothing, so it never changes the grade (or costs a new one); the move caps count it.
 */
export function gradedEntries(transcript: readonly TranscriptEntry[], ideaId: string): TranscriptEntry[] {
  return transcript.filter((e) => e.ideaId === ideaId && e.move !== 'same' && e.move !== 'dontknow' && (!!e.text?.trim() || (e.move === 'when' && typeof e.tap === 'number')));
}

/** The server re-checks pastes against the page: a pasted message counts as a bare explanation. */
function recountPastes(transcript: TranscriptEntry[], pageText: string): TranscriptEntry[] {
  const windows = sourceWindows(pageText);
  return transcript.map((e) => (e.text && e.move !== 'same' && e.move !== 'dontknow' ? { ...e, move: effectiveMove(e.move, isPasted(e.text, windows)) } : e));
}

/** One idea in the exam: the grade the bar showed, with the move caps, the held misreading and the revealed answer. */
function examItem(idea: Idea, transcript: TranscriptEntry[], grade: IdeaGrade | null, heldMisreads: string[], language: Lesson['language']): ExamItem {
  const mine = transcript.filter((e) => e.ideaId === idea.id);
  const moves = mine.map((e) => e.move).filter((m): m is Move => m !== 'same' && m !== 'dontknow');
  const score = barValue(moves, grade?.score ?? 0);
  let belief: Belief = grade?.belief ?? 'unknown';
  let creatureAnswer = grade?.creatureAnswer || unknownLine(language);
  if (score < 10 && belief !== 'wrong') belief = 'unknown';
  else if (belief === 'unknown') belief = score >= 60 ? 'right' : 'partial';
  if (!mine.length) creatureAnswer = unknownLine(language);
  if (heldMisreads.includes(idea.id)) {
    belief = 'wrong';
    creatureAnswer = idea.misread;
  }
  // After teaching, the idea's answer is revealed: the replay's "stronger" column, flashbacks and comebacks.
  return {
    id: idea.id, score, grounded: score > 0, belief, creatureAnswer, tip: grade?.tip ?? '',
    modelAnswer: idea.modelAnswer, question: idea.question, keyPoints: idea.keyPoints,
  };
}
