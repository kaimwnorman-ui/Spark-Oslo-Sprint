// Live AI roles (SPEC §12). Filled in by M4 (extractor, examiner) and M5 (creature, live bars).
import type Anthropic from '@anthropic-ai/sdk';
import type { CreatureRequest } from '../../shared/demo.ts';
import type { BarValue, ExamResult, Lesson, PageCapture, TranscriptEntry } from '../../shared/types.ts';
import { HttpError } from './http.ts';
import type { StoredLesson } from './lessons.ts';
import type { Settings } from './settings.ts';

export interface LiveAi {
  extract(capture: Pick<PageCapture, 'url' | 'title' | 'text' | 'links' | 'source'>): Promise<Lesson>;
  creature(stored: StoredLesson, req: CreatureRequest): AsyncIterable<string>;
  bars(stored: StoredLesson, ideaId: string, transcript: TranscriptEntry[]): Promise<{ bars: BarValue[]; whenRight?: boolean }>;
  examine(stored: StoredLesson, transcript: TranscriptEntry[], heldMisreads: string[]): Promise<ExamResult>;
}

export function makeLiveAi(_client: Anthropic, _settings: Settings): LiveAi {
  const notYet = () => {
    throw new HttpError(501, 'Not built yet.');
  };
  return {
    extract: async () => notYet(),
    async *creature() {
      notYet();
    },
    bars: async () => notYet(),
    examine: async () => notYet(),
  };
}
