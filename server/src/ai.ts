// Live AI roles (SPEC §12), following the claude-api skill: structured outputs through
// output_config.format, explicit effort, no prefill, no sampling parameters, server-side
// fallbacks where the model supports them, and stop_reason checked before reading content.
import Anthropic from '@anthropic-ai/sdk';
import { MONSTER_WORDS, type Role } from '../../shared/config.ts';
import type { CreatureRequest } from '../../shared/demo.ts';
import { barValue, effectiveMove, isPasted, sourceWindows } from '../../shared/bars.ts';
import { checkLesson } from '../../shared/lesson.ts';
import { hashString, rng, shuffle } from '../../shared/random.ts';
import type { BarValue, ExamItem, ExamResult, Lesson, Move, PageCapture, TranscriptEntry, WhenOption } from '../../shared/types.ts';
import { distinctiveWords } from '../../shared/words.ts';
import { HttpError } from './http.ts';
import type { StoredLesson } from './lessons.ts';
import {
  BARS_SCHEMA, BARS_SYSTEM, CREATURE_SYSTEM, EXAMINER_SCHEMA, EXAMINER_SYSTEM, EXTRACTOR_SCHEMA, EXTRACTOR_SYSTEM, IDEA_IDS,
  creatureTask, dataBlock, extractorMessage, lessonBlock, transcriptBlock,
  type BarsOutput, type ExaminerOutput, type ExtractorOutput,
} from './prompts.ts';
import type { Settings } from './settings.ts';

export interface LiveAi {
  extract(capture: Pick<PageCapture, 'url' | 'title' | 'text' | 'links' | 'source'>): Promise<Lesson>;
  creature(stored: StoredLesson, req: CreatureRequest): AsyncIterable<string>;
  bars(stored: StoredLesson, ideaId: string, transcript: TranscriptEntry[]): Promise<{ bars: BarValue[]; whenRight?: boolean }>;
  examine(stored: StoredLesson, transcript: TranscriptEntry[], heldMisreads: string[]): Promise<ExamResult>;
}

type Effort = 'low' | 'medium' | 'high';

/** Models with server-side refusal fallbacks (the skill: opt in by default). Haiku has none. */
export function supportsFallbacks(model: string): boolean {
  return /^claude-(opus-5|fable-5|sonnet-5-5)/.test(model);
}

class Truncated extends Error {}

/** A denial in the player's words (English and Norwegian). */
const NEGATION = /\b(not|no|never|nothing|none|nor|cannot|ikke|nei|aldri|ingen|ingenting)\b|n['’]t\b/i;

export function makeLiveAi(client: Anthropic, settings: Settings, log: (line: string) => void = console.log): LiveAi {
  const effortFor = (role: Role): Effort => settings.efforts[role];

  /** One structured-output call. Returns the parsed JSON. */
  async function jsonCall<T>(
    role: Role,
    system: string,
    content: Anthropic.Beta.BetaContentBlockParam[],
    schema: object,
    maxTokens: number,
    opts: { thinking?: boolean } = {},
  ): Promise<T> {
    const model = settings.models[role];
    const started = Date.now();
    const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: maxTokens,
      system: [{ type: 'text', text: system }],
      messages: [{ role: 'user', content }],
      output_config: { effort: effortFor(role), format: { type: 'json_schema', schema: schema as Record<string, unknown> } },
      // Live bars run with thinking off for speed (allowed on Haiku 5.5 at effort high or lower).
      ...(opts.thinking === false ? { thinking: { type: 'disabled' as const } } : {}),
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
  async function withRetry<T>(fn: (maxTokens: number) => Promise<T>): Promise<T> {
    try {
      return await fn(4000);
    } catch (err) {
      if (err instanceof HttpError || err instanceof Anthropic.APIError) throw err;
      return fn(8000);
    }
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
      const lastTap = typeof req.tap === 'number' ? idea.whenOptions[req.tap] : undefined;
      const task = creatureTask(req.event, {
        ideaName: idea.name,
        question: idea.question,
        misread: idea.misread,
        belief: req.belief,
        whenRight: lastTap?.right,
        whenText: lastTap?.text,
      });
      const started = Date.now();
      let first = 0;
      // Stable first (system, then the page, cached across Blot's replies); volatile last.
      const stream = client.messages.stream({
        model,
        max_tokens: 300,
        thinking: { type: 'disabled' },
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

    async bars(stored, ideaId, transcript) {
      const lesson = stored.lesson;
      const fixed = recountPastes(transcript, stored.text);
      const last = fixed.filter((e) => e.ideaId === ideaId).at(-1);
      const idea = lesson.ideas.find((i) => i.id === ideaId);
      const whenRight = last?.move === 'when' && typeof last.tap === 'number' ? !!idea?.whenOptions[last.tap]?.right : undefined;
      const taught = new Set(fixed.map((e) => e.ideaId));
      if (!taught.size) return { bars: lesson.ideas.map((i) => ({ id: i.id, value: 0, contradictsMisread: false })), whenRight };
      const out = await jsonCall<BarsOutput>(
        'bars',
        BARS_SYSTEM,
        [
          { type: 'text', text: lessonBlock(lesson), cache_control: { type: 'ephemeral' } },
          { type: 'text', text: `The player's messages and taps so far (the latest is about idea ${ideaId}):\n\n${transcriptBlock(lesson, fixed)}` },
        ],
        BARS_SCHEMA,
        1500,
        { thinking: false },
      );
      return {
        bars: lesson.ideas.map((i) => {
          const b = out.bars[i.id as (typeof IDEA_IDS)[number]];
          const value = taught.has(i.id) && b ? Math.round(Math.min(100, Math.max(0, b.value))) : 0;
          // "Contradicts the misreading" needs an actual denial in the player's latest words on that idea.
          const latest = fixed.filter((e) => e.ideaId === i.id && e.text).at(-1)?.text ?? '';
          return { id: i.id, value, contradictsMisread: !!b?.contradictsMisread && taught.has(i.id) && NEGATION.test(latest) };
        }),
        whenRight,
      };
    },

    async examine(stored, transcript, heldMisreads) {
      const lesson = stored.lesson;
      const fixed = recountPastes(transcript, stored.text);
      const taught = new Set(fixed.map((e) => e.ideaId));
      let out: ExaminerOutput | null = null;
      if (taught.size) {
        out = await withRetry((maxTokens) =>
          jsonCall<ExaminerOutput>(
            'examiner',
            EXAMINER_SYSTEM,
            [
              // Stable per round first (cached), the transcript last.
              { type: 'text', text: lessonBlock(lesson), cache_control: { type: 'ephemeral' } },
              { type: 'text', text: `The player's messages and taps:\n\n${transcriptBlock(lesson, fixed)}` },
            ],
            EXAMINER_SCHEMA,
            maxTokens,
          ),
        );
      }
      return { results: lesson.ideas.map((idea) => gradeIdea(idea, fixed, out?.results[idea.id as (typeof IDEA_IDS)[number]], heldMisreads, lesson.language)) };
    },
  };
}

/** The extractor's answer as a lesson: shuffled situations, links by number, the page's own words. */
export function toLesson(out: ExtractorOutput, capture: Pick<PageCapture, 'text' | 'links'>): Lesson {
  const nb = out.language === 'nb' || out.language === 'nn';
  const ideas = IDEA_IDS.map((id) => {
    const x = repairIdea(out.ideas[id], nb);
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
      name: x.name.trim(),
      question: x.question.trim(),
      modelAnswer: x.modelAnswer.trim(),
      keyPoints: x.keyPoints.map((k) => k.trim()).filter(Boolean).slice(0, 4),
      whenOptions: options,
      misread: x.misread.trim(),
      sourceUrl: link?.href ?? null,
      sourceTitle: link?.text ?? null,
    };
  });
  return checkLesson({
    topic: out.topic.trim(),
    monsterName: out.monsterName.trim(),
    monsterShape: out.monsterShape,
    language: out.language,
    ideas,
    words: distinctiveWords(capture.text, MONSTER_WORDS),
  });
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

/** The server re-checks pastes against the page: a pasted message counts as Say it. */
function recountPastes(transcript: TranscriptEntry[], pageText: string): TranscriptEntry[] {
  const windows = sourceWindows(pageText);
  return transcript.map((e) => (e.text && e.move !== 'same' && e.move !== 'dontknow' ? { ...e, move: effectiveMove(e.move, isPasted(e.text, windows)) } : e));
}

const UNKNOWN_LINE: Record<string, string> = { en: "I... don't know this one!", nb: 'Jeg... kan ikke denne!', nn: 'Eg... kan ikkje denne!' };

/** Grounding guards in code: untaught means 0; caps from the moves used; held misreads are wrong. */
function gradeIdea(
  idea: Lesson['ideas'][number],
  transcript: TranscriptEntry[],
  raw: ExaminerOutput['results'][(typeof IDEA_IDS)[number]] | undefined,
  heldMisreads: string[],
  language: Lesson['language'],
): ExamItem {
  const mine = transcript.filter((e) => e.ideaId === idea.id);
  const moves = mine.map((e) => e.move).filter((m): m is Move => m !== 'same' && m !== 'dontknow');
  let score = raw && mine.length && raw.grounded ? Math.round(Math.min(100, Math.max(0, raw.score))) : 0;
  score = barValue(moves, score);
  let belief = raw?.belief ?? 'unknown';
  let creatureAnswer = raw?.creatureAnswer?.trim() || UNKNOWN_LINE[language] || UNKNOWN_LINE.en!;
  if (!mine.length || score < 10) {
    if (belief !== 'wrong') belief = 'unknown';
    if (!mine.length) creatureAnswer = UNKNOWN_LINE[language] ?? UNKNOWN_LINE.en!;
  } else if (belief === 'unknown') {
    belief = score >= 60 ? 'right' : 'partial';
  }
  if (heldMisreads.includes(idea.id)) {
    belief = 'wrong';
    creatureAnswer = idea.misread;
  }
  return { id: idea.id, score, grounded: score > 0, belief, creatureAnswer, tip: raw?.tip?.trim() ?? '', modelAnswer: idea.modelAnswer };
}
