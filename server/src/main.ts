// Spark server: one Node process. `npm run server` or `npm run dev`.
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';
import { loadSettings, startupProblem } from './settings.ts';
import { buildRoutes, liveAiFor } from './routes.ts';
import { makeLiveAi } from './ai.ts';
import { DuelStore, LessonStore } from './lessons.ts';
import { SWEEP_MS } from '../../shared/config.ts';

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const settings = loadSettings(process.env);
const { keys } = settings;

const problem = startupProblem(settings);
if (problem) {
  console.error(problem);
  process.exit(1);
}

if (settings.stub) console.log('AI_STUB=1: every AI route answers from demo/ fixtures.');
else if (keys.anthropicApiKey) console.log(`Anthropic key found (${keys.anthropicKeySource}).`);
else console.log('No Anthropic key: offline mode, rounds come from demo/.');

const ai = liveAiFor(settings, (client) => makeLiveAi(client, settings));
const store = new LessonStore();
const duels = new DuelStore();
const app = createApp({ settings, routes: buildRoutes(settings, { ai, store, duels }) });
const server = createServer((req, res) => void app(req, res));
server.listen(settings.port, settings.host, () => {
  console.log(`Spark server on http://${settings.host === '127.0.0.1' ? 'localhost' : settings.host}:${settings.port} (listening on ${settings.host})`);
});
// "localhost" can mean 127.0.0.1 or ::1 depending on the machine: on this computer, answer on both.
if (settings.host === '127.0.0.1') {
  const v6 = createServer((req, res) => void app(req, res));
  v6.on('error', () => {}); // no IPv6 on this machine: nothing to do
  v6.listen(settings.port, '::1');
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => v6.close());
}
// Forget what has expired even when nobody is calling (rounds and challenges live for hours, not forever).
setInterval(() => {
  store.sweep();
  duels.sweep();
}, SWEEP_MS).unref();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
