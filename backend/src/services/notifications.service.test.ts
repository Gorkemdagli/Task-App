import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma';
import {
  listNotifications as listNotificationsService,
  markAllRead as markAllReadService,
  markNotificationRead as markNotificationReadService,
} from './notifications.service';
import { withTenantContext } from '../db/withTenant';
import type { TenantDb } from '../db/types';
import type { Actor } from '../lib/permissions';

async function forUser<T>(
  userId: string,
  work: (db: TenantDb, actor: Actor) => Promise<T>,
): Promise<T> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, tenantId: true },
  });
  if (!user.tenantId) throw new Error('test user must have tenant');
  return withTenantContext(user.id, user.tenantId, (db) =>
    work(db, { id: user.id, role: user.role, tenantId: user.tenantId }),
  );
}

const listNotifications = (userId: string, opts: { limit: number; cursor?: string }) =>
  forUser(userId, (db, actor) => listNotificationsService(db, actor, opts));
const markAllRead = (userId: string) =>
  forUser(userId, (db, actor) => markAllReadService(db, actor));
const markNotificationRead = (userId: string, notificationId: string) =>
  forUser(userId, (db, actor) => markNotificationReadService(db, actor, notificationId));

async function cleanDb() {
  // Notification.userId FK → User.id with onDelete: Cascade; tenants/users must die last.
  await prisma.notification.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.user.deleteMany();
}

async function seedTwoUsers(aliceRole: 'member' | 'companyAdmin' = 'member') {
  const tenant = await prisma.tenant.create({
    data: { name: 'Acme', slug: 'acme', nameKey: 'acme' },
  });
  const alice = await prisma.user.create({
    data: {
      email: 'alice@x.com',
      passwordHash: 'h',
      fullName: 'Alice',
      displayId: 'ALICE1',
      role: aliceRole,
      tenantId: tenant.id,
    },
  });
  const bob = await prisma.user.create({
    data: {
      email: 'bob@x.com',
      passwordHash: 'h',
      fullName: 'Bob',
      displayId: 'BOBBIN1',
      role: 'member',
      tenantId: tenant.id,
    },
  });
  return { tenant, alice, bob };
}

describe('listNotifications', () => {
  beforeEach(cleanDb);

  it('returns only own notifications, DESC by createdAt', async () => {
    const { alice, bob } = await seedTwoUsers();
    const older = await prisma.notification.create({
      data: { userId: alice.id, type: 'task_assigned', payload: { taskId: 't1' } },
    });
    // Bump createdAt so DESC ordering is observable.
    await new Promise((r) => setTimeout(r, 5));
    const newer = await prisma.notification.create({
      data: { userId: alice.id, type: 'task_commented', payload: { taskId: 't2' } },
    });
    await prisma.notification.create({
      data: { userId: bob.id, type: 'message_received', payload: { msg: 'hi' } },
    });

    const res = await listNotifications(alice.id, { limit: 10 });
    expect(res.items.map((n) => n.id)).toEqual([newer.id, older.id]);
    expect(res.items.every((n) => n.userId === alice.id)).toBe(true);
    expect(res.unreadCount).toBe(2);
    expect(res.nextCursor).toBeNull();
  });

  it('hides disallowed stored notification types from company admin pages and counts', async () => {
    const { alice } = await seedTwoUsers('companyAdmin');
    const types = [
      'task_assigned',
      'task_commented',
      'message_received',
      'task_status_pending',
      'task_status_changed',
      'company_invite_accepted',
      'company_invite_rejected',
    ] as const;
    for (const type of types) {
      await prisma.notification.create({ data: { userId: alice.id, type, payload: {} } });
    }

    const result = await listNotifications(alice.id, { limit: 10 });
    expect(result.items.map((notification) => notification.type).sort()).toEqual(
      ['company_invite_accepted', 'company_invite_rejected', 'task_status_changed'].sort(),
    );
    expect(result.unreadCount).toBe(3);
    expect(result.nextCursor).toBeNull();

    await markAllRead(alice.id);
    const stored = await prisma.notification.findMany({ where: { userId: alice.id } });
    const allowed = new Set<string>([
      'company_invite_accepted',
      'company_invite_rejected',
      'task_status_changed',
    ]);
    expect(
      stored
        .filter((notification) => !allowed.has(notification.type))
        .every((notification) => notification.readAt === null),
    ).toBe(true);
  });

  it('excludes read notifications from unreadCount', async () => {
    const { alice } = await seedTwoUsers();
    await prisma.notification.create({
      data: { userId: alice.id, type: 'task_assigned', payload: {} },
    });
    await prisma.notification.create({
      data: {
        userId: alice.id,
        type: 'task_assigned',
        payload: {},
        readAt: new Date(),
      },
    });

    const res = await listNotifications(alice.id, { limit: 10 });
    expect(res.unreadCount).toBe(1);
    expect(res.items).toHaveLength(2);
  });

  it('orders same-timestamp notifications by id descending', async () => {
    const { alice } = await seedTwoUsers();
    const createdAt = new Date('2026-09-21T00:00:00.000Z');
    const olderId = '00000000-0000-0000-0000-000000000001';
    const newerId = '00000000-0000-0000-0000-000000000002';
    await prisma.notification.create({
      data: { id: olderId, userId: alice.id, type: 'task_assigned', payload: {}, createdAt },
    });
    await prisma.notification.create({
      data: { id: newerId, userId: alice.id, type: 'task_assigned', payload: {}, createdAt },
    });

    const res = await listNotifications(alice.id, { limit: 10 });
    expect(res.items.map((n) => n.id)).toEqual([newerId, olderId]);
  });

  it('paginates with cursor — next page starts after cursor, no overlap', async () => {
    const { alice } = await seedTwoUsers();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const n = await prisma.notification.create({
        data: { userId: alice.id, type: 'task_assigned', payload: { i } },
      });
      ids.push(n.id);
      if (i < 4) await new Promise((r) => setTimeout(r, 5));
    }
    // Created order: ids[0] (oldest) ... ids[4] (newest). DESC: ids[4], ids[3], ids[2], ids[1], ids[0].

    const page1 = await listNotifications(alice.id, { limit: 2 });
    expect(page1.items.map((n) => n.id)).toEqual([ids[4], ids[3]]);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listNotifications(alice.id, {
      limit: 2,
      cursor: page1.nextCursor ?? undefined,
    });
    expect(page2.items.map((n) => n.id)).toEqual([ids[2], ids[1]]);
    expect(page2.nextCursor).not.toBeNull();

    const page3 = await listNotifications(alice.id, {
      limit: 2,
      cursor: page2.nextCursor ?? undefined,
    });
    expect(page3.items.map((n) => n.id)).toEqual([ids[0]]);
    expect(page3.nextCursor).toBeNull();
  });

  it('handles malformed cursor gracefully (returns first page)', async () => {
    const { alice } = await seedTwoUsers();
    await prisma.notification.create({
      data: { userId: alice.id, type: 'task_assigned', payload: {} },
    });

    const res = await listNotifications(alice.id, {
      limit: 10,
      cursor: 'this-is-not-base64-or-json',
    });
    expect(res.items).toHaveLength(1);
    expect(res.nextCursor).toBeNull();
  });
});

describe('markAllRead', () => {
  beforeEach(cleanDb);

  it('sets readAt for all unread of user, returns count', async () => {
    const { alice } = await seedTwoUsers();
    await prisma.notification.create({
      data: { userId: alice.id, type: 'task_assigned', payload: {} },
    });
    await prisma.notification.create({
      data: { userId: alice.id, type: 'task_commented', payload: {} },
    });

    const count = await markAllRead(alice.id);
    expect(count).toBe(2);

    const unread = await prisma.notification.count({
      where: { userId: alice.id, readAt: null },
    });
    expect(unread).toBe(0);
  });

  it('does not affect other users', async () => {
    const { alice, bob } = await seedTwoUsers();
    await prisma.notification.create({
      data: { userId: alice.id, type: 'task_assigned', payload: {} },
    });
    await prisma.notification.create({
      data: { userId: bob.id, type: 'task_assigned', payload: {} },
    });

    const count = await markAllRead(alice.id);
    expect(count).toBe(1);

    const bobUnread = await prisma.notification.count({
      where: { userId: bob.id, readAt: null },
    });
    expect(bobUnread).toBe(1);
  });

  it('is idempotent — running twice returns 0 second time', async () => {
    const { alice } = await seedTwoUsers();
    await prisma.notification.create({
      data: { userId: alice.id, type: 'task_assigned', payload: {} },
    });

    const first = await markAllRead(alice.id);
    expect(first).toBe(1);

    const second = await markAllRead(alice.id);
    expect(second).toBe(0);
  });
});

describe('markNotificationRead', () => {
  beforeEach(cleanDb);

  it('sets readAt only for requested own notification', async () => {
    const { alice } = await seedTwoUsers();
    const target = await prisma.notification.create({
      data: { userId: alice.id, type: 'task_assigned', payload: {} },
    });
    const untouched = await prisma.notification.create({
      data: { userId: alice.id, type: 'task_commented', payload: {} },
    });

    await markNotificationRead(alice.id, target.id);

    const rows = await prisma.notification.findMany({
      where: { id: { in: [target.id, untouched.id] } },
    });
    expect(rows.find((row) => row.id === target.id)?.readAt).not.toBeNull();
    expect(rows.find((row) => row.id === untouched.id)?.readAt).toBeNull();
  });

  it('is idempotent and preserves first readAt timestamp', async () => {
    const { alice } = await seedTwoUsers();
    const target = await prisma.notification.create({
      data: { userId: alice.id, type: 'task_assigned', payload: {} },
    });

    await markNotificationRead(alice.id, target.id);
    const first = await prisma.notification.findUniqueOrThrow({ where: { id: target.id } });
    await markNotificationRead(alice.id, target.id);
    const second = await prisma.notification.findUniqueOrThrow({ where: { id: target.id } });

    expect(second.readAt?.toISOString()).toBe(first.readAt?.toISOString());
  });

  it('returns 404 for another user notification without modifying it', async () => {
    const { alice, bob } = await seedTwoUsers();
    const target = await prisma.notification.create({
      data: { userId: bob.id, type: 'task_assigned', payload: {} },
    });

    await expect(markNotificationRead(alice.id, target.id)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOTIFICATION_NOT_FOUND',
    });

    const stored = await prisma.notification.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.readAt).toBeNull();
  });

  it('returns 404 without marking a disallowed stored notification for company admin', async () => {
    const { alice } = await seedTwoUsers('companyAdmin');
    const target = await prisma.notification.create({
      data: { userId: alice.id, type: 'task_commented', payload: {} },
    });

    await expect(markNotificationRead(alice.id, target.id)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOTIFICATION_NOT_FOUND',
    });

    const stored = await prisma.notification.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.readAt).toBeNull();
  });

  it('returns 404 for unknown notification id', async () => {
    const { alice } = await seedTwoUsers();
    await expect(
      markNotificationRead(alice.id, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOTIFICATION_NOT_FOUND' });
  });
});
