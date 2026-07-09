import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRateLimit } from './rateLimit';

describe('createRateLimit', () => {
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
});
