// Spark's HTTP routes. createApp returns a plain node:http handler so tests can
// call it without opening a port.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PRODUCT_NAME } from '../../shared/config.ts';
import { HttpError, readJson, sendJson, setCors } from './http.ts';
import type { Settings } from './settings.ts';

export type RouteHandler = (body: unknown, req: IncomingMessage, res: ServerResponse) => Promise<unknown>;

export interface AppDeps {
  settings: Settings;
  /** POST routes by path. A handler returns a JSON body, or writes the response itself and returns undefined. */
  routes: Record<string, RouteHandler>;
  log?: (line: string) => void;
}

export function createApp({ settings, routes, log = console.log }: AppDeps) {
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const started = Date.now();
    const url = new URL(req.url ?? '/', 'http://localhost');
    setCors(req, res, settings.devOrigins);
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, {
          ok: true,
          product: PRODUCT_NAME,
          ai: settings.stub ? 'stub' : settings.keys.anthropicApiKey ? 'live' : 'offline',
          models: settings.models,
        });
        return;
      }
      if (req.method === 'GET' && settings.devOrigins && /^\/pages\/[a-z0-9-]+\.html$/.test(url.pathname)) {
        // Dev only: the demo pages, so the extension can be tried (and tested) on them.
        const file = fileURLToPath(new URL(`../../demo${url.pathname}`, import.meta.url));
        const html = await readFile(file).catch(() => null);
        if (!html) throw new HttpError(404, 'Not found.');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(html);
        return;
      }
      const route = routes[url.pathname];
      if (!route) throw new HttpError(404, 'Not found.');
      if (req.method !== 'POST') throw new HttpError(405, 'Use POST.');
      if (req.headers['x-spark'] !== settings.clientToken) throw new HttpError(403, 'Missing X-Spark header.');
      const body = await readJson(req);
      const out = await route(body, req, res);
      if (out !== undefined) sendJson(res, 200, out);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof HttpError ? err.message : 'Something went wrong on the server.';
      if (status === 500) log(`error ${url.pathname}: ${err instanceof Error ? err.message : String(err)}`);
      if (!res.headersSent) sendJson(res, status, { error: message });
      else res.end();
    } finally {
      if (url.pathname !== '/health' && !url.pathname.startsWith('/pages/')) log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`);
    }
  };
}
