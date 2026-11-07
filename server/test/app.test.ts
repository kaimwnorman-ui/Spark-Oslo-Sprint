import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.ts';
import { loadSettings } from '../src/settings.ts';
import { CLIENT_TOKEN, EXTENSION_ID } from '../../shared/config.ts';

async function withServer(env: Record<string, string>, fn: (base: string) => Promise<void>) {
  const settings = loadSettings(env);
  const app = createApp({
    settings,
    routes: { '/echo': async (body) => ({ got: body }) },
    log: () => {},
  });
  const server: Server = createServer((req, res) => void app(req, res));
  await new Promise<void>((r) => server.listen(0, r));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('/health answers 200 and reports the AI mode', async () => {
  await withServer({ AI_STUB: '1' }, async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.ai, 'stub');
  });
});

test('POST routes need the X-Spark header', async () => {
  await withServer({}, async (base) => {
    const bad = await fetch(`${base}/echo`, { method: 'POST', body: '{}' });
    assert.equal(bad.status, 403);
    const ok = await fetch(`${base}/echo`, {
      method: 'POST',
      headers: { 'x-spark': CLIENT_TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { got: { a: 1 } });
  });
});

test('CORS allows our extension and refuses other sites', async () => {
  await withServer({ NODE_ENV: 'production' }, async (base) => {
    const ours = await fetch(`${base}/health`, { headers: { origin: `chrome-extension://${EXTENSION_ID}` } });
    assert.equal(ours.headers.get('access-control-allow-origin'), `chrome-extension://${EXTENSION_ID}`);
    const other = await fetch(`${base}/health`, { headers: { origin: 'https://evil.example' } });
    assert.equal(other.headers.get('access-control-allow-origin'), null);
    const local = await fetch(`${base}/health`, { headers: { origin: 'http://localhost:5173' } });
    assert.equal(local.headers.get('access-control-allow-origin'), null, 'no dev origins in production');
  });
});
