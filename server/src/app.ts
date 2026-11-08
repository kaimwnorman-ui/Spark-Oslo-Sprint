// Spark's HTTP routes. createApp returns a plain node:http handler so tests can
// call it without opening a port.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCT_NAME } from '../../shared/config.ts';
import { HttpError, hostAllowed, originAllowed, readJson, sendJson, setCors } from './http.ts';
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
    try {
      // Who may talk to this server: this computer's own names only, and only pages we know.
      if (!hostAllowed(req.headers.host, settings)) throw new HttpError(403, 'Unexpected host.');
      if (!originAllowed(req.headers.origin, req.headers.host, settings)) throw new HttpError(403, 'This page may not talk to Spark.');
      setCors(req, res, settings);
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
      if (req.method === 'GET' && (url.pathname === '/app' || url.pathname === '/app/')) {
        res.writeHead(302, { location: '/app/game.html' });
        res.end();
        return;
      }
      if (req.method === 'GET' && url.pathname.startsWith('/app/')) {
        // The game itself, so a duel link works in any browser that can reach this server.
        await serveGameFile(res, url.pathname.slice('/app/'.length));
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
      if (url.pathname !== '/health' && !url.pathname.startsWith('/pages/') && !url.pathname.startsWith('/app/')) log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`);
    }
  };
}

const DIST = fileURLToPath(new URL('../../extension/dist/', import.meta.url));
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
};

/** Serves one file of the built game (extension/dist), never anything outside it. */
async function serveGameFile(res: ServerResponse, rel: string): Promise<void> {
  let decoded = '';
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    throw new HttpError(400, 'Bad path.');
  }
  const file = path.resolve(DIST, decoded);
  const type = TYPES[path.extname(file)];
  if (!file.startsWith(DIST) || !type) throw new HttpError(404, 'Not found.');
  const body = await readFile(file).catch(() => null);
  if (!body) throw new HttpError(404, 'Not found.');
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
  res.end(body);
}
