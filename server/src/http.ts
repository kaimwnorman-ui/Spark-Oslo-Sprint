// Small HTTP helpers for the plain node:http server.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { EXTENSION_ID, MAX_BODY_BYTES } from '../../shared/config.ts';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function allowedOrigin(origin: string | undefined, devOrigins: boolean): string | null {
  if (!origin) return null;
  if (origin === `chrome-extension://${EXTENSION_ID}`) return origin;
  if (devOrigins && DEV_ORIGIN.test(origin)) return origin;
  return null;
}

export function setCors(req: IncomingMessage, res: ServerResponse, devOrigins: boolean): void {
  const origin = allowedOrigin(req.headers.origin, devOrigins);
  if (!origin) return;
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
