// Small HTTP helpers for the plain node:http server.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { EXTENSION_ID, MAX_BODY_BYTES } from '../../shared/config.ts';
import { isLoopbackHost, type Settings } from './settings.ts';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

type Rules = Pick<Settings, 'devOrigins' | 'allowedHosts'>;

/**
 * The Host header must name this server (localhost, 127.x, ::1, or ALLOWED_HOSTS), on any port.
 * A web page cannot fake it, so a DNS-rebinding page (evil.example pointed at 127.0.0.1) is refused.
 */
export function hostAllowed(hostHeader: string | undefined, rules: Pick<Settings, 'allowedHosts'>): boolean {
  if (!hostHeader) return true; // HTTP/1.0 tools: local only, still behind the token
  const name = hostHeader.trim().toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  return isLoopbackHost(name) || rules.allowedHosts.includes(name);
}

/**
 * Pages we answer: our extension, the game this server serves itself (same origin, on an allowed Host),
 * and, with DEV_ORIGINS=1, any http://localhost page. Requests without an Origin (curl, Node) are not pages.
 */
export function originAllowed(origin: string | undefined, hostHeader: string | undefined, rules: Rules): boolean {
  if (!origin) return true;
  if (origin === `chrome-extension://${EXTENSION_ID}`) return true;
  if (rules.devOrigins && DEV_ORIGIN.test(origin)) return true;
  return !!hostHeader && (origin === `http://${hostHeader}` || origin === `https://${hostHeader}`) && hostAllowed(hostHeader, rules);
}

export function setCors(req: IncomingMessage, res: ServerResponse, rules: Rules): void {
  const origin = req.headers.origin;
  if (!origin || !originAllowed(origin, req.headers.host, rules)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-spark');
  res.setHeader('Access-Control-Max-Age', '600');
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(text);
}

export async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'That page is too big to send.');
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'The request was not valid JSON.');
  }
}

export function clientIp(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown';
}
