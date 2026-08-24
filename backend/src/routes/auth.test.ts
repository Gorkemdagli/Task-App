import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { verifyRefreshToken } from '../lib/jwt';

async function cleanDb() {
  // child tables that Restrict-delete from user must go first
  await prisma.taskComment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.task.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  const k1 = await redis.keys('blacklist:jti:*');
  if (k1.length) await redis.del(...k1);
  const k2 = await redis.keys('session:*');
  if (k2.length) await redis.del(...k2);
  const k3 = await redis.keys('rl:*');
  if (k3.length) await redis.del(...k3);
}

describe('POST /api/v1/auth/register', () => {
  beforeEach(cleanDb);
  it('201 with company', async () => {
    const r = await request(createApp())
      .post('/api/v1/auth/register')
      .send({ fullName: 'Ali', email: 'ali@x.com', password: 'hunter22', companyName: 'Acme' });
    expect(r.status).toBe(201);
    expect(r.body.accessToken).toBeDefined();
    expect(r.body.user.displayId).toMatch(/^[A-Z2-9]{5}$/);
    expect(r.headers['set-cookie']?.[0]).toMatch(/refreshToken=/);
  });

  it('sets refresh cookie max age to the 3-day idle lifetime', async () => {
    const r = await request(createApp())
      .post('/api/v1/auth/register')
      .send({ fullName: 'Aa', email: 'cookie-age@x.com', password: 'hunter22' });
    const maxAge = Number(r.headers['set-cookie']?.[0].match(/Max-Age=(\d+)/)?.[1]);

    expect(maxAge).toBeGreaterThan(3 * 24 * 60 * 60 - 5);
    expect(maxAge).toBeLessThanOrEqual(3 * 24 * 60 * 60);
  });
  it('201 personal', async () => {
    const r = await request(createApp())
      .post('/api/v1/auth/register')
      .send({ fullName: 'Selin', email: 's@x.com', password: 'hunter22' });
    expect(r.status).toBe(201);
  });
  it('409 dup email', async () => {
    await request(createApp())
      .post('/api/v1/auth/register')
      .send({ fullName: 'Aa', email: 'd@x.com', password: 'hunter22' });
    const r = await request(createApp())
      .post('/api/v1/auth/register')
      .send({ fullName: 'Bb', email: 'd@x.com', password: 'hunter22' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('CONFLICT_EMAIL');
  });
  it('409 dup slug', async () => {
    await request(createApp())
      .post('/api/v1/auth/register')
      .send({ fullName: 'Aa', email: 'a@x.com', password: 'hunter22', companyName: 'Acme' });
    const r = await request(createApp())
      .post('/api/v1/auth/register')
      .send({ fullName: 'Bb', email: 'b@x.com', password: 'hunter22', companyName: 'Acme' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('CONFLICT_SLUG');
  });
  it('400 weak password', async () => {
    const r = await request(createApp())
      .post('/api/v1/auth/register')
      .send({ fullName: 'Aa', email: 'a@x.com', password: 'short' });
    expect(r.status).toBe(400);
    expect(r.body.issues?.[0]?.path).toContain('password');
  });
});

describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await cleanDb();
    await request(createApp())
      .post('/api/v1/auth/register')
      .send({ fullName: 'Aa', email: 'a@x.com', password: 'hunter22' });
  });
  it('200', async () => {
    const r = await request(createApp())
      .post('/api/v1/auth/login')
      .send({ email: 'a@x.com', password: 'hunter22' });
    expect(r.status).toBe(200);
    expect(r.body.accessToken).toBeDefined();
  });
  it('401 wrong pw', async () => {
    const r = await request(createApp())
      .post('/api/v1/auth/login')
      .send({ email: 'a@x.com', password: 'wrong' });
    expect(r.status).toBe(401);
    expect(r.body.message).toMatch(/e-posta veya şifre/i);
  });
  it('401 unknown email (same shape)', async () => {
    const r = await request(createApp())
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@x.com', password: 'hunter22' });
    expect(r.status).toBe(401);
    expect(r.body.message).toMatch(/e-posta veya şifre/i);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  beforeEach(cleanDb);
  it('rotates', async () => {
    const reg = await request(createApp())
      .post('/api/v1/auth/register')
      .send({ fullName: 'Aa', email: 'a@x.com', password: 'hunter22' });
    const cookie = reg.headers['set-cookie']![0];
    const r1 = await request(createApp()).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(r1.status).toBe(200);
    expect(r1.body.accessToken).toBeDefined();
    const r2 = await request(createApp()).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(r2.status).toBe(401);
  });
  it('204 no cookie (oturum yok = hata değil)', async () => {
    const r = await request(createApp()).post('/api/v1/auth/refresh');
    expect(r.status).toBe(204);
  });

  it('caps rotated refresh cookie max age at the absolute deadline', async () => {
    const reg = await request(createApp())
      .post('/api/v1/auth/register')
      .send({ fullName: 'Aa', email: 'cookie-deadline@x.com', password: 'hunter22' });
    const cookie = reg.headers['set-cookie']![0];
    const token = cookie.match(/refreshToken=([^;]+)/)![1];
    const payload = verifyRefreshToken(token);
    const deadline = Math.floor(Date.now() / 1000) + 60;
    const record = JSON.parse((await redis.get(`session:${payload.jti}`))!);
    await redis.set(
      `session:${payload.jti}`,
      JSON.stringify({ ...record, sessionExpiresAt: deadline }),
    );

    const refreshed = await request(createApp()).post('/api/v1/auth/refresh').set('Cookie', cookie);
    const maxAge = Number(refreshed.headers['set-cookie']?.[0].match(/Max-Age=(\d+)/)?.[1]);

    expect(refreshed.status).toBe(200);
    expect(maxAge).toBeLessThanOrEqual(60);
  });

  it('clears refresh cookie after absolute session expiry', async () => {
    const reg = await request(createApp())
      .post('/api/v1/auth/register')
      .send({ fullName: 'Aa', email: 'cookie-expired@x.com', password: 'hunter22' });
    const cookie = reg.headers['set-cookie']![0];
    const token = cookie.match(/refreshToken=([^;]+)/)![1];
    const payload = verifyRefreshToken(token);
    const record = JSON.parse((await redis.get(`session:${payload.jti}`))!);
    await redis.set(
      `session:${payload.jti}`,
      JSON.stringify({ ...record, sessionExpiresAt: Math.floor(Date.now() / 1000) - 1 }),
    );

    const expired = await request(createApp()).post('/api/v1/auth/refresh').set('Cookie', cookie);

    expect(expired.status).toBe(401);
    expect(expired.body.error).toBe('SESSION_EXPIRED');
    expect(expired.headers['set-cookie']?.[0]).toMatch(/refreshToken=;/);
  });
});

describe('POST /api/v1/auth/logout', () => {
  beforeEach(cleanDb);
  it('204', async () => {
    const reg = await request(createApp())
      .post('/api/v1/auth/register')
      .send({ fullName: 'Aa', email: 'a@x.com', password: 'hunter22' });
    const r = await request(createApp())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${reg.body.accessToken}`);
    expect(r.status).toBe(204);
    expect(r.headers['set-cookie']?.[0]).toMatch(/refreshToken=;/);
  });
  it('401 no auth', async () => {
    const r = await request(createApp()).post('/api/v1/auth/logout');
    expect(r.status).toBe(401);
  });

  it('clears the refresh session when the access token is stale', async () => {
    const reg = await request(createApp())
      .post('/api/v1/auth/register')
      .send({ fullName: 'Aa', email: 'stale-logout@x.com', password: 'hunter22' });
    const refreshCookie = reg.headers['set-cookie']![0];

    const logoutResponse = await request(createApp())
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer stale-access-token')
      .set('Cookie', refreshCookie);

    expect(logoutResponse.status).toBe(204);
    expect(
      (await request(createApp()).post('/api/v1/auth/refresh').set('Cookie', refreshCookie)).status,
    ).toBe(401);
  });

  it('rejects access and refresh token reuse after logout', async () => {
    const reg = await request(createApp())
      .post('/api/v1/auth/register')
      .send({ fullName: 'Aa', email: 'reuse@x.com', password: 'hunter22' });
    const refreshCookie = reg.headers['set-cookie']![0];

    const logoutResponse = await request(createApp())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .set('Cookie', refreshCookie);
    expect(logoutResponse.status).toBe(204);

    expect(
      (
        await request(createApp())
          .get('/api/v1/users/me')
          .set('Authorization', `Bearer ${reg.body.accessToken}`)
      ).status,
    ).toBe(401);

    expect(
      (await request(createApp()).post('/api/v1/auth/refresh').set('Cookie', refreshCookie)).status,
    ).toBe(401);
  });
});
