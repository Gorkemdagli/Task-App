const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 8_000;
const SAFE_RESPONSE_HEADERS = ['content-type', 'cache-control', 'etag'];
const ALLOWED_ROUTES = new Set(['login', 'register', 'refresh', 'logout']);

export interface ProxyRequest {
  method?: string;
  url?: string;
  query?: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  on?: (
    event: 'data' | 'end' | 'error',
    listener: (chunk?: string | Uint8Array | Error) => void,
  ) => ProxyRequest;
}

export interface ProxyResponse {
  status(code: number): ProxyResponse;
  setHeader(name: string, value: string | string[]): ProxyResponse;
  json(body: unknown): ProxyResponse;
  send(body: unknown): ProxyResponse;
  end(body?: unknown): ProxyResponse;
}

interface AuthProxyOptions {
  apiOrigin?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

class ProxyError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly responseBody: { error: string },
  ) {
    super(responseBody.error);
  }
}

function parseApiOrigin(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
      return null;
    }
    if (process.env.NODE_ENV !== 'test' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function getHeader(headers: ProxyRequest['headers'], name: string): string | undefined {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  if (!entry) return undefined;
  return Array.isArray(entry[1]) ? entry[1][0] : entry[1];
}

function getRawPath(req: ProxyRequest): string {
  const queryPath = req.query?.path;
  if (Array.isArray(queryPath)) return queryPath.join('/');
  if (typeof queryPath === 'string') return queryPath;

  const path = req.url?.match(/^\/api\/v1\/auth\/([^?]*)/)?.[1];
  return path ?? '';
}

function getAllowedPath(req: ProxyRequest): string {
  const rawPath = getRawPath(req);
  if (!rawPath || rawPath.includes('/') || rawPath.includes('\\') || /%2f|%5c|%00/i.test(rawPath)) {
    throw new ProxyError(404, { error: 'Not Found' });
  }

  let path: string;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    throw new ProxyError(404, { error: 'Not Found' });
  }

  if (path !== rawPath || !ALLOWED_ROUTES.has(path)) {
    throw new ProxyError(404, { error: 'Not Found' });
  }
  return path;
}

function bodyToBuffer(body: unknown): Buffer | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(JSON.stringify(body));
}

async function readRequestBody(req: ProxyRequest): Promise<Buffer | undefined> {
  const contentLength = getHeader(req.headers, 'content-length');
  if (contentLength && Number(contentLength) > MAX_REQUEST_BYTES) {
    throw new ProxyError(413, { error: 'Auth request body too large' });
  }

  const body = bodyToBuffer(req.body);
  if (body) {
    if (body.byteLength > MAX_REQUEST_BYTES) {
      throw new ProxyError(413, { error: 'Auth request body too large' });
    }
    return body;
  }

  if (!req.on) return undefined;

  return new Promise<Buffer | undefined>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    req
      .on('data', (chunk) => {
        if (chunk instanceof Error || chunk === undefined) return;
        const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk);
        total += buffer.byteLength;
        if (total > MAX_REQUEST_BYTES) {
          reject(new ProxyError(413, { error: 'Auth request body too large' }));
          return;
        }
        chunks.push(buffer);
      })
      .on('end', () => resolve(total ? Buffer.concat(chunks) : undefined))
      .on('error', (error) => reject(error));
  });
}

async function readResponseBody(response: Response): Promise<string> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && Number(declaredLength) > MAX_RESPONSE_BYTES) {
    throw new ProxyError(502, { error: 'Auth upstream response too large' });
  }

  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let complete = false;

  while (!complete) {
    const { done, value } = await reader.read();
    complete = done;
    if (complete || !value) continue;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new ProxyError(502, { error: 'Auth upstream response too large' });
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString('utf8');
}

function copySafeResponseHeaders(response: Response, res: ProxyResponse): void {
  for (const name of SAFE_RESPONSE_HEADERS) {
    const value = response.headers.get(name);
    if (value) res.setHeader(name, value);
  }

  const headersWithSetCookie = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies = headersWithSetCookie.getSetCookie?.() ?? [];
  const fallbackCookie = response.headers.get('set-cookie');
  if (setCookies.length > 0) {
    res.setHeader('set-cookie', setCookies);
  } else if (fallbackCookie) {
    res.setHeader('set-cookie', fallbackCookie);
  }
}

function sendError(res: ProxyResponse, error: unknown): ProxyResponse {
  if (error instanceof ProxyError) {
    return res.status(error.statusCode).json(error.responseBody);
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return res.status(504).json({ error: 'Auth upstream timeout' });
  }
  return res.status(502).json({ error: 'Auth upstream unavailable' });
}

export function createAuthProxyHandler(options: AuthProxyOptions = {}) {
  const apiOrigin = parseApiOrigin(options.apiOrigin ?? process.env.API_ORIGIN);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async function authProxyHandler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
    try {
      if (!apiOrigin) throw new ProxyError(500, { error: 'Auth proxy is not configured' });

      const method = (req.method ?? 'GET').toUpperCase();
      if (method !== 'POST') throw new ProxyError(405, { error: 'Method Not Allowed' });
      if (req.url?.includes('?')) throw new ProxyError(400, { error: 'Invalid auth request' });

      const path = getAllowedPath(req);
      const body = await readRequestBody(req);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const headers = new Headers();
      for (const name of ['content-type', 'authorization', 'cookie']) {
        const value = getHeader(req.headers, name);
        if (value) headers.set(name, value);
      }

      let upstream: Response;
      try {
        upstream = await fetchImpl(`${apiOrigin}/api/v1/auth/${path}`, {
          method,
          headers,
          body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      const responseBody = await readResponseBody(upstream);
      copySafeResponseHeaders(upstream, res);
      res.status(upstream.status);
      if (upstream.status === 204) {
        res.end();
      } else {
        res.send(responseBody);
      }
    } catch (error) {
      sendError(res, error);
    }
  };
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default createAuthProxyHandler();
