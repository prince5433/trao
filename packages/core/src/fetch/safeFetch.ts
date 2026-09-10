import dns from 'node:dns/promises';
import net from 'node:net';
import { PipelineError } from '../types.js';

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  allowLocalhost?: boolean;
  maxRedirects?: number;
  headers?: Record<string, string>;
}

export interface SafeFetchResult {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
}

const BLOCKED_HOSTNAMES = new Set(['metadata.google.internal', 'metadata']);

function isPrivateIp(ip: string): boolean {
  if (net.isIP(ip) === 0) return true;
  const parts = ip.includes(':') ? null : ip.split('.').map(Number);
  if (parts) {
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80')) return true;
  return false;
}

export function normalizeUrl(input: string, base?: string): string {
  const url = base ? new URL(input, base) : new URL(input);
  url.hash = '';
  // Strip trailing slash except for root path
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

export async function assertSafeUrl(
  rawUrl: string,
  allowLocalhost: boolean,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new PipelineError('INVALID_URL', `Invalid URL: ${rawUrl}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PipelineError('INVALID_URL', `Unsupported protocol: ${url.protocol}`);
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new PipelineError('SSRF_BLOCKED', `Blocked hostname: ${hostname}`);
  }

  const isLocalHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost');

  if (isLocalHost) {
    if (!allowLocalhost) {
      throw new PipelineError('SSRF_BLOCKED', 'Loopback addresses are blocked in production');
    }
    return url;
  }

  let addresses: string[] = [];
  try {
    const looked = await dns.lookup(hostname, { all: true });
    addresses = looked.map((a) => a.address);
  } catch {
    throw new PipelineError('COMPANY_UNREACHABLE', `Could not resolve host: ${hostname}`);
  }

  if (!allowLocalhost) {
    for (const addr of addresses) {
      if (isPrivateIp(addr)) {
        throw new PipelineError(
          'SSRF_BLOCKED',
          `Private/internal IP blocked for ${hostname}`,
        );
      }
    }
  }

  return url;
}

export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? Number(process.env.FETCH_TIMEOUT_MS ?? 15000);
  const maxBytes = options.maxBytes ?? 1_500_000;
  const allowLocalhost =
    options.allowLocalhost ?? process.env.ALLOW_LOCALHOST_FETCH === 'true';
  const maxRedirects = options.maxRedirects ?? 5;

  let current = await assertSafeUrl(rawUrl, allowLocalhost);
  let redirects = 0;

  while (redirects <= maxRedirects) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'InterviewPrepKitBot/1.0 (+assessment; respectful crawler)',
          Accept: 'text/html,application/xhtml+xml,text/plain,application/json',
          ...options.headers,
        },
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get('location');
        if (!loc) {
          throw new PipelineError('COMPANY_UNREACHABLE', `Redirect without location from ${current}`);
        }
        current = await assertSafeUrl(normalizeUrl(loc, current.toString()), allowLocalhost);
        redirects += 1;
        continue;
      }

      const contentType = res.headers.get('content-type') ?? '';
      const allowed =
        contentType.includes('text/') ||
        contentType.includes('json') ||
        contentType.includes('xml') ||
        contentType === '';
      if (!allowed) {
        throw new PipelineError(
          'UNSUPPORTED_CONTENT',
          `Unexpected content-type ${contentType} for ${current}`,
        );
      }

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > maxBytes) {
        throw new PipelineError('RESPONSE_TOO_LARGE', `Response exceeds ${maxBytes} bytes`);
      }

      return {
        url: rawUrl,
        finalUrl: current.toString(),
        status: res.status,
        contentType,
        body: buf.toString('utf8'),
      };
    } catch (err) {
      if (err instanceof PipelineError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('abort')) {
        throw new PipelineError('TIMEOUT', `Timed out fetching ${current}`);
      }
      throw new PipelineError('COMPANY_UNREACHABLE', `Failed to fetch ${current}: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new PipelineError('TOO_MANY_REDIRECTS', `Too many redirects for ${rawUrl}`);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number; label?: string } = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const baseMs = opts.baseMs ?? 500;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      const delay = baseMs * 2 ** attempt + Math.floor(Math.random() * 100);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
