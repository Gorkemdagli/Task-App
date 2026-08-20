import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { withTenantContext } from './withTenant';
import type { TenantDb } from './types';

const tenantAId = randomUUID();
const tenantBId = randomUUID();
const userAId = randomUUID();
const userBId = randomUUID();
const tenantlessUserId = randomUUID();
const teamAId = randomUUID();
const teamBId = randomUUID();
const taskAId = randomUUID();
const taskBId = randomUUID();

async function asTenant<T>(
  tenantId: string,
  userId: string,
  work: (db: TenantDb) => Promise<T>,
): Promise<T> {
  return withTenantContext(userId, tenantId, work);
}

describe('RLS tenant isolation for task relations', () => {
  beforeAll(async () => {
    await prisma.tenant.createMany({
      data: [
        {
          id: tenantAId,
          name: 'Tenant A',
          slug: `r1-a-${tenantAId}`,
          nameKey: `r1-a-${tenantAId}`,
        },
        {
          id: tenantBId,
          name: 'Tenant B',
          slug: `r1-b-${tenantBId}`,
          nameKey: `r1-b-${tenantBId}`,
        },
      ],
    });
    await prisma.user.createMany({
      data: [
        {
          id: userAId,
          tenantId: tenantAId,
          email: `r1-a-${userAId}@test.com`,
          fullName: 'R1 A',
          passwordHash: 'test',
          displayId: `#R1A-${userAId.slice(0, 8)}`,
          role: 'companyAdmin',
        },
        {
          id: userBId,
          tenantId: tenantBId,
          email: `r1-b-${userBId}@test.com`,
          fullName: 'R1 B',
          passwordHash: 'test',
          displayId: `#R1B-${userBId.slice(0, 8)}`,
          role: 'companyAdmin',
        },
        {
          id: tenantlessUserId,
          tenantId: null,
          email: `r1-tenantless-${tenantlessUserId}@test.com`,
          fullName: 'R1 Tenantless',
          passwordHash: 'test',
          displayId: `R1TL${tenantlessUserId.slice(0, 6)}`,
          role: 'member',
        },
      ],
    });
    await prisma.team.createMany({
      data: [
        { id: teamAId, tenantId: tenantAId, name: 'Team A' },
        { id: teamBId, tenantId: tenantBId, name: 'Team B' },
      ],
    });
    await prisma.task.createMany({
      data: [
        { id: taskAId, teamId: teamAId, title: 'Task A', assignerId: userAId },
        { id: taskBId, teamId: teamBId, title: 'Task B', assignerId: userBId },
      ],
    });
    await prisma.taskAssignee.createMany({
      data: [
        { taskId: taskAId, userId: userAId },
        { taskId: taskBId, userId: userBId },
      ],
    });
    await prisma.taskStatusAck.createMany({
      data: [
        { taskId: taskAId, userId: userAId, proposedStatus: 'done', pendingVersion: 0 },
        { taskId: taskBId, userId: userBId, proposedStatus: 'done', pendingVersion: 0 },
      ],
    });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  });

  it('tenant A child reads exclude B and cross-tenant writes cannot pass policy', async () => {
    const assignees = await asTenant(tenantAId, userAId, (db) =>
      db.taskAssignee.findMany({ orderBy: { taskId: 'asc' } }),
    );
    const acks = await asTenant(tenantAId, userAId, (db) =>
      db.taskStatusAck.findMany({ orderBy: { taskId: 'asc' } }),
    );

    expect(assignees.map((row) => row.taskId)).toEqual([taskAId]);
    expect(acks.map((row) => row.taskId)).toEqual([taskAId]);

    await expect(
      asTenant(tenantAId, userAId, (db) =>
        db.taskAssignee.create({ data: { taskId: taskBId, userId: userAId } }),
      ),
    ).rejects.toBeDefined();
    await expect(
      asTenant(tenantAId, userAId, (db) =>
        db.taskStatusAck.create({
          data: { taskId: taskBId, userId: userAId, proposedStatus: 'done', pendingVersion: 0 },
        }),
      ),
    ).rejects.toBeDefined();

    const updateResult = await asTenant(tenantAId, userAId, (db) =>
      db.taskAssignee.updateMany({ where: { taskId: taskBId }, data: { userId: userAId } }),
    );
    const deleteResult = await asTenant(tenantAId, userAId, (db) =>
      db.taskStatusAck.deleteMany({ where: { taskId: taskBId } }),
    );
    expect(updateResult.count).toBe(0);
    expect(deleteResult.count).toBe(0);
  });

  it('tenantless users can be claimed by the current tenant', async () => {
    const result = await asTenant(tenantAId, userAId, (db) =>
      db.user.updateMany({
        where: { id: tenantlessUserId, tenantId: null },
        data: { tenantId: tenantAId, role: 'member' },
      }),
    );

    expect(result.count).toBe(1);
  });
});
