import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app';
import { env } from './env';
import './test/setup';

describe('CORS', () => {
  it('caches allowed GET preflights and preserves requested headers', async () => {
    const response = await request(createApp())
      .options('/api/v1/users/me')
      .set('Origin', env.CLIENT_URL)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization,if-none-match');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(env.CLIENT_URL);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-max-age']).toBe('600');
    expect(
      response.headers['access-control-allow-methods']
        .split(',')
        .map((method: string) => method.trim()),
    ).toContain('GET');
    expect(
      response.headers['access-control-allow-headers']
        .split(',')
        .map((header: string) => header.trim().toLowerCase()),
    ).toEqual(expect.arrayContaining(['authorization', 'if-none-match']));
    expect(
      response.headers.vary.split(',').map((value: string) => value.trim().toLowerCase()),
    ).toEqual(expect.arrayContaining(['origin', 'access-control-request-headers']));
  });

  it('does not grant an unconfigured origin browser access', async () => {
    const disallowedOrigin = 'https://attacker.example';
    const response = await request(createApp())
      .options('/api/v1/users/me')
      .set('Origin', disallowedOrigin)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization,if-none-match');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(env.CLIENT_URL);
    expect(response.headers['access-control-allow-origin']).not.toBe(disallowedOrigin);
    expect(response.headers['access-control-allow-origin']).not.toBe('*');
    expect(response.headers.vary.toLowerCase()).toContain('origin');
  });

  it('keeps protected GET authentication required with If-None-Match', async () => {
    const response = await request(createApp())
      .get('/api/v1/users/me')
      .set('Origin', env.CLIENT_URL)
      .set('If-None-Match', '"cached"');

    expect(response.status).toBe(401);
  });
});
