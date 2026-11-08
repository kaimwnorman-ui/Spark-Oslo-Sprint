// Server settings from the environment. Pure: pass env in.
import { CLIENT_TOKEN, DEFAULT_MODELS, SERVER_PORT, type Role } from '../../shared/config.ts';
import { resolveKeys, type ServerKeys } from './env.ts';

export interface Settings {
  port: number;
  /** The address the server listens on. Loopback unless HOST says otherwise (then a private token is required). */
  host: string;
  /** AI_STUB=1: every AI route answers from demo/ fixtures. */
  stub: boolean;
  models: Record<Role, string>;
  /** output_config.effort per role (SPEC §12: low; the examiner may need medium on Sonnet). */
  efforts: Record<Role, 'low' | 'medium' | 'high'>;
  keys: ServerKeys;
  clientToken: string;
  /** DEV_ORIGINS=1 (npm run dev, the smoke tests): also accept http://localhost:* pages and serve /pages. Off otherwise. */
  devOrigins: boolean;
  /** Extra Host names this server answers to (ALLOWED_HOSTS, comma separated), besides localhost and 127.0.0.1. */
  allowedHosts: string[];
}

type Env = Record<string, string | undefined>;

const effort = (v: string | undefined): 'low' | 'medium' | 'high' => (v === 'medium' || v === 'high' ? v : 'low');

export function loadSettings(env: Env): Settings {
  const pick = (name: string, fallback: string) => env[name]?.trim() || fallback;
  return {
    port: Number(env.PORT) || SERVER_PORT,
    host: pick('HOST', '127.0.0.1'),
    stub: env.AI_STUB === '1',
    models: {
      extractor: pick('MODEL_EXTRACTOR', DEFAULT_MODELS.extractor),
      creature: pick('MODEL_CREATURE', DEFAULT_MODELS.creature),
      bars: pick('MODEL_BARS', DEFAULT_MODELS.bars),
      examiner: pick('MODEL_EXAMINER', DEFAULT_MODELS.examiner),
      recall: pick('MODEL_RECALL', DEFAULT_MODELS.recall),
    },
    efforts: {
      extractor: effort(env.EFFORT_EXTRACTOR),
      creature: effort(env.EFFORT_CREATURE),
      bars: effort(env.EFFORT_BARS),
      examiner: effort(env.EFFORT_EXAMINER),
      recall: effort(env.EFFORT_RECALL),
    },
    keys: resolveKeys(env),
    clientToken: pick('SPARK_CLIENT_TOKEN', CLIENT_TOKEN),
    devOrigins: env.DEV_ORIGINS === '1',
    allowedHosts: (env.ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean),
  };
}

/** True for localhost, 127.x.x.x and ::1: addresses only this computer can reach. */
export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '::1' || /^127(\.\d{1,3}){3}$/.test(h);
}

/** Why this configuration may not start, or null. A server open to the network must not use the public token. */
export function startupProblem(settings: Pick<Settings, 'host' | 'clientToken'>): string | null {
  if (!isLoopbackHost(settings.host) && settings.clientToken === CLIENT_TOKEN) {
    return `HOST=${settings.host} would open the server to your network, but SPARK_CLIENT_TOKEN is still the public default. Set SPARK_CLIENT_TOKEN to a long secret first (and the same token in the extension's options), or leave HOST unset to stay on this computer only.`;
  }
  return null;
}
