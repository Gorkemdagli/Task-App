import { describe, expect, it, vi } from 'vitest';
import { createAuthProxyHandler, type ProxyRequest, type ProxyResponse } from './[...path]';

function createRequest(overrides: Partial<ProxyRequest> = {}): ProxyRequest {
  return {
    method: 'POST',
    url: '/api/v1/auth/login',
    query: { path: ['login'] },
    headers: {
      'content-type': 'application/json',
      cookie: 'refreshToken=secret',
      authorization: 'Bearer access-token',
    },
    body: JSON.stringify({ email: 'user@example.com', password: 'password' }),
    ...overrides,
  };
}

function createResponse() {
  const response: ProxyResponse & {
    statusCode: number;
    headers: Record<string, string | string[]>;
    body: unknown;
  } = {
    statusCode: 200,
    headers: {} as Record<string, string | string[]>,
    body: undefined as unknown,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    setHeader(name: string, value: string | string[]) {
      response.headers[name.toLowerCase()] = value;
      return response;
    },
    json(body: unknown) {
      response.body = body;
      return response;
    },
    send(body: unknown) {
      response.body = body;
      return response;
    },
    end(body?: unknown) {
      response.body = body;
      return response;
    },
  };
  return response;
}

describe('auth proxy', () => {
  it('forwards allowed auth request to fixed origin with credentials and safe response headers', async () => {
    const upstreamHeaders = new Headers({
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
    upstreamHeaders.append('set-cookie', 'refreshToken=one; Path=/api/v1/auth; HttpOnly');
    upstreamHeaders.append('set-cookie', 'refreshToken=two; Path=/api/v1/auth; HttpOnly');
    const upstream = new Response(JSON.stringify({ accessToken: 'new' }), {
      status: 200,
      headers: upstreamHeaders,
    });
    const fetchImpl = vi.fn().mockResolvedValue(upstream);
    const response = createResponse();

    await createAuthProxyHandler({ apiOrigin: 'https://api.example.test', fetchImpl })(
      createRequest(),
      response,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/auth/login',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(new TextDecoder().decode(init.body as Uint8Array)).toBe(
      JSON.stringify({ email: 'user@example.com', password: 'password' }),
    );
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(new Headers(init.headers).get('cookie')).toBe('refreshToken=secret');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-token');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/json');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toEqual([
      'refreshToken=one; Path=/api/v1/auth; HttpOnly',
      'refreshToken=two; Path=/api/v1/auth; HttpOnly',
    ]);
    expect(response.body).toBe(JSON.stringify({ accessToken: 'new' }));
  });

  it.each([
    ['/api/v1/auth/unknown', ['unknown']],
    ['/api/v1/auth/login/extra', ['login', 'extra']],
    ['/api/v1/auth/%2e%2e/login', ['%2e%2e', 'login']],
  ])('rejects unsupported auth path %s', async (url, path) => {
    const fetchImpl = vi.fn();
    const response = createResponse();

    await createAuthProxyHandler({ apiOrigin: 'https://api.example.test', fetchImpl })(
      createRequest({ url, query: { path } }),
      response,
    );

    expect(response.statusCode).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects unsupported methods and destination query overrides before upstream call', async () => {
    const fetchImpl = vi.fn();
    const response = createResponse();

    await createAuthProxyHandler({ apiOrigin: 'https://api.example.test', fetchImpl })(
      createRequest({ method: 'GET', url: '/api/v1/auth/login?url=https://evil.test' }),
      response,
    );

    expect(response.statusCode).toBe(405);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects oversized auth bodies before upstream call', async () => {
    const fetchImpl = vi.fn();
    const response = createResponse();

    await createAuthProxyHandler({ apiOrigin: 'https://api.example.test', fetchImpl })(
      createRequest({
        headers: { 'content-length': '65537' },
        body: 'x'.repeat(65537),
      }),
      response,
    );

    expect(response.statusCode).toBe(413);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects oversized streamed auth bodies before upstream call', async () => {
    const listeners = new Map<string, (chunk?: string | Uint8Array | Error) => void>();
    const request = createRequest({ body: undefined, headers: {} });
    request.on = (event, listener) => {
      listeners.set(event, listener);
      return request;
    };
    const fetchImpl = vi.fn();
    const response = createResponse();
    const fromSpy = vi.spyOn(Buffer, 'from');
    const concatSpy = vi.spyOn(Buffer, 'concat');

    try {
      const pending = createAuthProxyHandler({ apiOrigin: 'https://api.example.test', fetchImpl })(
        request,
        response,
      );
      listeners.get('data')?.('x'.repeat(32 * 1024));
      listeners.get('data')?.('y'.repeat(32 * 1024 + 1));
      listeners.get('data')?.('z'.repeat(1024 * 1024));
      listeners.get('end')?.();
      listeners.get('error')?.(new Error('late stream error'));
      await pending;

      expect(response.statusCode).toBe(413);
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(fromSpy).toHaveBeenCalledTimes(1);
      expect(concatSpy).not.toHaveBeenCalled();
    } finally {
      fromSpy.mockRestore();
      concatSpy.mockRestore();
    }
  });

  it('returns safe gateway errors for upstream failure and timeout', async () => {
    const response = createResponse();
    const unavailable = vi.fn().mockRejectedValue(new Error('network secret'));

    await createAuthProxyHandler({ apiOrigin: 'https://api.example.test', fetchImpl: unavailable })(
      createRequest(),
      response,
    );
    expect(response.statusCode).toBe(502);
    expect(response.body).toEqual({ error: 'Auth upstream unavailable' });

    const timeoutResponse = createResponse();
    const timeout = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('timeout'), { name: 'AbortError' }));
    await createAuthProxyHandler({ apiOrigin: 'https://api.example.test', fetchImpl: timeout })(
      createRequest(),
      timeoutResponse,
    );
    expect(timeoutResponse.statusCode).toBe(504);
    expect(timeoutResponse.body).toEqual({ error: 'Auth upstream timeout' });
  });

  it('keeps the upstream deadline active while reading the response body', async () => {
    vi.stubEnv('REQUEST_STAGE_TIMING', 'true');
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    let signal: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      return new Response(
        new ReadableStream({
          start(controller) {
            const fallback = setTimeout(
              () => controller.error(Object.assign(new Error('fallback body timeout'), { name: 'AbortError' })),
              50,
            );
            signal.addEventListener(
              'abort',
              () => {
                clearTimeout(fallback);
                controller.error(Object.assign(new Error('body secret'), { name: 'AbortError' }));
              },
              { once: true },
            );
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json', 'set-cookie': 'secret-cookie' } },
      );
    });
    const response = createResponse();

    try {
      await createAuthProxyHandler({
        apiOrigin: 'https://api.example.test',
        fetchImpl,
        timeoutMs: 10,
      })(createRequest({ url: '/api/v1/auth/refresh', query: { path: ['refresh'] } }), response);

      expect(response.statusCode).toBe(504);
      expect(response.body).toEqual({ error: 'Auth upstream timeout' });
      expect(response.headers).toEqual({});
      expect(signal?.aborted).toBe(true);
      const events = log.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
      expect(events.map((event) => event.phase)).toEqual(['start', 'upstream_headers', 'terminal']);
      expect(events[1]).toMatchObject({ status: 200 });
      expect(events[2]).toMatchObject({ status: 504, errorClass: 'upstream_timeout' });
      expect(JSON.stringify(events)).not.toMatch(/body secret|secret-cookie|refreshToken|password|access-token/i);
    } finally {
      log.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it('clears the upstream deadline after a complete response body', async () => {
    let signal: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"ok":true}'));
            setTimeout(() => controller.close(), 5);
          },
        }),
        { status: 200 },
      );
    });
    const response = createResponse();

    await createAuthProxyHandler({
      apiOrigin: 'https://api.example.test',
      fetchImpl,
      timeoutMs: 30,
    })(createRequest({ url: '/api/v1/auth/refresh', query: { path: ['refresh'] } }), response);
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('{"ok":true}');
    expect(signal?.aborted).toBe(false);
  });

  it('replaces an incoming correlation header and logs only safe refresh lifecycle fields', async () => {
    vi.stubEnv('REQUEST_STAGE_TIMING', 'true');
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"accessToken":"response-secret"}', { status: 200 }));
    const response = createResponse();

    try {
      await createAuthProxyHandler({ apiOrigin: 'https://api.example.test', fetchImpl })(
        createRequest({
          url: '/api/v1/auth/refresh',
          query: { path: ['refresh'] },
          headers: {
            'content-type': 'application/json',
            cookie: 'refreshToken=request-secret',
            authorization: 'Bearer request-secret',
            'x-taskflow-request-id': 'attacker-value',
          },
        }),
        response,
      );

      const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      const requestId = new Headers(init.headers).get('x-taskflow-request-id');
      expect(requestId ?? '').toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
      expect(requestId).not.toBe('attacker-value');
      const events = log.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
      expect(events.map((event) => event.phase)).toEqual(['start', 'upstream_headers', 'terminal']);
      expect(events.every((event) => event.route === '/api/v1/auth/refresh' && event.method === 'POST')).toBe(true);
      expect(events.every((event) => event.requestId === requestId)).toBe(true);
      expect(events[2]).toMatchObject({ status: 200 });
      expect(events[2]?.elapsedMs).toEqual(expect.any(Number));
      expect(JSON.stringify(events)).not.toMatch(/request-secret|response-secret|attacker-value|email|password/i);
    } finally {
      log.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it('does not inject or log a correlation ID when diagnostics are disabled or route differs', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    try {
      vi.stubEnv('REQUEST_STAGE_TIMING', 'false');
      await createAuthProxyHandler({ apiOrigin: 'https://api.example.test', fetchImpl })(
        createRequest({
          url: '/api/v1/auth/refresh',
          query: { path: ['refresh'] },
          headers: { 'x-taskflow-request-id': 'attacker-value' },
        }),
        createResponse(),
      );
      expect(new Headers((fetchImpl.mock.calls[0] as [string, RequestInit])[1].headers).has('x-taskflow-request-id')).toBe(false);
      expect(log).not.toHaveBeenCalled();

      vi.stubEnv('REQUEST_STAGE_TIMING', 'true');
      await createAuthProxyHandler({ apiOrigin: 'https://api.example.test', fetchImpl })(createRequest(), createResponse());
      expect(new Headers((fetchImpl.mock.calls[1] as [string, RequestInit])[1].headers).has('x-taskflow-request-id')).toBe(false);
      expect(log).not.toHaveBeenCalled();

      await createAuthProxyHandler({ apiOrigin: 'https://api.example.test', fetchImpl })(
        createRequest({ url: '/api/v1/auth/refresh', query: { path: ['login'] } }),
        createResponse(),
      );
      expect(new Headers((fetchImpl.mock.calls[2] as [string, RequestInit])[1].headers).has('x-taskflow-request-id')).toBe(false);
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});
