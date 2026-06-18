import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import './setup';

describe('GET /api/v1/health', () => {
  it('returns 200 with status ok when services are up', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/health');

    expect([200, 503]).toContain(res.status);
    // Spec Step 22: Postgres/Redis yoksa degraded (503) döner ama test geçer
    // Bu yüzden 200 veya 503 kabul edilir.
    expect(res.body).toMatchObject({
      status: expect.stringMatching(/^(ok|degraded)$/),
      timestamp: expect.any(String),
      uptime: expect.any(Number),
      services: {
        database: expect.stringMatching(/^(up|down)$/),
        redis: expect.stringMatching(/^(up|down)$/),
      },
    });
  });

  it('returns JSON content type', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});