// Server settings from the environment. Pure: pass env in.
import { CLIENT_TOKEN, DEFAULT_MODELS, SERVER_PORT, type Role } from '../../shared/config.ts';
import { resolveKeys, type ServerKeys } from './env.ts';

export interface Settings {
  port: number;
  /** AI_STUB=1: every AI route answers from demo/ fixtures. */
  stub: boolean;
  models: Record<Role, string>;
  keys: ServerKeys;
  clientToken: string;
  /** Allow http://localhost:* origins (dev and smoke tests). Off when NODE_ENV=production. */
  devOrigins: boolean;
}

type Env = Record<string, string | undefined>;

export function loadSettings(env: Env): Settings {
  const pick = (name: string, fallback: string) => env[name]?.trim() || fallback;
  return {
    port: Number(env.PORT) || SERVER_PORT,
    stub: env.AI_STUB === '1',
    models: {
      extractor: pick('MODEL_EXTRACTOR', DEFAULT_MODELS.extractor),
      creature: pick('MODEL_CREATURE', DEFAULT_MODELS.creature),
      bars: pick('MODEL_BARS', DEFAULT_MODELS.bars),
      examiner: pick('MODEL_EXAMINER', DEFAULT_MODELS.examiner),
    },
    keys: resolveKeys(env),
    clientToken: pick('SPARK_CLIENT_TOKEN', CLIENT_TOKEN),
    devOrigins: env.NODE_ENV !== 'production',
  };
}
