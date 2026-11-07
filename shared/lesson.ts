// Lesson checks and sealing (SPEC §12.1, §12.4). Pure; used by the server and the demo engine.
import { IDEA_COUNT } from './config.ts';
import { LANGUAGES, MONSTER_SHAPES, type Idea, type Lesson, type SealedLesson } from './types.ts';

export class LessonError extends Error {}

const isStr = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;

/** Throws LessonError unless `x` is a complete lesson with exactly five ideas. */
export function checkLesson(x: unknown): Lesson {
  const l = x as Lesson;
  if (!l || typeof l !== 'object') throw new LessonError('lesson is not an object');
  for (const k of ['topic', 'monsterName'] as const) if (!isStr(l[k])) throw new LessonError(`missing ${k}`);
  if (!MONSTER_SHAPES.includes(l.monsterShape)) throw new LessonError('bad monsterShape');
  if (!LANGUAGES.includes(l.language)) throw new LessonError('bad language');
  if (!Array.isArray(l.ideas) || l.ideas.length !== IDEA_COUNT) throw new LessonError(`need exactly ${IDEA_COUNT} ideas`);
  const ids = new Set<string>();
  for (const idea of l.ideas) {
    for (const k of ['id', 'name', 'question', 'modelAnswer', 'misread'] as const) {
      if (!isStr(idea[k])) throw new LessonError(`idea missing ${k}`);
    }
    if (ids.has(idea.id)) throw new LessonError('duplicate idea id');
    ids.add(idea.id);
    if (!Array.isArray(idea.keyPoints) || !idea.keyPoints.every(isStr)) throw new LessonError('bad keyPoints');
    if (!Array.isArray(idea.whenOptions) || idea.whenOptions.length !== 3) throw new LessonError('need 3 whenOptions');
    if (idea.whenOptions.filter((o) => o.right).length !== 1) throw new LessonError('need exactly one right whenOption');
  }
  if (!Array.isArray(l.words) || !l.words.every((w) => typeof w === 'string')) throw new LessonError('bad words');
  return l;
}

/** What the extension may see: no model answers, key points, questions, misreads or right flags. */
export function sealLesson(lesson: Lesson, lessonId: string): SealedLesson {
  return {
    lessonId,
    topic: lesson.topic,
    monsterName: lesson.monsterName,
    monsterShape: lesson.monsterShape,
    language: lesson.language,
    ideas: lesson.ideas.map((idea: Idea) => ({
      id: idea.id,
      name: idea.name,
      whenOptions: idea.whenOptions.map((o) => ({ text: o.text })),
      asksWhy: idea.keyPoints.length >= 2,
      sourceUrl: idea.sourceUrl,
      sourceTitle: idea.sourceTitle,
    })),
    words: lesson.words,
  };
}
