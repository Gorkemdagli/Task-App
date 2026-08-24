import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import './setup';

describe('GET /api/v1/health', () => {
  it('returns 200 with status ok when services are up', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      timestamp: expect.any(String),
      uptime: expect.any(Number),
      release: expect.any(String),
    });
  });

  it('does not contact database or Redis', async () => {
    const databaseSpy = vi.spyOn(prisma, '$queryRaw');
    const redisSpy = vi.spyOn(redis, 'ping');

    await request(createApp()).get('/api/v1/health');

    expect(databaseSpy).not.toHaveBeenCalled();
    expect(redisSpy).not.toHaveBeenCalled();
    databaseSpy.mockRestore();
    redisSpy.mockRestore();
  });

  it('returns JSON content type', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('reports the Render deploy commit when available', async () => {
    vi.stubEnv('RENDER_GIT_COMMIT', 'render-sha');

    try {
      const res = await request(createApp()).get('/api/v1/health');

      expect(res.body.release).toBe('render-sha');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
