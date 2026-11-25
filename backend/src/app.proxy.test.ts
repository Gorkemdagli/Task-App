import { afterEach, expect, it, vi } from 'vitest';
import type { RequestHandler } from 'express';
import { createApp } from './app';

vi.mock('./env', () => ({ env: { CLIENT_URL: 'https://taskflow.example.com' } }));
vi.mock('./middleware/requestLogger', () => ({
  requestLogger: ((_req, _res, next) => next()) satisfies RequestHandler,
}));
vi.mock('./routes', () => ({ apiRouter: (async () => {}) satisfies RequestHandler }));
vi.mock('./realtime/router', () => ({
  createRealtimeRouter: () => (async () => {}) satisfies RequestHandler,
}));

afterEach(() => vi.unstubAllEnvs());

function clientIp(forwardedFor: string): string | undefined {
  const request = Object.create(createApp().request);
  request.socket = { remoteAddress: '127.0.0.1' };
  request.headers = { 'x-forwarded-for': forwardedFor };
  return request.ip;
}

it('uses the client address supplied by the immediate proxy only', () => {
  vi.stubEnv('TRUST_PROXY_HOPS', '1');
  expect(clientIp('198.51.100.9, 203.0.113.42')).toBe('203.0.113.42');
});

it('ignores forwarded addresses by default', () => {
  vi.stubEnv('TRUST_PROXY_HOPS', undefined);
  expect(clientIp('203.0.113.42')).toBe('127.0.0.1');
});
