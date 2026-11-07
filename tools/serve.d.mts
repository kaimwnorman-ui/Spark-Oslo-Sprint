/** Serves `dir` on `port` (0 = any free port). */
export function serveDir(dir: string, port?: number): Promise<{ url: string; close: () => Promise<void> }>;
