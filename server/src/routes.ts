// The four AI routes. Filled in by M4 (extract, examine) and M5 (creature, bars).
import { HttpError } from './http.ts';
import type { RouteHandler } from './app.ts';
import type { Settings } from './settings.ts';

export function buildRoutes(_settings: Settings): Record<string, RouteHandler> {
  const notYet: RouteHandler = async () => {
    throw new HttpError(501, 'Not built yet.');
  };
  return { '/extract': notYet, '/creature': notYet, '/bars': notYet, '/examine': notYet };
}
