import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { register, login, refresh, logout, isTokenBlacklisted } from './auth.service';
import { verifyAccessToken, verifyRefreshToken } from '../lib/jwt';

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
  const bk = await redis.keys('blacklist:jti:*');
  if (bk.length) await redis.del(...bk);
  const sk = await redis.keys('session:*');
  if (sk.length) await redis.del(...sk);
  const ak = await redis.keys('access-session:*');
  if (ak.length) await redis.del(...ak);
  const uk = await redis.keys('user-sessions:*');
  if (uk.length) await redis.del(...uk);
}

describe('register', () => {
  beforeEach(cleanDb);
  it('creates tenantless member without company', async () => {
    const r = await register({ fullName: 'Ali', email: 'ali@test.com', password: 'hunter22' });
    expect(r.user.email).toBe('ali@test.com');
    expect(r.user.tenantId).toBeNull();
    expect(r.user.role).toBe('member');
    expect(r.user.displayId).toMatch(/^[A-Z2-9]{5}$/);
    expect(r.accessToken).toBeDefined();
    const accessJti = verifyAccessToken(r.accessToken).jti;
    const refreshJti = verifyRefreshToken(r.refreshToken).jti;
    expect(await redis.exists(`access-session:${accessJti}`)).toBe(1);
    expect(await redis.sismember(`user-sessions:${r.user.id}`, `session:${refreshJti}`)).toBe(1);
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
    expect(tenant?.nameKey).toBe('acme-corp');
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
  it('409 on duplicate normalized company name', async () => {
    await register({
      fullName: 'A',
      email: 'normalized-a@x.com',
      password: 'hunter22',
      companyName: 'Acme  Corp',
    });
    await expect(
      register({
        fullName: 'B',
        email: 'normalized-b@x.com',
        password: 'hunter22',
        companyName: ' acme corp ',
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT_SLUG' });
  });
});

describe('login', () => {
  beforeEach(async () => {
    await cleanDb();
    await register({ fullName: 'A', email: 'a@x.com', password: 'hunter22' });
  });
  it('success includes tenant name', async () => {
    await prisma.tenant.create({
      data: {
        name: 'Acme Corp',
        slug: 'acme-corp',
        nameKey: 'acme-corp',
        users: { connect: { email: 'a@x.com' } },
      },
    });
    const r = await login({ email: 'a@x.com', password: 'hunter22' });
    expect(r.accessToken).toBeDefined();
    expect(r.user.tenantName).toBe('Acme Corp');
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

  it('rotates the refresh session and rejects replay of the old token', async () => {
    const registered = await register({
      fullName: 'Rotate',
      email: 'rotate@example.com',
      password: 'hunter22',
    });
    const oldPayload = verifyRefreshToken(registered.refreshToken);

    const rotated = await refresh(registered.refreshToken);
    const newPayload = verifyRefreshToken(rotated.refreshToken);

    expect(newPayload.jti).not.toBe(oldPayload.jti);
    expect(await redis.exists(`session:${oldPayload.jti}`)).toBe(0);
    expect(
      await redis.sismember(`user-sessions:${registered.user.id}`, `session:${oldPayload.jti}`),
    ).toBe(0);
    expect(await redis.exists(`blacklist:jti:${oldPayload.jti}`)).toBe(1);
    expect(await redis.exists(`session:${newPayload.jti}`)).toBe(1);
    expect(
      await redis.sismember(`user-sessions:${registered.user.id}`, `session:${newPayload.jti}`),
    ).toBe(1);
    await expect(refresh(registered.refreshToken)).rejects.toMatchObject({
      statusCode: 401,
      code: 'TOKEN_REVOKED',
    });
  });

  it('rejects a signed refresh token whose Redis session is missing', async () => {
    const registered = await register({
      fullName: 'Missing',
      email: 'missing-session@example.com',
      password: 'hunter22',
    });
    const payload = verifyRefreshToken(registered.refreshToken);
    await redis.del(`session:${payload.jti}`);

    await expect(refresh(registered.refreshToken)).rejects.toMatchObject({
      statusCode: 401,
      code: 'TOKEN_REVOKED',
    });
  });

  it('preserves the absolute deadline while rotating refresh tokens', async () => {
    const registered = await register({
      fullName: 'Absolute',
      email: 'absolute@x.com',
      password: 'hunter22',
    });
    const original = verifyRefreshToken(registered.refreshToken);
    const originalRecord = JSON.parse((await redis.get(`session:${original.jti}`))!);

    const rotated = await refresh(registered.refreshToken);
    const next = verifyRefreshToken(rotated.refreshToken);
    const nextRecord = JSON.parse((await redis.get(`session:${next.jti}`))!);

    expect(nextRecord.familyId).toBe(originalRecord.familyId);
    expect(nextRecord.sessionExpiresAt).toBe(originalRecord.sessionExpiresAt);
    expect(next.exp - next.iat).toBeLessThanOrEqual(3 * 24 * 60 * 60);
  });

  it('rejects refresh after the absolute session deadline', async () => {
    const registered = await register({
      fullName: 'Expired',
      email: 'expired@x.com',
      password: 'hunter22',
    });
    const payload = verifyRefreshToken(registered.refreshToken);
    const recordKey = `session:${payload.jti}`;
    const record = JSON.parse((await redis.get(recordKey))!);
    await redis.set(
      recordKey,
      JSON.stringify({ ...record, sessionExpiresAt: Math.floor(Date.now() / 1000) - 1 }),
    );

    await expect(refresh(registered.refreshToken)).rejects.toMatchObject({
      statusCode: 401,
      code: 'SESSION_EXPIRED',
    });
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

  it('revokes access and deletes the refresh session', async () => {
    const registered = await register({
      fullName: 'Logout',
      email: 'logout-session@example.com',
      password: 'hunter22',
    });
    const accessPayload = verifyAccessToken(registered.accessToken);
    const refreshPayload = verifyRefreshToken(registered.refreshToken);

    await logout(registered.accessToken, registered.refreshToken);

    expect(await redis.exists(`blacklist:jti:${accessPayload.jti}`)).toBe(1);
    expect(await redis.exists(`access-session:${accessPayload.jti}`)).toBe(0);
    expect(await redis.exists(`session:${refreshPayload.jti}`)).toBe(0);
    expect(
      await redis.sismember(`user-sessions:${registered.user.id}`, `session:${refreshPayload.jti}`),
    ).toBe(0);
  });
});
