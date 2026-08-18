import { beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
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
      avatarUrl: null,
      notifyTaskAssigned: true,
      notifyTaskCommented: true,
      notifyMessageReceived: true,
    });
  });

  it('creates users with all notification preferences enabled', async () => {
    const registerResponse = await registerUser({ email: 'defaults@example.com' });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: registerResponse.body.user.id },
    });

    expect(user).toMatchObject({
      notifyTaskAssigned: true,
      notifyTaskCommented: true,
      notifyMessageReceived: true,
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

describe('PATCH /api/v1/users/me', () => {
  beforeEach(cleanDb);

  it('updates profile fields and returns canonical data', async () => {
    const registerResponse = await registerUser({ email: 'update-me@example.com' });

    const response = await request(createApp())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${registerResponse.body.accessToken}`)
      .send({
        fullName: '  Updated Name  ',
        notifyTaskAssigned: false,
        notifyMessageReceived: false,
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: registerResponse.body.user.id,
      fullName: 'Updated Name',
      email: 'update-me@example.com',
      notifyTaskAssigned: false,
      notifyTaskCommented: true,
      notifyMessageReceived: false,
    });
    expect(response.body.sessionRevoked).toBeUndefined();
  });

  it('rejects credential changes with a wrong current password', async () => {
    const registerResponse = await registerUser({ email: 'wrong-password@example.com' });

    const response = await request(createApp())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${registerResponse.body.accessToken}`)
      .send({ email: 'changed@example.com', currentPassword: 'wrong-password' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_CURRENT_PASSWORD');
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: registerResponse.body.user.id } })).email,
    ).toBe('wrong-password@example.com');
  });

  it('revokes the current access session after an email change', async () => {
    const registerResponse = await registerUser({ email: 'revoke-me@example.com' });

    const response = await request(createApp())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${registerResponse.body.accessToken}`)
      .send({ email: 'revoked@example.com', currentPassword: 'hunter22' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sessionRevoked: true });
    expect(response.headers['set-cookie']?.[0]).toMatch(/refreshToken=;/);
    expect(
      (
        await request(createApp())
          .get('/api/v1/users/me')
          .set('Authorization', `Bearer ${registerResponse.body.accessToken}`)
      ).status,
    ).toBe(401);
  });

  it('rejects immutable profile fields', async () => {
    const registerResponse = await registerUser({ email: 'immutable-me@example.com' });

    const response = await request(createApp())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${registerResponse.body.accessToken}`)
      .send({ displayId: 'ABCDE' });

    expect(response.status).toBe(400);
  });
});

describe('POST /api/v1/users/me/avatar', () => {
  beforeEach(cleanDb);

  it('rejects a declared MIME mismatch before storage', async () => {
    const registerResponse = await registerUser({ email: 'avatar-route@example.com' });
    const image = await sharp({
      create: { width: 20, height: 20, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();

    const response = await request(createApp())
      .post('/api/v1/users/me/avatar')
      .set('Authorization', `Bearer ${registerResponse.body.accessToken}`)
      .attach('avatar', image, 'avatar.jpg');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_IMAGE');
  });

  it('returns sanitized storage failure without changing profile', async () => {
    const registerResponse = await registerUser({ email: 'avatar-storage@example.com' });
    const image = await sharp({
      create: { width: 20, height: 20, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();

    const response = await request(createApp())
      .post('/api/v1/users/me/avatar')
      .set('Authorization', `Bearer ${registerResponse.body.accessToken}`)
      .attach('avatar', image, 'avatar.png');

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: 'MEDIA_UPLOAD_FAILED',
      message: 'Media storage is not configured',
    });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: registerResponse.body.user.id } }))
        .avatarUrl,
    ).toBeNull();
  });
});
