import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { requireAuth } from './auth';
import { errorHandler } from './errorHandler';
import { register } from '../services/auth.service';

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
  const k = await redis.keys('blacklist:jti:*');
  if (k.length) await redis.del(...k);
  const ak = await redis.keys('access-session:*');
  if (ak.length) await redis.del(...ak);
  const sk = await redis.keys('session:*');
  if (sk.length) await redis.del(...sk);
  const uk = await redis.keys('user-sessions:*');
  if (uk.length) await redis.del(...uk);
}

function buildApp(handler: express.RequestHandler) {
  const app = express();
  app.get('/p', handler);
  app.use(errorHandler);
  return app;
}

describe('requireAuth', () => {
  beforeEach(cleanDb);
  it('401 without header', async () => {
    const app = buildApp(requireAuth);
    expect((await request(app).get('/p')).status).toBe(401);
  });
  it('401 non-Bearer', async () => {
    const app = buildApp(requireAuth);
    expect((await request(app).get('/p').set('Authorization', 'Basic x')).status).toBe(401);
  });
  it('401 tampered token', async () => {
    const app = buildApp(requireAuth);
    expect((await request(app).get('/p').set('Authorization', 'Bearer not.a.jwt')).status).toBe(
      401,
    );
  });
  it('populates req.user for valid token', async () => {
    const registered = await register({ fullName: 'A', email: 'a@x.com', password: 'hunter22' });
    const app = express();
    let captured: { email?: string } | null = null;
    app.get('/p', requireAuth, (req, r) => {
      captured = req.user;
      r.json({});
    });
    expect(
      (await request(app).get('/p').set('Authorization', `Bearer ${registered.accessToken}`))
        .status,
    ).toBe(200);
    expect(captured.email).toBe('a@x.com');
  });
  it('401 blacklisted jti', async () => {
    const reg = await register({ fullName: 'A', email: 'a@x.com', password: 'hunter22' });
    const j = JSON.parse(Buffer.from(reg.accessToken.split('.')[1], 'base64').toString());
    await redis.set(`blacklist:jti:${j.jti}`, '1', 'EX', 60);
    const app = buildApp(requireAuth);
    const r = await request(app).get('/p').set('Authorization', `Bearer ${reg.accessToken}`);
    expect(r.status).toBe(401);
    expect(r.body.message).toMatch(/sonlandırılmış/i);
  });

  it('401 access token whose indexed session is missing', async () => {
    const registered = await register({
      fullName: 'A',
      email: 'missing-access@x.com',
      password: 'hunter22',
    });
    const payload = JSON.parse(
      Buffer.from(registered.accessToken.split('.')[1], 'base64').toString(),
    );
    await redis.del(`access-session:${payload.jti}`);

    const app = buildApp(requireAuth);
    expect(
      (await request(app).get('/p').set('Authorization', `Bearer ${registered.accessToken}`))
        .status,
    ).toBe(401);
  });
});
