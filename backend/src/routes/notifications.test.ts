import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { signAccessToken } from '../lib/jwt';

async function cleanDb() {
  // Notification.userId FK → User.id with onDelete: Cascade; tenants/users must die last.
  await prisma.notification.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.task.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
}

async function seedUser(opts: { name?: string; withNotifications?: number } = {}) {
  const tenant = await prisma.tenant.create({ data: { name: 'Acme', slug: 'acme' } });
  const user = await prisma.user.create({
    data: {
      email: 'a@x.com',
      passwordHash: 'h',
      fullName: opts.name ?? 'Alice',
      displayId: 'ALICE1',
      role: 'member',
      tenantId: tenant.id,
    },
  });
  const count = opts.withNotifications ?? 1;
  for (let i = 0; i < count; i++) {
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'task_assigned',
        payload: { taskId: `t${i}`, taskTitle: `T${i}` },
      },
    });
    // DESC ordering observable only when createdAt is distinct.
    if (i < count - 1) await new Promise((r) => setTimeout(r, 5));
  }
  const token = signAccessToken(user.id, user.tenantId);
  return { tenant, user, token };
}

describe('GET /api/v1/notifications', () => {
  beforeEach(cleanDb);

  it('401 without auth', async () => {
    const r = await request(createApp()).get('/api/v1/notifications');
    expect(r.status).toBe(401);
  });

  it('200 returns { items, unreadCount, nextCursor }', async () => {
    const { token } = await seedUser({ withNotifications: 1 });
    const r = await request(createApp())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('items');
    expect(r.body).toHaveProperty('unreadCount');
    expect(r.body).toHaveProperty('nextCursor');
    expect(Array.isArray(r.body.items)).toBe(true);
    expect(r.body.items).toHaveLength(1);
    expect(r.body.unreadCount).toBe(1);
  });

  it('returns nextCursor when more pages exist (limit=1, 3 items)', async () => {
    const { token } = await seedUser({ withNotifications: 3 });
    const r = await request(createApp())
      .get('/api/v1/notifications?limit=1')
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(1);
    expect(typeof r.body.nextCursor).toBe('string');
    expect(r.body.nextCursor.length).toBeGreaterThan(0);
  });

  it('400 when limit > 50', async () => {
    const { token } = await seedUser({ withNotifications: 1 });
    const r = await request(createApp())
      .get('/api/v1/notifications?limit=100')
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Bad Request');
    expect(Array.isArray(r.body.issues)).toBe(true);
  });
});

describe('PATCH /api/v1/notifications/read-all', () => {
  beforeEach(cleanDb);

  it('401 without auth', async () => {
    const r = await request(createApp()).patch('/api/v1/notifications/read-all');
    expect(r.status).toBe(401);
  });

  it('204 marks all unread as read for the calling user', async () => {
    const { user, token } = await seedUser({ withNotifications: 3 });
    const r = await request(createApp())
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(204);

    const unread = await prisma.notification.count({
      where: { userId: user.id, readAt: null },
    });
    expect(unread).toBe(0);

    const allReadAt = await prisma.notification.findMany({
      where: { userId: user.id },
      select: { readAt: true },
    });
    expect(allReadAt.every((n) => n.readAt !== null)).toBe(true);
  });
});

describe('PATCH /api/v1/notifications/:id/read', () => {
  beforeEach(cleanDb);

  it('401 without auth', async () => {
    const r = await request(createApp()).patch(
      '/api/v1/notifications/00000000-0000-0000-0000-000000000000/read',
    );
    expect(r.status).toBe(401);
  });

  it('204 marks calling user notification as read', async () => {
    const { user, token } = await seedUser({ withNotifications: 1 });
    const target = await prisma.notification.findFirstOrThrow({ where: { userId: user.id } });

    const r = await request(createApp())
      .patch(`/api/v1/notifications/${target.id}/read`)
      .set('Authorization', `Bearer ${token}`);

    expect(r.status).toBe(204);
    const stored = await prisma.notification.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.readAt).not.toBeNull();
  });

  it('is idempotent and preserves existing readAt', async () => {
    const { user, token } = await seedUser({ withNotifications: 1 });
    const target = await prisma.notification.findFirstOrThrow({ where: { userId: user.id } });
    const first = await request(createApp())
      .patch(`/api/v1/notifications/${target.id}/read`)
      .set('Authorization', `Bearer ${token}`);
    expect(first.status).toBe(204);
    const firstReadAt = (await prisma.notification.findUniqueOrThrow({ where: { id: target.id } }))
      .readAt;

    const second = await request(createApp())
      .patch(`/api/v1/notifications/${target.id}/read`)
      .set('Authorization', `Bearer ${token}`);
    expect(second.status).toBe(204);
    const secondReadAt = (await prisma.notification.findUniqueOrThrow({ where: { id: target.id } }))
      .readAt;
    expect(secondReadAt?.toISOString()).toBe(firstReadAt?.toISOString());
  });

  it('404 for another user notification in same tenant', async () => {
    const { tenant, token } = await seedUser({ withNotifications: 0 });
    const other = await prisma.user.create({
      data: {
        email: 'other@x.com',
        passwordHash: 'h',
        fullName: 'Other',
        displayId: 'OTHER1',
        role: 'member',
        tenantId: tenant.id,
      },
    });
    const target = await prisma.notification.create({
      data: { userId: other.id, type: 'task_assigned', payload: {} },
    });

    const r = await request(createApp())
      .patch(`/api/v1/notifications/${target.id}/read`)
      .set('Authorization', `Bearer ${token}`);

    expect(r.status).toBe(404);
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: target.id } })).readAt,
    ).toBeNull();
  });

  it('404 for another tenant notification', async () => {
    const { token } = await seedUser({ withNotifications: 0 });
    const otherTenant = await prisma.tenant.create({
      data: { name: 'Other Tenant', slug: 'other-tenant' },
    });
    const other = await prisma.user.create({
      data: {
        email: 'other@other.com',
        passwordHash: 'h',
        fullName: 'Other Tenant User',
        displayId: 'OTHER2',
        role: 'member',
        tenantId: otherTenant.id,
      },
    });
    const target = await prisma.notification.create({
      data: { userId: other.id, type: 'task_assigned', payload: {} },
    });

    const r = await request(createApp())
      .patch(`/api/v1/notifications/${target.id}/read`)
      .set('Authorization', `Bearer ${token}`);

    expect(r.status).toBe(404);
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: target.id } })).readAt,
    ).toBeNull();
  });

  it('404 for unknown notification', async () => {
    const { token } = await seedUser({ withNotifications: 0 });
    const r = await request(createApp())
      .patch('/api/v1/notifications/00000000-0000-0000-0000-000000000000/read')
      .set('Authorization', `Bearer ${token}`);

    expect(r.status).toBe(404);
    expect(r.body.error).toBe('NOTIFICATION_NOT_FOUND');
  });
});
