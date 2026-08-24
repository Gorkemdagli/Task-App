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
  const response = {
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
  } satisfies ProxyResponse & { body: unknown };
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
    expect(Buffer.from(init.body as Uint8Array).toString()).toBe(
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
});
