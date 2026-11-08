/** The repository root. */
export const ROOT: string;
/** The extension build (extension/dist). */
export const DIST: string;
/** Chrome's extension ID for a base64 public key. */
export function extensionIdFromKey(base64Key: string): string;
/** Re-runs the current script with NODE_USE_ENV_PROXY=1 when an HTTPS proxy is configured (Node's fetch ignores it otherwise). */
export function ensureEnvProxy(): Promise<void>;
