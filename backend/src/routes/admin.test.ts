import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { register } from '../services/auth.service';
import { withTenantContext } from '../db/withTenant';
import type { TenantDb } from '../db/types';
import type { Actor } from '../lib/permissions';
import {
  createTeam as createTeamService,
  addMemberByDisplayId as addMemberService,
} from '../services/teams.service';
import { createTask as createTaskService } from '../services/tasks.service';

async function inTenant<T>(actor: Actor, work: (db: TenantDb) => Promise<T>): Promise<T> {
  return withTenantContext(actor.id, actor.tenantId!, work);
}

async function makeExpiredTask(prefix: string, companyName: string) {
  const admin = await register({
    fullName: `${prefix} Admin`,
    email: `${prefix.toLowerCase()}-admin@example.com`,
    password: 'hunter22',
    companyName,
  });
  const member = await register({
    fullName: `${prefix} Member`,
    email: `${prefix.toLowerCase()}-member@example.com`,
    password: 'hunter22',
  });
  await prisma.user.update({
    where: { id: member.user.id },
    data: { tenantId: admin.user.tenantId, role: 'member' },
  });

  const actor = admin.user as Actor;
  const team = await inTenant(actor, (db) =>
    createTeamService(db, { name: `${prefix} Team` }, actor),
  );
  await inTenant(actor, (db) =>
    addMemberService(db, team.id, member.user.displayId, actor),
  );
  const task = await inTenant(actor, (db) =>
    createTaskService(
      db,
      { title: `${prefix} expired`, priority: 'low', assigneeIds: [member.user.id], teamId: team.id },
      actor,
    ),
  );
  await prisma.task.update({
    where: { id: task.id },
    data: { status: 'done', deadline: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
  });

  return { admin, task };
}

async function cleanDb() {
  await prisma.taskComment.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.task.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  const keys = await redis.keys('blacklist:jti:*');
  if (keys.length) await redis.del(...keys);
  const sessions = await redis.keys('session:*');
  if (sessions.length) await redis.del(...sessions);
}

describe('admin task archive route', () => {
  beforeEach(cleanDb);

  it('allows a Company Admin to archive expired tasks in their tenant', async () => {
    const { admin, task: tenantTask } = await makeExpiredTask('Archive A', 'Archive Acme');
    const { task: foreignTask } = await makeExpiredTask('Archive B', 'Archive Globex');

    const response = await request(createApp())
      .post('/api/v1/admin/tasks/archive-expired')
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ archivedCount: 1 });
    const [tenantArchived, foreignArchived] = await Promise.all([
      prisma.task.findUnique({ where: { id: tenantTask.id }, select: { archivedAt: true } }),
      prisma.task.findUnique({ where: { id: foreignTask.id }, select: { archivedAt: true } }),
    ]);
    expect(tenantArchived?.archivedAt).not.toBeNull();
    expect(foreignArchived?.archivedAt).toBeNull();
  });

  it('denies a Member from archiving expired tasks', async () => {
    const admin = await register({
      fullName: 'Tenant Admin',
      email: 'archive-tenant-admin@example.com',
      password: 'hunter22',
      companyName: 'Archive Tenant',
    });
    const member = await register({
      fullName: 'Archive Member',
      email: 'archive-member@example.com',
      password: 'hunter22',
    });
    await prisma.user.update({
      where: { id: member.user.id },
      data: { tenantId: admin.user.tenantId, role: 'member' },
    });

    const response = await request(createApp())
      .post('/api/v1/admin/tasks/archive-expired')
      .set('Authorization', `Bearer ${member.accessToken}`);

    expect(response.status).toBe(403);
  });
});
