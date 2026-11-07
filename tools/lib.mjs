// Small helpers shared by the tools/ scripts.
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIST = path.join(ROOT, 'extension', 'dist');

/** Chrome's extension ID: sha256 of the DER public key, first 32 hex chars mapped 0-f to a-p. */
export function extensionIdFromKey(base64Key) {
  const hex = createHash('sha256').update(Buffer.from(base64Key, 'base64')).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

/**
 * Node's built-in fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 is set at startup
 * (Node >= 22.21). When a proxy is configured, re-run this script once with it set.
 */
export async function ensureEnvProxy() {
  const proxied = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxied || process.env.NODE_USE_ENV_PROXY) return;
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(
    process.execPath,
    [...process.execArgv, '--disable-warning=UNDICI-EHPA', ...process.argv.slice(1)],
    { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } },
  );
  process.exit(result.status ?? 1);
}
