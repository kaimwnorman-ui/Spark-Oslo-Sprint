// Where the server gets its keys and API endpoints. Pure: pass an env object in,
// so tests never touch process.env. Never log the key values, only the source name.

export const ANTHROPIC_API_URL = 'https://api.anthropic.com';

type Env = Record<string, string | undefined>;

export interface ServerKeys {
  anthropicApiKey: string | undefined;
  /** Which variable the key came from, safe to log. */
  anthropicKeySource: 'ANTHROPIC_API_KEY' | 'SPARK_ANTHROPIC_API_KEY' | null;
  /** Always the public API. Pass as `baseURL` to `new Anthropic()`. */
  anthropicBaseURL: string;
  /** Unset in the cloud: the network proxy adds the KIE key to requests to api.kie.ai. */
  kieApiKey: string | undefined;
}

const clean = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

export function resolveKeys(env: Env): ServerKeys {
  // Locally server/.env sets ANTHROPIC_API_KEY; the cloud environment stores it
  // as SPARK_ANTHROPIC_API_KEY.
  const primary = clean(env.ANTHROPIC_API_KEY);
  const fallback = clean(env.SPARK_ANTHROPIC_API_KEY);
  return {
    anthropicApiKey: primary ?? fallback,
    anthropicKeySource: primary ? 'ANTHROPIC_API_KEY' : fallback ? 'SPARK_ANTHROPIC_API_KEY' : null,
    // The SDK would otherwise read ANTHROPIC_BASE_URL, which in the cloud points at
    // Claude Code's own gateway, not at the API Spark should call.
    anthropicBaseURL: ANTHROPIC_API_URL,
    kieApiKey: clean(env.KIE_API_KEY),
  };
}
