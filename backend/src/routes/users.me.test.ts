import { beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import sharp from 'sharp';
import request from 'supertest';
import { createApp } from '../app';
import { env } from '../env';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import type * as MediaStorage from '../lib/mediaStorage';

declare module 'vitest' {
  export interface ProvidedContext {
    taskflowAppPassword: string;
  }
}

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

async function withRestrictedRuntimeApp<T>(run: (app: ReturnType<typeof createApp>) => Promise<T>) {
  const appUrl = new URL(env.DATABASE_URL);
  appUrl.username = 'taskflow_app';
  appUrl.password = inject('taskflowAppPassword');
  const runtimePrisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: appUrl.toString(), max: 1 }),
  });
  const mediaAdapter = {
    upload: vi.fn().mockResolvedValue(undefined),
    getPublicUrl: vi.fn(
      (path: string) => `https://storage.test/storage/v1/object/public/taskflow-media/${path}`,
    ),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  vi.doMock('../lib/prisma', () => ({ prisma: runtimePrisma }));
  vi.doMock('../lib/mediaStorage', async (importOriginal) => {
    const actual = await importOriginal<typeof MediaStorage>();
    return { ...actual, createMediaStorage: () => actual.createMediaStorage(mediaAdapter) };
  });
  vi.resetModules();
  try {
    const { createApp: createRestrictedApp } = await import('../app');
    return await run(createRestrictedApp());
  } finally {
    vi.doUnmock('../lib/prisma');
    vi.doUnmock('../lib/mediaStorage');
    vi.resetModules();
    await runtimePrisma.$disconnect();
  }
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
      tenantLogoUrl: null,
      avatarUrl: null,
      notifyTaskAssigned: true,
      notifyTaskCommented: true,
      notifyMessageReceived: true,
    });
  });

  it('serves /users/me under the restricted runtime role', async () => {
    const current = await registerUser({
      fullName: 'RLS Profile User',
      email: 'rls-profile@example.com',
      companyName: 'RLS Profile Tenant',
    });
    const other = await registerUser({
      fullName: 'Other RLS User',
      email: 'other-rls-profile@example.com',
      companyName: 'Other RLS Tenant',
    });
    const tenantless = await registerUser({
      fullName: 'Tenantless RLS User',
      email: 'tenantless-rls-profile@example.com',
    });
    const currentLogo = 'https://storage.test/logos/current-rls.webp';
    const otherLogo = 'https://storage.test/logos/other-rls.webp';
    await prisma.tenant.update({
      where: { id: current.body.user.tenantId },
      data: { logoUrl: currentLogo },
    });
    await prisma.tenant.update({
      where: { id: other.body.user.tenantId },
      data: { logoUrl: otherLogo },
    });

    const appUrl = new URL(env.DATABASE_URL);
    appUrl.username = 'taskflow_app';
    appUrl.password = inject('taskflowAppPassword');
    const runtimePrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: appUrl.toString(), max: 1 }),
    });
    vi.doMock('../lib/prisma', () => ({ prisma: runtimePrisma }));
    vi.resetModules();
    try {
      const { getCurrentProfile } = await import('../services/profile.service');
      const { createApp: createRestrictedApp } = await import('../app');
      await expect(getCurrentProfile(current.body.user.id)).resolves.toMatchObject({
        id: current.body.user.id,
        fullName: 'RLS Profile User',
        tenantName: 'RLS Profile Tenant',
        tenantLogoUrl: currentLogo,
      });
      await expect(getCurrentProfile(other.body.user.id)).resolves.toMatchObject({
        id: other.body.user.id,
        tenantName: 'Other RLS Tenant',
        tenantLogoUrl: otherLogo,
      });
      await expect(getCurrentProfile(tenantless.body.user.id)).resolves.toMatchObject({
        id: tenantless.body.user.id,
        tenantId: null,
        tenantName: null,
        tenantLogoUrl: null,
      });

      const currentResponse = await request(createRestrictedApp())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${current.body.accessToken}`);
      const tenantlessResponse = await request(createRestrictedApp())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${tenantless.body.accessToken}`);

      expect(currentResponse.status).toBe(200);
      expect(currentResponse.body).toMatchObject({
        id: current.body.user.id,
        fullName: 'RLS Profile User',
        tenantName: 'RLS Profile Tenant',
        tenantLogoUrl: currentLogo,
      });
      expect(tenantlessResponse.status).toBe(200);
      expect(tenantlessResponse.body).toMatchObject({
        id: tenantless.body.user.id,
        fullName: 'Tenantless RLS User',
        tenantId: null,
        tenantName: null,
        tenantLogoUrl: null,
      });
    } finally {
      vi.doUnmock('../lib/prisma');
      vi.resetModules();
      await runtimePrisma.$disconnect();
    }
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
    expect(response.body.tenantLogoUrl).toBeNull();
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

  it('updates the authenticated profile under the restricted runtime role', async () => {
    const company = await registerUser({
      fullName: 'Before Company User',
      email: 'restricted-update-company@example.com',
      companyName: 'Restricted Update Tenant',
    });
    const tenantless = await registerUser({
      fullName: 'Before Personal User',
      email: 'restricted-update-personal@example.com',
    });
    const other = await registerUser({
      fullName: 'Unchanged Other User',
      email: 'restricted-update-other@example.com',
      companyName: 'Other Update Tenant',
    });
    const companyLogo = 'https://storage.test/logos/restricted-update.webp';
    await prisma.tenant.update({
      where: { id: company.body.user.tenantId },
      data: { logoUrl: companyLogo },
    });

    await withRestrictedRuntimeApp(async (app) => {
      const companyResponse = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${company.body.accessToken}`)
        .send({ fullName: 'Updated Company User', notifyTaskAssigned: false });
      const tenantlessResponse = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${tenantless.body.accessToken}`)
        .send({ fullName: 'Updated Personal User' });

      expect(companyResponse.status).toBe(200);
      expect(companyResponse.body).toMatchObject({
        id: company.body.user.id,
        fullName: 'Updated Company User',
        tenantId: company.body.user.tenantId,
        tenantName: 'Restricted Update Tenant',
        tenantLogoUrl: companyLogo,
      });
      expect(tenantlessResponse.status).toBe(200);
      expect(tenantlessResponse.body).toMatchObject({
        id: tenantless.body.user.id,
        fullName: 'Updated Personal User',
        tenantId: null,
        tenantName: null,
        tenantLogoUrl: null,
      });
    });

    expect(await prisma.user.findUniqueOrThrow({ where: { id: other.body.user.id } })).toMatchObject({
      fullName: 'Unchanged Other User',
    });
  });

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

  it('updates only the authenticated avatar under the restricted runtime role', async () => {
    const company = await registerUser({
      fullName: 'Restricted Avatar Company',
      email: 'restricted-avatar-company@example.com',
      companyName: 'Restricted Avatar Tenant',
    });
    const tenantless = await registerUser({
      fullName: 'Restricted Avatar Personal',
      email: 'restricted-avatar-personal@example.com',
    });
    const other = await registerUser({
      fullName: 'Unchanged Avatar User',
      email: 'restricted-avatar-other@example.com',
    });
    const image = await sharp({
      create: { width: 20, height: 20, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();

    await withRestrictedRuntimeApp(async (app) => {
      const companyResponse = await request(app)
        .post('/api/v1/users/me/avatar')
        .set('Authorization', `Bearer ${company.body.accessToken}`)
        .attach('avatar', image, 'avatar.png');
      const tenantlessResponse = await request(app)
        .post('/api/v1/users/me/avatar')
        .set('Authorization', `Bearer ${tenantless.body.accessToken}`)
        .attach('avatar', image, 'avatar.png');

      expect(companyResponse.status).toBe(200);
      expect(companyResponse.body).toMatchObject({
        id: company.body.user.id,
        tenantId: company.body.user.tenantId,
        tenantName: 'Restricted Avatar Tenant',
      });
      expect(companyResponse.body.avatarUrl).toMatch(/\/avatars\/.*\.webp$/);
      expect(tenantlessResponse.status).toBe(200);
      expect(tenantlessResponse.body).toMatchObject({
        id: tenantless.body.user.id,
        tenantId: null,
        tenantName: null,
        tenantLogoUrl: null,
      });
      expect(tenantlessResponse.body.avatarUrl).toMatch(/\/avatars\/.*\.webp$/);
    });

    expect(await prisma.user.findUniqueOrThrow({ where: { id: other.body.user.id } })).toMatchObject({
      fullName: 'Unchanged Avatar User',
      avatarUrl: null,
    });
  });

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
