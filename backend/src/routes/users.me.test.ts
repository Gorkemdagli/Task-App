import { beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import sharp from 'sharp';
import request from 'supertest';
import { createApp } from '../app';
import { withTenantContext } from '../db/withTenant';
import { env } from '../env';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { verifyAccessToken, verifyRefreshToken } from '../lib/jwt';
import { registerIssuedTokens } from '../lib/sessionStore';
import { acceptInvitation } from '../services/company-invitations.service';
import * as profileService from '../services/profile.service';
import type * as MediaStorage from '../lib/mediaStorage';

declare module 'vitest' {
  export interface ProvidedContext {
    taskflowAppPassword: string;
  }
}

async function cleanDb() {
  await prisma.taskComment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.companyInvitation.deleteMany();
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
  vi.doMock('../lib/prisma', () => ({
    prisma: runtimePrisma,
    getRuntimePoolSnapshot: () => ({
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
      connectCount: 0,
      acquireCount: 0,
      removeCount: 0,
    }),
  }));
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
    vi.doMock('../lib/prisma', () => ({
      prisma: runtimePrisma,
      getRuntimePoolSnapshot: () => ({
        totalCount: 0,
        idleCount: 0,
        waitingCount: 0,
        connectCount: 0,
        acquireCount: 0,
        removeCount: 0,
      }),
    }));
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

describe('DELETE /api/v1/users/me', () => {
  beforeEach(cleanDb);

  it('requires authentication and an exact email confirmation, ignoring any supplied target ID', async () => {
    const account = await registerUser({ email: 'delete-owner@example.com' });
    const other = await registerUser({ email: 'delete-other@example.com' });

    expect(
      (await request(createApp()).delete('/api/v1/users/me').send({
        confirmationEmail: 'delete-owner@example.com',
      })).status,
    ).toBe(401);

    const wrongEmail = await request(createApp())
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${account.body.accessToken}`)
      .send({ confirmationEmail: 'delete-other@example.com' });
    expect(wrongEmail.status).toBe(400);
    expect(wrongEmail.body.error).toBe('CONFIRMATION_EMAIL_MISMATCH');

    const injectedTarget = await request(createApp())
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${account.body.accessToken}`)
      .send({ confirmationEmail: 'delete-owner@example.com', userId: other.body.user.id });
    expect(injectedTarget.status).toBe(400);

    expect((await prisma.user.findUniqueOrThrow({ where: { id: account.body.user.id } })).deletedAt)
      .toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.body.user.id } })).deletedAt)
      .toBeNull();
  });

  it('blocks deleting the last active company admin', async () => {
    const account = await registerUser({
      email: 'last-admin@example.com',
      companyName: 'Last Admin Company',
    });

    const response = await request(createApp())
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${account.body.accessToken}`)
      .send({ confirmationEmail: 'last-admin@example.com' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('LAST_COMPANY_ADMIN_REQUIRED');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: account.body.user.id } })).deletedAt)
      .toBeNull();
  });

  it('serializes self-deletion with company-admin demotion so one active admin remains', async () => {
    const account = await registerUser({
      email: 'concurrent-delete@example.com',
      companyName: 'Concurrent Admin Company',
    });
    const secondAdmin = await prisma.user.create({
      data: {
        tenantId: account.body.user.tenantId,
        email: 'concurrent-second-admin@example.com',
        fullName: 'Second Admin',
        passwordHash: 'not-used',
        displayId: `DEL-${randomUUID()}`,
        role: 'companyAdmin',
      },
    });

    const [deletion, demotion] = await Promise.all([
      request(createApp())
        .delete('/api/v1/users/me')
        .set('Authorization', `Bearer ${account.body.accessToken}`)
        .send({ confirmationEmail: 'concurrent-delete@example.com' }),
      request(createApp())
        .patch(`/api/v1/users/${secondAdmin.id}/permissions`)
        .set('Authorization', `Bearer ${account.body.accessToken}`)
        .send({ role: 'member', teamRoles: [] }),
    ]);

    expect([deletion.status, demotion.status].filter((status) => status < 300)).toHaveLength(1);
    expect(
      await prisma.user.count({
        where: { tenantId: account.body.user.tenantId, role: 'companyAdmin', deletedAt: null },
      }),
    ).toBe(1);
  });

  it('anonymizes the account and preserves shared records and author labels', async () => {
    const account = await registerUser({
      fullName: 'Delete Me',
      email: 'preserve-account@example.com',
      companyName: 'Preserved Content Company',
    });
    const otherTenant = await registerUser({
      fullName: 'Other Tenant Admin',
      email: 'other-tenant-admin@example.com',
      companyName: 'Unchanged Other Company',
    });
    const secondAdmin = await prisma.user.create({
      data: {
        tenantId: account.body.user.tenantId,
        email: 'preserved-second-admin@example.com',
        fullName: 'Second Admin',
        passwordHash: 'not-used',
        displayId: `DEL-${randomUUID()}`,
        role: 'companyAdmin',
      },
    });
    const retainedInvitation = await prisma.companyInvitation.create({
      data: {
        tenantId: account.body.user.tenantId!,
        recipientUserId: secondAdmin.id,
        invitedByUserId: account.body.user.id,
        companyName: 'Preserved Content Company',
        inviterName: 'Historic Inviter Snapshot',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const team = await prisma.team.create({
      data: { tenantId: account.body.user.tenantId, name: 'Preserved Team' },
    });
    await prisma.teamMember.create({
      data: { teamId: team.id, userId: account.body.user.id, role: 'teamAdmin' },
    });
    const task = await prisma.task.create({
      data: {
        teamId: team.id,
        title: 'Preserved task',
        priority: 'medium',
        assignerId: account.body.user.id,
        pendingStatus: 'done',
        pendingVersion: 1,
        pendingProposedBy: secondAdmin.id,
        pendingProposedAt: new Date(),
        assignees: { create: { userId: account.body.user.id } },
      },
    });
    await prisma.taskStatusAck.create({
      data: {
        taskId: task.id,
        userId: secondAdmin.id,
        proposedStatus: 'done',
        pendingVersion: 1,
      },
    });
    await prisma.taskComment.create({
      data: { taskId: task.id, authorId: account.body.user.id, body: 'Retained comment' },
    });
    await prisma.taskFile.create({
      data: {
        tenantId: account.body.user.tenantId,
        taskId: task.id,
        uploaderId: account.body.user.id,
        originalName: 'retained.txt',
        objectPath: `${account.body.user.tenantId}/${task.id}/retained.txt`,
        mimeType: 'text/plain',
        sizeBytes: 8,
      },
    });
    await prisma.message.create({
      data: {
        senderId: account.body.user.id,
        receiverId: secondAdmin.id,
        body: 'Retained message',
      },
    });
    await prisma.taskEvent.create({
      data: { taskId: task.id, actorId: account.body.user.id, eventType: 'task_created' },
    });

    const cookie = account.headers['set-cookie']![0];
    const refreshToken = cookie.match(/refreshToken=([^;]+)/)![1];
    const accessPayload = verifyAccessToken(account.body.accessToken);
    const refreshPayload = verifyRefreshToken(refreshToken);
    const session = JSON.parse((await redis.get(`session:${refreshPayload.jti}`))!);

    const deleted = await withRestrictedRuntimeApp((app) =>
      request(app)
        .delete('/api/v1/users/me')
        .set('Authorization', `Bearer ${account.body.accessToken}`)
        .send({ confirmationEmail: 'preserve-account@example.com' }),
    );

    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ deleted: true });
    expect(deleted.headers['set-cookie']?.[0]).toMatch(/refreshToken=;/);

    const tombstone = await prisma.user.findUniqueOrThrow({
      where: { id: account.body.user.id },
    });
    expect(tombstone).toMatchObject({
      tenantId: account.body.user.tenantId,
      fullName: 'Silinmiş kullanıcı',
      role: 'member',
      avatarUrl: null,
    });
    expect(tombstone.deletedAt).toBeInstanceOf(Date);
    expect(tombstone.email).not.toBe('preserve-account@example.com');
    expect(tombstone.displayId).not.toBe(account.body.user.displayId);
    expect(await prisma.teamMember.count({ where: { userId: tombstone.id } })).toBe(0);
    expect(
      await prisma.companyInvitation.findUniqueOrThrow({ where: { id: retainedInvitation.id } }),
    ).toMatchObject({
      inviterName: 'Historic Inviter Snapshot',
      invitedByUserId: tombstone.id,
      status: 'pending',
    });

    const retainedTask = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      include: {
        assigner: true,
        assignees: { include: { user: true } },
        comments: { include: { author: true } },
        files: { include: { uploader: true } },
      },
    });
    expect(retainedTask.assigner.fullName).toBe('Silinmiş kullanıcı');
    expect(retainedTask.assignees[0].user.fullName).toBe('Silinmiş kullanıcı');
    expect(retainedTask.comments[0]).toMatchObject({
      body: 'Retained comment',
      author: { fullName: 'Silinmiş kullanıcı' },
    });
    expect(retainedTask.files[0]).toMatchObject({
      originalName: 'retained.txt',
      uploader: { fullName: 'Silinmiş kullanıcı' },
    });
    expect(retainedTask.pendingStatus).toBeNull();
    expect(retainedTask.pendingProposedBy).toBeNull();
    expect(await prisma.taskStatusAck.count({ where: { taskId: task.id } })).toBe(0);
    expect(
      await prisma.taskEvent.count({ where: { taskId: task.id, eventType: 'status_change_rejected' } }),
    ).toBe(1);
    expect(
      await prisma.message.findFirstOrThrow({
        where: { senderId: tombstone.id },
        include: { sender: true },
      }),
    ).toMatchObject({ body: 'Retained message', sender: { fullName: 'Silinmiş kullanıcı' } });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: otherTenant.body.user.id } })).deletedAt,
    ).toBeNull();

    // Recreate the old Redis session to prove the database tombstone is still authoritative.
    await redis.del(`blacklist:jti:${accessPayload.jti}`, `blacklist:jti:${refreshPayload.jti}`);
    await registerIssuedTokens(
      account.body.accessToken,
      refreshToken,
      tombstone.id,
      session.familyId,
      session.sessionExpiresAt,
    );
    expect(
      (
        await request(createApp())
          .get('/api/v1/users/me')
          .set('Authorization', `Bearer ${account.body.accessToken}`)
      ).status,
    ).toBe(401);
    expect(
      (
        await request(createApp()).post('/api/v1/auth/refresh').set('Cookie', cookie)
      ).status,
    ).toBe(401);
    await redis.del(`session:${refreshPayload.jti}`);
  });
});

describe('POST /api/v1/users/me/company', () => {
  beforeEach(cleanDb);

  it('creates a company for the authenticated companyless account without replacing the account', async () => {
    const account = await registerUser();

    const response = await request(createApp())
      .post('/api/v1/users/me/company')
      .set('Authorization', `Bearer ${account.body.accessToken}`)
      .send({ companyName: 'New Company' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: account.body.user.id,
      email: 'ali-me@example.com',
      tenantName: 'New Company',
      role: 'companyAdmin',
    });
    expect(response.body.tenantId).toEqual(expect.any(String));
    expect(await prisma.user.findUniqueOrThrow({ where: { id: account.body.user.id } })).toMatchObject({
      id: account.body.user.id,
      tenantId: response.body.tenantId,
      email: 'ali-me@example.com',
      role: 'companyAdmin',
      deletedAt: null,
    });
    expect(await prisma.tenant.count()).toBe(1);
  });

  it('requires authentication and rejects invalid company names without writing a tenant', async () => {
    const account = await registerUser();

    expect(
      (await request(createApp()).post('/api/v1/users/me/company').send({ companyName: 'Acme' }))
        .status,
    ).toBe(401);

    const invalid = await request(createApp())
      .post('/api/v1/users/me/company')
      .set('Authorization', `Bearer ${account.body.accessToken}`)
      .send({ companyName: '  ' });

    expect(invalid.status).toBe(400);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: account.body.user.id } })).toMatchObject({
      tenantId: null,
      role: 'member',
    });
    expect(await prisma.tenant.count()).toBe(0);
  });

  it('denies an already-affiliated account and rejects attempts to target another user', async () => {
    const account = await registerUser({ companyName: 'Existing Company' });

    const response = await request(createApp())
      .post('/api/v1/users/me/company')
      .set('Authorization', `Bearer ${account.body.accessToken}`)
      .send({ companyName: 'Another Company' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('COMPANY_ALREADY_ASSIGNED');
    expect(await prisma.tenant.count()).toBe(1);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: account.body.user.id } })).toMatchObject({
      tenantId: account.body.user.tenantId,
      role: 'companyAdmin',
    });

    const target = await registerUser({ email: 'target-companyless@example.com' });
    const injectedTarget = await request(createApp())
      .post('/api/v1/users/me/company')
      .set('Authorization', `Bearer ${account.body.accessToken}`)
      .send({ companyName: 'Injected Target Company', userId: target.body.user.id });

    expect(injectedTarget.status).toBe(400);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: target.body.user.id } })).toMatchObject({
      tenantId: null,
      role: 'member',
    });
  });

  it('returns the registration conflict for duplicate names and leaves the second account companyless', async () => {
    const first = await registerUser();
    const second = await registerUser({ email: 'second-companyless@example.com' });
    const token = `Bearer ${first.body.accessToken}`;
    const create = (accessToken: string, companyName: string) =>
      request(createApp())
        .post('/api/v1/users/me/company')
        .set('Authorization', accessToken)
        .send({ companyName });

    expect((await create(token, 'Unique Company')).status).toBe(200);
    const duplicate = await create(`Bearer ${second.body.accessToken}`, ' Unique   Company ');

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toBe('CONFLICT_SLUG');
    expect(await prisma.tenant.count()).toBe(1);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: second.body.user.id } })).toMatchObject({
      tenantId: null,
      role: 'member',
    });
  });

  it('allows only one concurrent company creation and rolls back the losing tenant', async () => {
    const account = await registerUser();
    const create = (companyName: string) =>
      request(createApp())
        .post('/api/v1/users/me/company')
        .set('Authorization', `Bearer ${account.body.accessToken}`)
        .send({ companyName });

    const responses = await Promise.all([create('Concurrent One'), create('Concurrent Two')]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: account.body.user.id } });
    expect(user).toMatchObject({ role: 'companyAdmin', deletedAt: null });
    expect(await prisma.tenant.count()).toBe(1);
    expect(await prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId! } })).toMatchObject({
      name: expect.stringMatching(/^Concurrent (One|Two)$/),
    });
  });

  it('serializes company creation with invitation acceptance without creating an orphan tenant', async () => {
    const admin = await registerUser({ companyName: 'Invitation Company' });
    const recipient = await registerUser({ email: 'invitation-recipient@example.com' });
    const invitation = await prisma.companyInvitation.create({
      data: {
        tenantId: admin.body.user.tenantId,
        recipientUserId: recipient.body.user.id,
        invitedByUserId: admin.body.user.id,
        companyName: 'Invitation Company',
        inviterName: 'Ali',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const [companyCreation, invitationAcceptance] = await Promise.allSettled([
      profileService.createCompanyForCurrentUser(recipient.body.user.id, {
        companyName: 'Recipient Company',
      }),
      withTenantContext(recipient.body.user.id, admin.body.user.tenantId, (tx) =>
        acceptInvitation(tx, recipient.body.user, invitation.id),
      ),
    ]);

    expect([companyCreation.status, invitationAcceptance.status].filter((status) => status === 'fulfilled'))
      .toHaveLength(1);
    const recipientUser = await prisma.user.findUniqueOrThrow({
      where: { id: recipient.body.user.id },
    });
    expect(recipientUser.tenantId).not.toBeNull();
    const currentInvitation = await prisma.companyInvitation.findUniqueOrThrow({
      where: { id: invitation.id },
    });
    if (companyCreation.status === 'fulfilled') {
      expect(recipientUser).toMatchObject({ role: 'companyAdmin' });
      expect(currentInvitation.status).toBe('expired');
      expect(
        (
          await prisma.tenant.findMany({
            select: { name: true },
            orderBy: { name: 'asc' },
          })
        ).map(({ name }) => name),
      ).toEqual(['Invitation Company', 'Recipient Company']);
    } else {
      expect(recipientUser).toMatchObject({ tenantId: admin.body.user.tenantId, role: 'member' });
      expect(currentInvitation.status).toBe('accepted');
      expect((await prisma.tenant.findMany({ select: { name: true } })).map(({ name }) => name)).toEqual([
        'Invitation Company',
      ]);
    }
  });
});
