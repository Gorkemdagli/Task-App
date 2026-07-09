import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { requireAuth } from './auth';
import { errorHandler } from './errorHandler';
import { register } from '../services/auth.service';
import { signAccessToken } from '../lib/jwt';

async function cleanDb() {
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  const k = await redis.keys('blacklist:jti:*');
  if (k.length) await redis.del(...k);
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
    await register({ fullName: 'A', email: 'a@x.com', password: 'hunter22' });
    const u = await prisma.user.findUnique({ where: { email: 'a@x.com' } });
    const tok = signAccessToken(u!.id, u!.tenantId);
    const app = express();
    let captured: { email?: string } | null = null;
    app.get('/p', requireAuth, (req, r) => {
      captured = req.user;
      r.json({});
    });
    expect((await request(app).get('/p').set('Authorization', `Bearer ${tok}`)).status).toBe(200);
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
});
