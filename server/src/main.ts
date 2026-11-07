// Spark server: one Node process. `npm run server` or `npm run dev`.
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';
import { loadSettings } from './settings.ts';
import { buildRoutes } from './routes.ts';

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const settings = loadSettings(process.env);
const { keys } = settings;

if (settings.stub) console.log('AI_STUB=1: every AI route answers from demo/ fixtures.');
else if (keys.anthropicApiKey) console.log(`Anthropic key found (${keys.anthropicKeySource}).`);
else console.log('No Anthropic key: offline mode, rounds come from demo/.');

const app = createApp({ settings, routes: buildRoutes(settings) });
const server = createServer((req, res) => void app(req, res));
server.listen(settings.port, () => {
  console.log(`Spark server on http://localhost:${settings.port}`);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
