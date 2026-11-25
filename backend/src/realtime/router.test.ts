import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { register } from '../services/auth.service';
import { revokeAllUserSessions } from '../lib/sessionStore';
import '../test/setup';

describe('realtime ticket route', () => {
  let userId: string | undefined;
  let tenantId: string | null | undefined;

  beforeEach(async () => {
    const keys = await redis.keys('realtime-ticket:*');
    if (keys.length) await redis.del(...keys);
  });

  afterEach(async () => {
    if (!userId) return;
    await revokeAllUserSessions(userId);
    await prisma.user.deleteMany({ where: { id: userId } });
    if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
    userId = undefined;
    tenantId = undefined;
  });

  it('returns 404 while disabled before requiring authentication and keeps GET unavailable', async () => {
    const app = createApp(false);

    expect((await request(app).post('/api/v1/realtime/ticket')).status).toBe(404);
    expect((await request(app).get('/api/v1/realtime/ws')).status).toBe(404);
  });

  it('requires HTTP authentication and issues a no-store ticket bound to the active session', async () => {
    const app = createApp(true);
    expect((await request(app).post('/api/v1/realtime/ticket')).status).toBe(401);

    const registered = await register({
      fullName: 'Realtime Test',
      email: `realtime-${Date.now()}@example.test`,
      password: 'realtime-test-pass',
      companyName: `Realtime Test ${Date.now()}`,
    });
    userId = registered.user.id;
    tenantId = registered.user.tenantId;

    const response = await request(app)
      .post('/api/v1/realtime/ticket')
      .set('Authorization', `Bearer ${registered.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({ expiresIn: 30 });
    expect(response.body.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
