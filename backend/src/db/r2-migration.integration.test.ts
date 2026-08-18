import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';

const tenantId = randomUUID();
const userId = randomUUID();
const teamId = randomUUID();
const taskId = randomUUID();

describe('R2 role and pending-version migration', () => {
  beforeAll(async () => {
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: 'R2 Migration Tenant',
        slug: `r2-${tenantId}`,
        nameKey: `r2-${tenantId}`,
      },
    });
    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        email: `r2-${userId}@test.com`,
        fullName: 'R2 Migration User',
        passwordHash: 'test',
        displayId: `R2-${userId.slice(0, 8)}`,
        role: 'member',
      },
    });
    await prisma.team.create({
      data: { id: teamId, tenantId, name: 'R2 Migration Team' },
    });
    await prisma.teamMember.create({
      data: { teamId, userId, role: 'teamAdmin' },
    });
    await prisma.task.create({
      data: {
        id: taskId,
        teamId,
        title: 'R2 Migration Task',
        assignerId: userId,
      },
    });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } });
  });

  it('restricts global roles and adds pending versions', async () => {
    const roles = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT enumlabel
      FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'UserRole'
      ORDER BY enumsortorder
    `;

    expect(roles.map((row) => row.enumlabel)).toEqual(['member', 'companyAdmin']);

    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.pendingVersion).toBe(0);

    const ack = await prisma.taskStatusAck.create({
      data: {
        taskId,
        userId,
        proposedStatus: 'done',
        pendingVersion: 1,
      },
    });
    expect(ack.pendingVersion).toBe(1);

    await expect(
      prisma.taskStatusAck.create({
        data: {
          taskId,
          userId,
          proposedStatus: 'done',
          pendingVersion: 1,
        },
      }),
    ).rejects.toBeDefined();

    await expect(prisma.user.findUniqueOrThrow({ where: { id: userId } })).resolves.toMatchObject({
      role: 'member',
    });
    await expect(
      prisma.teamMember.findUniqueOrThrow({ where: { teamId_userId: { teamId, userId } } }),
    ).resolves.toMatchObject({ role: 'teamAdmin' });
  });
});
