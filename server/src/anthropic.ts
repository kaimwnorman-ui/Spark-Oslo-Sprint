// The one place the Anthropic client is created (CLAUDE.md: keys only via env.ts).
import Anthropic from '@anthropic-ai/sdk';
import type { ServerKeys } from './env.ts';

/** Null when there is no key: the server then runs in offline mode. */
export function createAnthropic(keys: ServerKeys): Anthropic | null {
  if (!keys.anthropicApiKey) return null;
  return new Anthropic({
    apiKey: keys.anthropicApiKey,
    // Never inherit ANTHROPIC_AUTH_TOKEN or ANTHROPIC_BASE_URL from the environment.
    authToken: null,
    baseURL: keys.anthropicBaseURL,
    maxRetries: 1,
    timeout: 60_000,
  });
}
