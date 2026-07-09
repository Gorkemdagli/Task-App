import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { register, login, refresh, logout, isTokenBlacklisted } from './auth.service';

async function cleanDb() {
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  const keys = await redis.keys('blacklist:jti:*');
  if (keys.length) await redis.del(...keys);
}

describe('register', () => {
  beforeEach(cleanDb);
  it('creates user with personal tenant', async () => {
    const r = await register({ fullName: 'Ali', email: 'ali@test.com', password: 'hunter22' });
    expect(r.user.email).toBe('ali@test.com');
    expect(r.user.role).toBe('companyAdmin');
    expect(r.user.displayId).toMatch(/^[A-Z2-9]{5}$/);
    expect(r.accessToken).toBeDefined();
  });
  it('creates tenant with company', async () => {
    const r = await register({
      fullName: 'Selin',
      email: 'selin@acme.com',
      password: 'hunter22',
      companyName: 'Acme Corp',
    });
    const tenant = await prisma.tenant.findUnique({ where: { id: r.user.tenantId } });
    expect(tenant?.name).toBe('Acme Corp');
    expect(tenant?.slug).toBe('acme-corp');
  });
  it('409 on duplicate email', async () => {
    await register({ fullName: 'A', email: 'dup@x.com', password: 'hunter22' });
    await expect(
      register({ fullName: 'B', email: 'dup@x.com', password: 'hunter22' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT_EMAIL' });
  });
  it('409 on duplicate slug', async () => {
    await register({ fullName: 'A', email: 'a@x.com', password: 'hunter22', companyName: 'Acme' });
    await expect(
      register({ fullName: 'B', email: 'b@x.com', password: 'hunter22', companyName: 'Acme' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT_SLUG' });
  });
});

describe('login', () => {
  beforeEach(async () => {
    await cleanDb();
    await register({ fullName: 'A', email: 'a@x.com', password: 'hunter22' });
  });
  it('success', async () => {
    const r = await login({ email: 'a@x.com', password: 'hunter22' });
    expect(r.accessToken).toBeDefined();
  });
  it('401 wrong password', async () => {
    await expect(login({ email: 'a@x.com', password: 'wrong' })).rejects.toMatchObject({
      statusCode: 401,
    });
  });
  it('401 unknown email (same shape)', async () => {
    await expect(login({ email: 'nobody@x.com', password: 'hunter22' })).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});

describe('refresh', () => {
  beforeEach(cleanDb);
  it('rotates and blacklists old jti', async () => {
    const reg = await register({ fullName: 'A', email: 'a@x.com', password: 'hunter22' });
    const oldJti = JSON.parse(Buffer.from(reg.refreshToken.split('.')[1], 'base64').toString()).jti;
    const r = await refresh(reg.refreshToken);
    expect(r.accessToken).toBeDefined();
    expect(await isTokenBlacklisted(oldJti)).toBe(true);
  });
  it('401 on already-rotated', async () => {
    const reg = await register({ fullName: 'A', email: 'a@x.com', password: 'hunter22' });
    await refresh(reg.refreshToken);
    await expect(refresh(reg.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('logout', () => {
  beforeEach(cleanDb);
  it('blacklists access jti', async () => {
    const reg = await register({ fullName: 'A', email: 'a@x.com', password: 'hunter22' });
    const jti = JSON.parse(Buffer.from(reg.accessToken.split('.')[1], 'base64').toString()).jti;
    await logout(reg.accessToken);
    expect(await isTokenBlacklisted(jti)).toBe(true);
  });
});
