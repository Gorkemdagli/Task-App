import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

async function cleanDb() {
  await prisma.taskComment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.task.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  const keys = await redis.keys('*');
  if (keys.length) await redis.del(...keys);
}

async function registerUser(overrides: Record<string, string> = {}) {
  return request(createApp())
    .post('/api/v1/auth/register')
    .send({ fullName: 'Ali', email: 'ali-me@example.com', password: 'hunter22', ...overrides });
}

describe('GET /api/v1/users/me', () => {
  beforeEach(cleanDb);

  it('returns the canonical authenticated user and tenant name', async () => {
    const registerResponse = await registerUser({ companyName: 'Acme Me' });

    const response = await request(createApp())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${registerResponse.body.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: registerResponse.body.user.id,
      displayId: registerResponse.body.user.displayId,
      email: 'ali-me@example.com',
      fullName: 'Ali',
      role: 'companyAdmin',
      tenantId: registerResponse.body.user.tenantId,
      tenantName: 'Acme Me',
    });
  });

  it('returns current database values instead of stale token-time values', async () => {
    const registerResponse = await registerUser({
      email: 'canonical@example.com',
      fullName: 'Before',
    });

    await prisma.user.update({
      where: { id: registerResponse.body.user.id },
      data: { fullName: 'After' },
    });

    const response = await request(createApp())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${registerResponse.body.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.fullName).toBe('After');
    expect(response.body.tenantId).toBeNull();
    expect(response.body.tenantName).toBeNull();
  });

  it('rejects a request without an access token', async () => {
    expect((await request(createApp()).get('/api/v1/users/me')).status).toBe(401);
  });

  it('rejects a malformed access token', async () => {
    expect(
      (await request(createApp()).get('/api/v1/users/me').set('Authorization', 'Bearer not.a.jwt'))
        .status,
    ).toBe(401);
  });

  it('rejects a blacklisted access token', async () => {
    const registerResponse = await registerUser({ email: 'blacklisted@example.com' });
    const payload = JSON.parse(
      Buffer.from(registerResponse.body.accessToken.split('.')[1], 'base64').toString(),
    );
    await redis.set(`blacklist:jti:${payload.jti}`, '1', 'EX', 60);

    expect(
      (
        await request(createApp())
          .get('/api/v1/users/me')
          .set('Authorization', `Bearer ${registerResponse.body.accessToken}`)
      ).status,
    ).toBe(401);
  });

  it('rejects an access token whose user was deleted', async () => {
    const registerResponse = await registerUser({ email: 'deleted@example.com' });
    await prisma.user.delete({ where: { id: registerResponse.body.user.id } });

    expect(
      (
        await request(createApp())
          .get('/api/v1/users/me')
          .set('Authorization', `Bearer ${registerResponse.body.accessToken}`)
      ).status,
    ).toBe(401);
  });
});
