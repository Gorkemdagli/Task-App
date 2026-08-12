import { describe, it, expect, beforeEach } from 'vitest';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { redis } from '../lib/redis';
import { createRateLimit } from './rateLimit';
import { RATE_LIMIT_PROFILES, authenticatedReadLimiter, uploadLimiter } from './rateLimitProfiles';

describe('createRateLimit', () => {
  beforeEach(async () => {
    const k = await redis.keys('test:rl:*');
    const readKeys = await redis.keys('rl:read:*');
    const uploadKeys = await redis.keys('rl:upload:*');
    const keys = [...k, ...readKeys, ...uploadKeys];
    if (keys.length) await redis.del(...keys);
  });
  it('allows under limit', async () => {
    const app = express();
    const lim = createRateLimit({ windowMs: 60_000, max: 3, keyPrefix: 'test:rl:1' });
    app.use(lim);
    app.get('/x', (_q, r) => r.json({ ok: true }));
    for (let i = 0; i < 3; i++) expect((await request(app).get('/x')).status).toBe(200);
  });
  it('429 over limit', async () => {
    const app = express();
    const lim = createRateLimit({ windowMs: 60_000, max: 2, keyPrefix: 'test:rl:2' });
    app.use(lim);
    app.get('/x', (_q, r) => r.json({ ok: true }));
    await request(app).get('/x');
    await request(app).get('/x');
    const r3 = await request(app).get('/x');
    expect(r3.status).toBe(429);
    expect(r3.body).toMatchObject({ error: 'Too Many Requests' });
  });

  it('defines the exact R3 limits', () => {
    expect(RATE_LIMIT_PROFILES).toMatchObject({
      register: { windowMs: 60_000, max: 5 },
      login: { windowMs: 60_000, max: 10 },
      refresh: { windowMs: 60_000, max: 30 },
      authenticatedRead: { windowMs: 60_000, max: 120 },
      write: { windowMs: 60_000, max: 30 },
      upload: { windowMs: 60_000, max: 10 },
    });
  });

  it('isolates protected quota by authenticated user', async () => {
    const app = express();
    app.use(((req, _res, next) => {
      req.user = {
        id: String(req.headers['x-test-user']),
        displayId: 'ABCDE',
        email: 'u@example.com',
        fullName: 'User',
        role: 'member',
        tenantId: null,
        tenantName: null,
      };
      next();
    }) as RequestHandler);
    app.get('/x', authenticatedReadLimiter, (_req, res) => res.json({ ok: true }));

    for (let i = 0; i < 120; i++) {
      expect((await request(app).get('/x').set('x-test-user', 'u1')).status).toBe(200);
    }
    expect((await request(app).get('/x').set('x-test-user', 'u1')).status).toBe(429);
    expect((await request(app).get('/x').set('x-test-user', 'u2')).status).toBe(200);
  });

  it('enforces the upload profile at 10/minute', async () => {
    const app = express();
    app.post('/upload', uploadLimiter, (_req, res) => res.status(204).end());
    for (let i = 0; i < 10; i++) {
      expect((await request(app).post('/upload')).status).toBe(204);
    }
    expect((await request(app).post('/upload')).status).toBe(429);
  });
});
