import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const state = vi.hoisted(() => ({
  database: vi.fn(),
  redis: vi.fn(),
  redisCall: vi.fn().mockResolvedValue('script-sha'),
}));

vi.mock('../lib/prisma', () => ({
  prisma: { $queryRaw: state.database },
}));
vi.mock('../lib/redis', () => ({
  redis: { ping: state.redis, call: state.redisCall },
}));

import { createApp } from '../app';

describe('GET /api/v1/ready', () => {
  beforeEach(() => {
    state.database.mockReset().mockResolvedValue([{ '?column?': 1 }]);
    state.redis.mockReset().mockResolvedValue('PONG');
    state.redisCall.mockReset().mockResolvedValue('0');
  });

  it('returns ready when database and Redis are available', async () => {
    const response = await request(createApp()).get('/api/v1/ready');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ready',
      services: { database: 'up', redis: 'up' },
    });
  });

  it('returns 503 when a dependency is unavailable', async () => {
    state.redis.mockRejectedValue(new Error('redis unavailable'));

    const response = await request(createApp()).get('/api/v1/ready');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: 'not_ready',
      services: { database: 'up', redis: 'down' },
    });
  });
});
